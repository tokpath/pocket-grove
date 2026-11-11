// Builds report.html from out/results.json. Run directly (`node report.mjs`) or via run.mjs.
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CRITERIA = [
  ['consistency', 'Style consistency'],
  ['adherence', 'Prompt adherence'],
  ['usability', 'Usable without retouching'],
  ['aesthetics', 'Fits the cozy adult-casual brand'],
];
const GAME_IMAGES = 25; // images per full game in the pricing model

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const usd = (n) => `$${n.toFixed(n < 0.1 ? 4 : 2)}`;

function summarize(rows) {
  const assets = rows.filter((r) => r.kind !== 'anchor');
  const ok = assets.filter((r) => r.status === 'ok');
  const needAlpha = ok.filter((r) => r.transparentRequired);
  const cost = rows.filter((r) => r.status === 'ok').reduce((s, r) => s + (r.costUsd ?? 0) + (r.bgCostUsd ?? 0) + (r.styleCostUsd ?? 0), 0);
  const assetCost = ok.reduce((s, r) => s + (r.costUsd ?? 0) + (r.bgCostUsd ?? 0), 0);
  const count = (status) => assets.filter((r) => r.status === status).length;
  return {
    ok: ok.length,
    failed: count('failed'),
    refused: count('refused'),
    skipped: assets.filter((r) => r.status?.startsWith('skipped')).length,
    alphaRate: needAlpha.length ? needAlpha.filter((r) => r.hasAlpha === true).length / needAlpha.length : null,
    avgLatency: ok.length ? ok.reduce((s, r) => s + r.latencyMs, 0) / ok.length / 1000 : null,
    cost,
    perImage: ok.length ? assetCost / ok.length : null,
    estimated: rows.some((r) => r.status === 'ok' && String(r.costSource).startsWith('estimate')),
  };
}

function cell(r, src) {
  if (!r) return '<td class="empty">not run</td>';
  if (r.status !== 'ok') return `<td class="bad" title="${esc(r.error)}">${esc(r.status)}<br><small>${esc(r.errorKind ?? '')}</small></td>`;
  const flags = (r.flags ?? []).filter((f) => f !== 'bg_removed');
  const alpha = r.transparentRequired ? (r.hasAlpha ? 'α✓' : 'α✗') : '';
  return `<td><img loading="lazy" src="${esc(src)}" alt="${esc(r.assetId ?? 'anchor')}" title="${esc(r.prompt ?? '')}"><br>`
    + `<small>${usd((r.costUsd ?? 0) + (r.bgCostUsd ?? 0))} · ${(r.latencyMs / 1000).toFixed(1)}s ${alpha} ${esc(flags.join(' '))}</small></td>`;
}

function scoreForm(style, engine, provider) {
  return CRITERIA.map(([key, label]) => {
    const name = `${style}|${engine}|${provider}|${key}`;
    const options = ['', 1, 2, 3, 4, 5].map((v) => `<option value="${v}">${v || '–'}</option>`).join('');
    return `<label>${esc(label)} <select data-score="${esc(name)}">${options}</select></label>`;
  }).join(' ');
}

export function renderReport(spec, { summary, results }) {
  const by = (style, provider) => results.filter((r) => r.style === style && r.provider === provider);
  const providersFor = (style) => spec.styles[style].providers;

  const summaryRows = Object.keys(spec.styles).flatMap((style) => providersFor(style).map((provider) => {
    const s = summarize(by(style, provider));
    return `<tr><td>${esc(spec.styles[style].label)}</td><td>${esc(provider)}</td><td>${s.ok}</td><td>${s.failed}</td><td>${s.refused}</td><td>${s.skipped}</td>`
      + `<td>${s.alphaRate === null ? '–' : `${Math.round(s.alphaRate * 100)}%`}</td><td>${s.avgLatency === null ? '–' : `${s.avgLatency.toFixed(1)}s`}</td>`
      + `<td>${usd(s.cost)}${s.estimated ? '*' : ''}</td><td>${s.perImage === null ? '–' : usd(s.perImage)}</td>`
      + `<td>${s.perImage === null ? '–' : usd(s.perImage * GAME_IMAGES)}</td></tr>`;
  })).join('');

  const sections = Object.entries(spec.styles).map(([style, styleDef]) => {
    const engines = Object.entries(spec.engines).map(([engineId, engine]) => {
      const head = `<tr><th>provider</th><th>anchor</th>${engine.assets.map((a) => `<th>${esc(a.id)}<br><small>${esc(a.group)}</small></th>`).join('')}</tr>`;
      const rows = providersFor(style).map((provider) => {
        const items = by(style, provider);
        const anchor = items.find((r) => r.kind === 'anchor');
        const cells = engine.assets.map((a) => {
          const r = items.find((x) => x.engine === engineId && x.assetId === a.id);
          return cell(r, r ? `out/${style}/${provider}/${engineId}/${r.file}` : '');
        }).join('');
        return `<tr><th>${esc(provider)}<div class="score">${scoreForm(style, engineId, provider)}</div></th>`
          + `${cell(anchor, anchor ? `out/${style}/${provider}/${anchor.file}` : '')}${cells}</tr>`;
      }).join('');
      return `<h3>${esc(engine.label)}</h3><div class="scroll"><table class="sheet">${head}${rows}</table></div>`;
    }).join('');
    return `<section><h2>${esc(styleDef.label)}</h2><p class="muted">${esc(styleDef.text)}</p>${engines}</section>`;
  }).join('');

  const partial = summary.budgetExhausted ? '<p class="warn">Budget reached — results are partial.</p>' : '';
  const missing = summary.missingKeys?.length ? `<p class="warn">Not run (no API key): ${esc(summary.missingKeys.join(', '))}</p>` : '';

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>sparkgame art bake-off</title>
<style>
body{font:14px/1.4 system-ui,sans-serif;margin:24px;color:#222}
table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:4px;text-align:center;vertical-align:top}
.sheet img{width:120px;height:120px;object-fit:contain;background:repeating-conic-gradient(#eee 0 25%,#fff 0 50%) 0 0/16px 16px;image-rendering:auto}
.scroll{overflow-x:auto;margin-bottom:24px}.bad{background:#fdecea;color:#a33;min-width:120px}.empty{color:#999;min-width:120px}
.score{display:flex;flex-direction:column;gap:2px;font-weight:normal;font-size:12px;text-align:left;margin-top:6px}
.muted{color:#666}.warn{color:#a33;font-weight:bold}small{color:#555}
</style></head><body>
<h1>sparkgame art bake-off</h1>
<p>Run ${esc(summary.runId)} · finished ${esc(summary.finishedAt)} · spent ~${usd(summary.spentUsd)} of $${esc(summary.budgetUsd)}</p>
${partial}${missing}
<h2>Summary</h2>
<table><tr><th>style</th><th>provider</th><th>ok</th><th>failed</th><th>refused</th><th>skipped</th><th>alpha ok</th><th>avg latency</th><th>total cost</th><th>per image</th><th>per ${GAME_IMAGES}-image game</th></tr>${summaryRows}</table>
<p class="muted">* includes estimated costs (Gemini: third-party price quote; check the billing console). Cost per game = per-image cost × ${GAME_IMAGES}, including background removal.</p>
<p><button id="export">Export scores as JSON</button> Scores are kept in this browser (localStorage).</p>
${sections}
<script>
const KEY='sparkgame-bakeoff-scores';const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
document.querySelectorAll('select[data-score]').forEach(s=>{s.value=saved[s.dataset.score]??'';s.addEventListener('change',()=>{saved[s.dataset.score]=s.value;localStorage.setItem(KEY,JSON.stringify(saved));});});
document.getElementById('export').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(saved,null,2)],{type:'application/json'}));a.download='bakeoff-scores.json';a.click();};
</script></body></html>`;
}

export async function writeReport(root, spec, data) {
  await writeFile(join(root, 'report.html'), renderReport(spec, data));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = dirname(fileURLToPath(import.meta.url));
  const resultsPath = join(root, 'out', 'results.json');
  if (!existsSync(resultsPath)) {
    console.error('out/results.json not found — run `node run.mjs` first.');
    process.exitCode = 1;
  } else {
    const spec = JSON.parse(await readFile(join(root, 'spec.json'), 'utf8'));
    await writeReport(root, spec, JSON.parse(await readFile(resultsPath, 'utf8')));
    console.log(`Wrote ${join(root, 'report.html')}`);
  }
}
