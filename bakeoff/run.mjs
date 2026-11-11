// Art bake-off runner. See README.md for usage and the failure modes this file handles.
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { ProviderError, ESTIMATE_USD, sniffFormat, hasAlpha, recraft, gemini, openai, retro } from './providers.mjs';
import { writeReport } from './report.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, 'out');
const RUN_ID = randomUUID().slice(0, 8);
const KEY_ENV = { recraft: 'RECRAFT_API_TOKEN', gemini: 'GEMINI_API_KEY', openai: 'OPENAI_API_KEY', retro: 'RETRO_DIFFUSION_API_KEY' };
const FACTORY = { recraft, gemini, openai, retro };
const NEEDS_BG_REMOVAL = new Set(['recraft', 'gemini']); // no native transparent output
const CONCURRENCY = 2;
const CATEGORY_SUFFIX = {
  icon: 'single centered object, game item icon, no text, no border, plain light background',
  character: 'one full-body character, centered, three-quarter view, no text, plain light background',
  scene: 'game background scene, no text, no UI elements',
};
const STYLE_REF_HINT = 'Use the attached image only as an art-style reference: match its line work, palette and shading exactly, but draw the new subject described here. ';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs(argv) {
  const opts = { dryRun: false, only: null, budget: 28 };
  for (const arg of argv) {
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg.startsWith('--only=')) opts.only = new Set(arg.slice(7).split(',').filter(Boolean));
    else if (arg.startsWith('--budget=')) opts.budget = Number(arg.slice(9));
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isFinite(opts.budget) || opts.budget <= 0) throw new Error('--budget must be a positive number of USD');
  return opts;
}

class Ledger {
  constructor(path, budget, spent) {
    this.path = path;
    this.budget = budget;
    this.spent = spent;
    this.reserved = 0;
    this.exhausted = false;
  }
  static async load(path, budget) {
    const prior = existsSync(path) ? JSON.parse(await readFile(path, 'utf8')) : {};
    return new Ledger(path, budget, Number(prior.spent) || 0);
  }
  reserve(usd) {
    if (this.spent + this.reserved + usd > this.budget) {
      this.exhausted = true;
      return false;
    }
    this.reserved += usd;
    return true;
  }
  settle(reservedUsd, actualUsd) {
    this.reserved -= reservedUsd;
    this.spent += actualUsd;
  }
  save() {
    return writeFile(this.path, JSON.stringify({ spent: this.spent, budget: this.budget, updatedAt: new Date().toISOString() }, null, 2));
  }
}

async function withRetry(fn) {
  let transient = 0;
  let rate = 0;
  for (;;) {
    try {
      return await fn(transient + rate);
    } catch (e) {
      if (!(e instanceof ProviderError)) throw e;
      if (e.kind === 'rate_limit' && rate < 3) {
        await sleep(e.retryAfterMs ?? 2000 * 2 ** rate);
        rate++;
      } else if ((e.kind === 'transient' || e.kind === 'no_image') && transient < 2) {
        await sleep(e.retryAfterMs ?? 3000 * 2 ** transient);
        transient++;
      } else {
        throw e;
      }
    }
  }
}

async function pool(items, size, worker) {
  let next = 0;
  const lanes = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) await worker(items[next++]);
  });
  await Promise.all(lanes);
}

const seedOf = (key) => createHash('sha256').update(key).digest().readUInt32BE(0) & 0x7fffffff;
const comboDir = (style, provider) => join(OUT, style, provider);

function buildPrompt(asset, engine, style) {
  return `${asset.prompt}. Setting: ${engine.theme}. Style: ${style.text}. ${CATEGORY_SUFFIX[asset.category]}.`;
}

function planCombos(spec, only) {
  const combos = [];
  for (const [styleId, style] of Object.entries(spec.styles)) {
    for (const provider of style.providers) {
      if (only && !only.has(provider)) continue;
      const assets = [];
      for (const [engineId, engine] of Object.entries(spec.engines)) {
        for (const asset of engine.assets) assets.push({ engineId, engine, asset });
      }
      combos.push({ styleId, style, provider, assets });
    }
  }
  return combos;
}

function estimateCombo(combo) {
  const gen = ESTIMATE_USD[combo.provider];
  let usd = gen; // anchor
  if (combo.provider === 'recraft') usd += ESTIMATE_USD.recraft_style;
  for (const { asset } of combo.assets) {
    usd += gen;
    if (asset.transparent && NEEDS_BG_REMOVAL.has(combo.provider)) usd += ESTIMATE_USD.recraft_bg;
  }
  return usd;
}

async function readJson(path) {
  return existsSync(path) ? JSON.parse(await readFile(path, 'utf8')) : null;
}

class ProviderRun {
  constructor(name, client, bgClient, ledger) {
    this.name = name;
    this.client = client;
    this.bgClient = bgClient;
    this.ledger = ledger;
    this.stopReason = null;
  }

  stopIfFatal(e) {
    if (e instanceof ProviderError && (e.kind === 'auth' || e.kind === 'balance')) this.stopReason = `${e.kind}: ${e.message}`;
  }

  // Generates one image under a budget reservation; returns { result, latencyMs } or throws.
  async generateBudgeted(estimateUsd, args) {
    if (!this.ledger.reserve(estimateUsd)) throw new ProviderError('budget', 'budget exhausted');
    const started = Date.now();
    try {
      const result = await withRetry((attempt) => this.client.generate({ ...args, idempotencyKey: `${args.key}-${RUN_ID}-${attempt}` }));
      this.ledger.settle(estimateUsd, result.costUsd);
      return { result, latencyMs: Date.now() - started };
    } catch (e) {
      this.ledger.settle(estimateUsd, 0); // failed calls are not billed by these providers (Retro Diffusion refunds)
      this.stopIfFatal(e);
      throw e;
    }
  }

  async removeBackground(bytes) {
    if (!this.bgClient) return { error: 'no Recraft key for background removal' };
    if (!this.ledger.reserve(ESTIMATE_USD.recraft_bg)) return { error: 'budget exhausted before background removal' };
    try {
      const out = await withRetry(() => this.bgClient.removeBackground(bytes));
      this.ledger.settle(ESTIMATE_USD.recraft_bg, out.costUsd);
      return out;
    } catch (e) {
      this.ledger.settle(ESTIMATE_USD.recraft_bg, 0);
      return { error: e.message };
    }
  }
}

async function ensureAnchor(run, combo, spec) {
  const dir = comboDir(combo.styleId, combo.provider);
  const metaPath = join(dir, '_anchor.json');
  const prior = await readJson(metaPath);
  if (prior?.status === 'ok') return prior;

  const meta = { kind: 'anchor', style: combo.styleId, provider: combo.provider, at: new Date().toISOString() };
  try {
    const prompt = `${spec.anchorPrompt}. Style: ${combo.style.text}.`;
    const { result, latencyMs } = await run.generateBudgeted(ESTIMATE_USD[combo.provider], {
      key: `${combo.styleId}/${combo.provider}/_anchor`,
      prompt,
      category: 'scene',
      transparent: false,
      palette: combo.style.palette,
      seed: seedOf(`${combo.styleId}/_anchor`),
    });
    const format = sniffFormat(result.bytes);
    const file = `_anchor.${format}`;
    await writeFile(join(dir, file), result.bytes);
    Object.assign(meta, { status: 'ok', file, model: result.model, costUsd: result.costUsd, costSource: result.costSource, latencyMs });

    if (combo.provider === 'recraft') {
      try {
        if (!run.ledger.reserve(ESTIMATE_USD.recraft_style)) throw new Error('budget exhausted');
        const style = await withRetry(() => run.client.createStyle(result.bytes));
        run.ledger.settle(ESTIMATE_USD.recraft_style, style.costUsd);
        Object.assign(meta, { styleId: style.styleId, styleCostUsd: style.costUsd });
      } catch (e) {
        run.ledger.settle(ESTIMATE_USD.recraft_style, 0);
        meta.styleError = e.message;
      }
    }
  } catch (e) {
    Object.assign(meta, { status: e.kind === 'budget' ? 'skipped_budget' : 'failed', error: e.message });
  }
  await writeFile(metaPath, JSON.stringify(meta, null, 2));
  return meta;
}

async function runAsset(run, combo, anchor, item) {
  const { engineId, engine, asset } = item;
  const dir = join(comboDir(combo.styleId, combo.provider), engineId);
  const metaPath = join(dir, `${asset.id}.json`);
  const prior = await readJson(metaPath);
  if (prior?.status === 'ok') return;

  const key = `${combo.styleId}/${combo.provider}/${engineId}/${asset.id}`;
  const meta = {
    style: combo.styleId, provider: combo.provider, engine: engineId, assetId: asset.id,
    category: asset.category, group: asset.group, transparentRequired: asset.transparent,
    at: new Date().toISOString(), flags: [],
  };

  if (run.stopReason) {
    Object.assign(meta, { status: 'skipped_provider_stopped', error: run.stopReason });
  } else {
    let prompt = buildPrompt(asset, engine, combo.style);
    const refs = [];
    if (anchor?.status === 'ok' && combo.provider === 'gemini') {
      prompt = STYLE_REF_HINT + prompt;
      refs.push(await readFile(join(comboDir(combo.styleId, combo.provider), anchor.file)));
    }
    const styleId = combo.provider === 'recraft' ? anchor?.styleId : undefined;
    if (combo.provider === 'recraft' && !styleId) meta.flags.push('style_fallback');
    meta.prompt = prompt;

    try {
      const { result, latencyMs } = await run.generateBudgeted(ESTIMATE_USD[combo.provider], {
        key, prompt, refs, styleId, palette: combo.style.palette,
        category: asset.category, transparent: asset.transparent, seed: seedOf(key),
      });
      let bytes = result.bytes;
      let alpha = hasAlpha(bytes);
      let bgCostUsd = 0;
      if (asset.transparent && alpha !== true) {
        const bg = await run.removeBackground(bytes);
        if (bg.error) {
          meta.flags.push('needs_bg_removal');
          meta.bgError = bg.error;
        } else {
          bytes = bg.bytes;
          alpha = hasAlpha(bytes);
          bgCostUsd = bg.costUsd;
          meta.flags.push('bg_removed');
        }
      }
      const format = sniffFormat(bytes);
      const file = `${asset.id}.${format}`;
      await writeFile(join(dir, file), bytes);
      Object.assign(meta, {
        status: 'ok', file, format, hasAlpha: alpha, model: result.model,
        costUsd: result.costUsd, bgCostUsd, costSource: result.costSource, latencyMs, raw: result.raw ?? null,
      });
    } catch (e) {
      if (!(e instanceof ProviderError)) throw e;
      const status = { budget: 'skipped_budget', refused: 'refused' }[e.kind] ?? 'failed';
      Object.assign(meta, { status, errorKind: e.kind, error: e.message });
    }
  }
  await writeFile(metaPath, JSON.stringify(meta, null, 2));
  const cost = meta.status === 'ok' ? ` $${(meta.costUsd + meta.bgCostUsd).toFixed(4)} ${(meta.latencyMs / 1000).toFixed(1)}s` : ` ${meta.error?.slice(0, 120) ?? ''}`;
  console.log(`[${combo.provider}] ${key} ${meta.status}${cost}`);
}

async function collectResults(spec) {
  const results = [];
  for (const combo of planCombos(spec, null)) {
    const dir = comboDir(combo.styleId, combo.provider);
    const anchor = await readJson(join(dir, '_anchor.json'));
    if (anchor) results.push(anchor);
    for (const { engineId, asset } of combo.assets) {
      const meta = await readJson(join(dir, engineId, `${asset.id}.json`));
      if (meta) results.push(meta);
    }
  }
  return results;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const envPath = join(ROOT, '.env');
  if (existsSync(envPath)) process.loadEnvFile(envPath);
  const spec = JSON.parse(await readFile(join(ROOT, 'spec.json'), 'utf8'));
  const combos = planCombos(spec, opts.only);
  const keys = Object.fromEntries(Object.entries(KEY_ENV).map(([p, env]) => [p, process.env[env]?.trim() || null]));

  console.log(`Plan: ${combos.length} style×provider combos, ${combos.reduce((n, c) => n + c.assets.length + 1, 0)} images (incl. anchors).`);
  let total = 0;
  for (const c of combos) {
    const usd = estimateCombo(c);
    total += usd;
    console.log(`  ${c.styleId.padEnd(6)} ${c.provider.padEnd(8)} ${String(c.assets.length + 1).padStart(3)} images  ~$${usd.toFixed(2)}  key:${keys[c.provider] ? 'yes' : 'MISSING'}`);
  }
  console.log(`Estimated total: ~$${total.toFixed(2)} (budget $${opts.budget}).`);
  if (opts.dryRun) return;

  await mkdir(OUT, { recursive: true });
  const ledger = await Ledger.load(join(OUT, 'ledger.json'), opts.budget);
  const bgClient = keys.recraft ? recraft(keys.recraft) : null;
  const runs = new Map();
  for (const name of new Set(combos.map((c) => c.provider))) {
    if (!keys[name]) {
      console.log(`[${name}] skipped: ${KEY_ENV[name]} not set`);
      continue;
    }
    runs.set(name, new ProviderRun(name, FACTORY[name](keys[name]), bgClient, ledger));
  }

  const saver = setInterval(() => ledger.save().catch(() => {}), 10_000);
  try {
    await Promise.all([...runs.values()].map(async (run) => {
      for (const combo of combos.filter((c) => c.provider === run.name)) {
        await mkdir(comboDir(combo.styleId, combo.provider), { recursive: true });
        for (const engineId of Object.keys(spec.engines)) await mkdir(join(comboDir(combo.styleId, combo.provider), engineId), { recursive: true });
        const anchor = run.stopReason ? null : await ensureAnchor(run, combo, spec);
        await pool(combo.assets, CONCURRENCY, (item) => runAsset(run, combo, anchor, item));
      }
    }));
  } finally {
    clearInterval(saver);
    await ledger.save();
  }

  const results = await collectResults(spec);
  const missingKeys = Object.entries(keys).filter(([, k]) => !k).map(([p]) => p);
  const summary = { runId: RUN_ID, finishedAt: new Date().toISOString(), spentUsd: ledger.spent, budgetUsd: opts.budget, budgetExhausted: ledger.exhausted, missingKeys };
  await writeFile(join(OUT, 'results.json'), JSON.stringify({ summary, results }, null, 2));
  await writeReport(ROOT, spec, { summary, results });
  for (const run of runs.values()) if (run.stopReason) console.log(`[${run.name}] STOPPED: ${run.stopReason.slice(0, 200)}`);
  console.log(`Spent ~$${ledger.spent.toFixed(2)} of $${opts.budget}${ledger.exhausted ? ' — BUDGET REACHED, results are partial' : ''}. Report: ${join(ROOT, 'report.html')}`);
}

main().catch((e) => {
  console.error(e.stack ?? e.message);
  process.exitCode = 1;
});
