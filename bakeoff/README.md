# Art bake-off harness

Compares image models on Pocketgrove's own asset list (see `../docs/art-bakeoff-plan.md`).
Output: `out/` (images + per-image metadata) and `report.html` (side-by-side contact sheets,
automatic metrics, a scoring form whose scores export as JSON).

## Run

```bash
cp .env.example .env        # fill in the keys you have; providers without a key are skipped
node run.mjs --dry-run      # no network: prints planned calls and estimated cost
node run.mjs                # real run; resumable — rerun to retry failures
node run.mjs --only=recraft # one provider
node run.mjs --budget=20    # hard stop in USD (default 28)
node report.mjs             # rebuild report.html from out/results.json
```

Requires Node 22+. No npm dependencies.

## Failure modes (written before the code; each is handled in `run.mjs` / `providers.mjs`)

| # | Failure | Handling |
|---|---|---|
| 1 | API key missing for a provider | Provider skipped; report marks it "not run (no key)". Bake-off continues with the rest. |
| 2 | 401 / 403 (bad key, OpenAI org verification missing) | `auth` error: stop that provider, record reason, keep others running. |
| 3 | 402 / insufficient balance | `balance` error: stop that provider. |
| 4 | 429 rate limit | Retry up to 3 times, honouring `Retry-After`, else exponential backoff. |
| 5 | 5xx, provider busy, network error, timeout | Retry up to 2 times, then record the asset as `failed`. |
| 6 | Content moderation refusal | Recorded as `refused` with the provider's reason; never retried. |
| 7 | 200 OK but no image in the response (e.g. Gemini returns only text) | Recorded as `no_image` with the text snippet; retried like a transient error. |
| 8 | Temporary image URL expires before download | Request base64 output; when a URL is returned anyway, download immediately. |
| 9 | Output format differs from what was requested | Format sniffed from magic bytes and recorded; file saved with the real extension. |
| 10 | Asset needs transparency but output has no alpha | Background removed with Recraft `removeBackground` (cost recorded separately); if that fails or no Recraft key, asset flagged `needs_bg_removal`. |
| 11 | Budget would be exceeded | Each call reserves its estimated cost first; when the reservation would pass `--budget`, all further calls stop and the report says the run is partial. |
| 12 | Async task never finishes (Retro Diffusion polling) | Poll timeout of 180 s, then treated as transient failure. |
| 13 | Crash or interrupted run | Every finished asset has `meta.json`; rerunning skips assets with `status: ok`. The spend ledger is persisted. |
| 14 | Cost not reported by the API | Cost stored with `costSource` (`api_credits`, `api_balance_cost`, `usage_tokens_x_list_rate`, `estimate_*`); estimates are labelled in the report. |
| 15 | API shape drift (renamed fields) | Adapter throws `bad_response` with a 300–500 char response snippet; never silently writes an empty file. |
| 16 | Secret leakage | Keys only read from env; never logged; `.env` and `out/` are git-ignored; errors include response bodies, never request headers. |
| 17 | Recraft style creation fails | Falls back to unstyled V4.1 with the same palette; flagged `style_fallback` in metadata. |
| 18 | Duplicate charge on retry (Retro Diffusion) | `Idempotency-Key` per asset attempt. |
| 19 | Bad request (400) from our own payload | Recorded as `bad_request` with the snippet; not retried, so it cannot burn budget in a loop. |

## Cost sources

- Recraft: `credits` in the response (1,000 units = $1).
- Retro Diffusion: `balance_cost` in the task result.
- OpenAI: `usage` tokens × published rate ($30 / 1M image output tokens, $5 / 1M text input); falls back to an estimate.
- Gemini: estimate of $0.0336 per 1K image (third-party quote) until billing data is checked — compare with the Google Cloud billing console after the run.
