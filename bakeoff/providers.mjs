// Image provider adapters for the art bake-off.
// Every generate() resolves to { bytes, model, costUsd, costSource, raw } or throws ProviderError.
// API shapes are taken from each provider's docs as of 2026-11 (see ../docs/image-models.md).

export class ProviderError extends Error {
  // kind: auth | balance | rate_limit | transient | refused | no_image | bad_request | bad_response
  constructor(kind, message, { status, retryAfterMs } = {}) {
    super(message);
    this.kind = kind;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

// Estimated cost of one call, used to reserve budget before the call is made.
export const ESTIMATE_USD = {
  recraft: 0.035,
  recraft_style: 0.005,
  recraft_bg: 0.01,
  gemini: 0.0336,
  openai: 0.06,
  retro: 0.03,
};

const SNIPPET = 500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function sniffFormat(bytes) {
  if (bytes.length >= 8 && bytes.readUInt32BE(0) === 0x89504e47) return 'png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (bytes.length >= 6 && bytes.toString('ascii', 0, 3) === 'GIF') return 'gif';
  return 'unknown';
}

// true / false when the container tells us; null when it cannot be determined without decoding.
export function hasAlpha(bytes) {
  const fmt = sniffFormat(bytes);
  if (fmt === 'png') {
    const colorType = bytes[25];
    if (colorType === 4 || colorType === 6) return true;
    return colorType === 3 ? bytes.includes(Buffer.from('tRNS')) : false;
  }
  if (fmt === 'webp' && bytes.toString('ascii', 12, 16) === 'VP8X') return (bytes[20] & 0x10) !== 0;
  if (fmt === 'jpeg') return false;
  return null;
}

const mimeOf = (bytes) => ({ png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' })[sniffFormat(bytes)] ?? 'application/octet-stream';
const dataUrl = (bytes) => `data:${mimeOf(bytes)};base64,${bytes.toString('base64')}`;

function classify(provider, res, body, text) {
  const status = res.status;
  const snippet = text.slice(0, SNIPPET);
  const retryAfterSec = Number(res.headers.get('retry-after'));
  const retryAfterMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0 ? retryAfterSec * 1000 : undefined;
  const code = body?.error?.code;
  const looksLikeModeration = code === 'moderation_blocked' || /moderation|safety|content[ _-]?policy|blocked/i.test(snippet);
  const msg = `${provider}: HTTP ${status}: ${snippet}`;
  if (status === 400 && looksLikeModeration) return new ProviderError('refused', msg, { status });
  if (status === 401 || status === 403) return new ProviderError('auth', msg, { status });
  if (status === 402) return new ProviderError('balance', msg, { status });
  if (status === 429) return new ProviderError('rate_limit', msg, { status, retryAfterMs });
  if (status >= 500) return new ProviderError('transient', msg, { status, retryAfterMs });
  return new ProviderError('bad_request', msg, { status });
}

async function request(provider, url, init, timeoutMs = 180_000) {
  let res;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    throw new ProviderError('transient', `${provider}: network error or timeout: ${e.message}`);
  }
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    // Non-JSON body; handled below.
  }
  if (!res.ok) throw classify(provider, res, body, text);
  if (body === null) throw new ProviderError('bad_response', `${provider}: non-JSON response: ${text.slice(0, SNIPPET)}`);
  return body;
}

async function download(provider, url) {
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  } catch (e) {
    throw new ProviderError('transient', `${provider}: image download failed: ${e.message}`);
  }
  if (!res.ok) throw new ProviderError('transient', `${provider}: image download HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ---------- Recraft ----------
const RECRAFT = 'https://external.api.recraft.ai/v1';

function recraftCost(body, fallback) {
  const credits = Number(body?.credits);
  return Number.isFinite(credits) && credits > 0
    ? { costUsd: credits / 1000, costSource: 'api_credits' }
    : { costUsd: fallback, costSource: 'estimate_list_price' };
}

async function recraftImage(item) {
  if (item?.b64_json) return Buffer.from(item.b64_json, 'base64');
  if (item?.url) return download('recraft', item.url);
  return null;
}

export function recraft(apiKey) {
  const auth = { Authorization: `Bearer ${apiKey}` };
  return {
    name: 'recraft',
    async createStyle(anchorBytes) {
      const body = await request('recraft', `${RECRAFT}/styles`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'recraftv4_styles', image_urls: [dataUrl(anchorBytes)] }),
      });
      if (!body.id) throw new ProviderError('bad_response', `recraft: style creation returned no id: ${JSON.stringify(body).slice(0, SNIPPET)}`);
      return { styleId: body.id, ...recraftCost(body, ESTIMATE_USD.recraft_style) };
    },
    async generate({ prompt, styleId, palette }) {
      const model = styleId ? 'recraftv4_styles' : 'recraftv4_1';
      const payload = { model, prompt, size: '1:1', n: 1, response_format: 'b64_json', image_format: 'png' };
      if (styleId) payload.style_id = styleId;
      if (palette?.length) payload.controls = { colors: palette.slice(0, 10).map((rgb) => ({ rgb })) };
      const body = await request('recraft', `${RECRAFT}/images/generations`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const bytes = await recraftImage(body.data?.[0]);
      if (!bytes) throw new ProviderError('no_image', `recraft: no image in response: ${JSON.stringify(body).slice(0, SNIPPET)}`);
      return { bytes, model, ...recraftCost(body, ESTIMATE_USD.recraft), raw: { credits: body.credits ?? null } };
    },
    async removeBackground(bytes) {
      const form = new FormData();
      form.append('file', new Blob([bytes], { type: mimeOf(bytes) }), `input.${sniffFormat(bytes)}`);
      form.append('image_format', 'png');
      form.append('response_format', 'b64_json');
      const body = await request('recraft', `${RECRAFT}/images/removeBackground`, { method: 'POST', headers: auth, body: form });
      const out = await recraftImage(body.image);
      if (!out) throw new ProviderError('no_image', `recraft: removeBackground returned no image: ${JSON.stringify(body).slice(0, SNIPPET)}`);
      return { bytes: out, ...recraftCost(body, ESTIMATE_USD.recraft_bg) };
    },
  };
}

// ---------- Google Gemini (Nano Banana 2.1, Interactions API) ----------
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const GEMINI_MODEL = 'gemini-nano-banana-2.1';

function lastImageData(body) {
  let data = body?.output_image?.data ?? null;
  for (const step of body?.steps ?? []) {
    if (step.type !== 'model_output') continue;
    for (const block of step.content ?? []) if (block.type === 'image' && block.data) data = block.data;
  }
  return data;
}

export function gemini(apiKey) {
  return {
    name: 'gemini',
    async generate({ prompt, refs = [] }) {
      const input = [{ type: 'text', text: prompt }, ...refs.map((b) => ({ type: 'image', mime_type: mimeOf(b), data: b.toString('base64') }))];
      const body = await request('gemini', GEMINI, {
        method: 'POST',
        headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json', 'Api-Revision': '2026-05-20' },
        body: JSON.stringify({
          model: GEMINI_MODEL,
          input,
          response_format: { type: 'image', mime_type: 'image/png', aspect_ratio: '1:1', image_size: '1K' },
        }),
      });
      const data = lastImageData(body);
      if (!data) throw new ProviderError('no_image', `gemini: no image in response; text: ${String(body.output_text ?? '').slice(0, 300)}`);
      return {
        bytes: Buffer.from(data, 'base64'),
        model: GEMINI_MODEL,
        costUsd: ESTIMATE_USD.gemini,
        costSource: 'estimate_third_party_quote',
        raw: { usage: body.usage ?? null },
      };
    },
  };
}

// ---------- OpenAI (GPT Image 2.6 Flare) ----------
const OPENAI = 'https://api.openai.com/v1/images/generations';
const OPENAI_MODEL = 'gpt-image-2.6-flare';

function openaiCost(usage) {
  // Published rates: image output $30 / 1M tokens (2.6); text input $5 / 1M (2.5 rate, assumed unchanged).
  const out = Number(usage?.output_tokens);
  const inp = Number(usage?.input_tokens);
  if (Number.isFinite(out)) return { costUsd: (out * 30 + (Number.isFinite(inp) ? inp * 5 : 0)) / 1e6, costSource: 'usage_tokens_x_list_rate' };
  return { costUsd: ESTIMATE_USD.openai, costSource: 'estimate_medium_quality' };
}

export function openai(apiKey) {
  return {
    name: 'openai',
    async generate({ prompt, transparent }) {
      const payload = { model: OPENAI_MODEL, prompt, size: '1024x1024', quality: 'medium', output_format: 'png', n: 1 };
      if (transparent) payload.background = 'transparent';
      const body = await request('openai', OPENAI, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const b64 = body.data?.[0]?.b64_json;
      if (!b64) throw new ProviderError('no_image', `openai: no image in response: ${JSON.stringify(body).slice(0, SNIPPET)}`);
      return { bytes: Buffer.from(b64, 'base64'), model: OPENAI_MODEL, ...openaiCost(body.usage), raw: { usage: body.usage ?? null } };
    },
  };
}

// ---------- Retro Diffusion (v2, queued tasks) ----------
const RD = 'https://api.retrodiffusion.ai/v2';

async function pollRetro(apiKey, taskId, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(2000);
    const task = await request('retro', `${RD}/inferences/tasks/${taskId}`, { headers: { 'X-RD-Token': apiKey } });
    if (task.status === 'succeeded') return task.result ?? {};
    if (task.status === 'failed') throw new ProviderError('transient', `retro: task ${taskId} failed: ${JSON.stringify(task.error ?? task).slice(0, SNIPPET)}`);
  }
  throw new ProviderError('transient', `retro: task ${taskId} did not finish within ${timeoutMs / 1000}s`);
}

export function retro(apiKey) {
  return {
    name: 'retro',
    async generate({ prompt, category, transparent, seed, idempotencyKey }) {
      // RD Fast accepts 64–384 px per side.
      const size = category === 'scene' ? 256 : 96;
      const promptStyle = category === 'scene' ? 'rd_fast__default' : 'rd_fast__game_asset';
      const accepted = await request('retro', `${RD}/inferences`, {
        method: 'POST',
        headers: { 'X-RD-Token': apiKey, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ prompt, prompt_style: promptStyle, width: size, height: size, num_images: 1, remove_bg: Boolean(transparent), seed }),
      });
      if (!accepted.task_id) throw new ProviderError('bad_response', `retro: no task_id: ${JSON.stringify(accepted).slice(0, SNIPPET)}`);
      const result = await pollRetro(apiKey, accepted.task_id);
      const b64 = result.base64_images?.[0];
      if (!b64) throw new ProviderError('no_image', `retro: task ${accepted.task_id} returned no image`);
      const cost = Number(result.balance_cost);
      return {
        bytes: Buffer.from(b64, 'base64'),
        model: result.model ?? promptStyle,
        costUsd: Number.isFinite(cost) ? cost : ESTIMATE_USD.retro,
        costSource: Number.isFinite(cost) ? 'api_balance_cost' : 'estimate_list_price',
        raw: { task_id: accepted.task_id },
      };
    },
  };
}
