# AI provider integration

## Goals
- Strict JSON-only responses matching RecipeSpec JSON Schema
- Bounded retries for transient errors (429/5xx)
- Metadata logging (status, duration, provider request id, body hashes)
- No raw prompt/output persisted to logs by default

## Providers implemented
- **OpenAI Responses API** (`openai-responses.client.server.ts`): uses `text.format: { type: 'json_object' }`. Default `max_output_tokens: 8192`. Accepts `maxTokens` override — hydration passes `16000`. Set `OPENAI_API_KEY` (and optionally `OPENAI_DEFAULT_MODEL`, default `gpt-4o-mini`).
- **Anthropic Messages API** (`anthropic-messages.client.server.ts`): system prompt forces JSON-only output. Default `max_tokens: 8192`. Accepts `maxTokens` override. Supports **Claude Agent Skills** and **code execution** when configured (see below). Set `ANTHROPIC_API_KEY` (and optionally `ANTHROPIC_DEFAULT_MODEL`, default `claude-sonnet-4-20250514`).
- **Custom OpenAI-compatible** (`openai-compatible.client.server.ts`): tries `/v1/responses` first, falls back to `/v1/chat/completions` with `response_format`.

## Claude (Anthropic) Agent Skills and code execution
For ANTHROPIC providers you can optionally enable:
- **Agent Skills**: Pass a list of skill IDs in the Messages API `container.skills` parameter. Use beta headers `skills-2025-10-02` and `files-api-2025-04-14`. Skills can be Anthropic-built (e.g. `pptx`, `xlsx`, `docx`, `pdf`) or custom (IDs like `skill_01AbCdEf...`). Max 8 skills per request.
- **Code execution**: Pass the `code_execution_20250825` tool and beta header `code-execution-2025-08-25`.

Configuration is stored per provider in `AiProvider.extraConfig` (JSON: `{ skills?: string[], codeExecution?: boolean }`). Set it when adding an ANTHROPIC provider or via "Update Claude options" on the AI Providers internal page. Settings → "AI & API keys" links to AI Providers for API keys and Claude/OpenAI options.

## Anthropic Free Tier rate limits (reference)

Limits apply **per minute** (not per request). When the app receives HTTP 429 from Anthropic, it retries with backoff; if still rate-limited, the user sees the provider error. Keep these in mind for UX and when debugging:

| Model                | Requests/min | Input tokens/min | Output tokens/min |
|---------------------|--------------|------------------|-------------------|
| Claude Sonnet Active| 5            | **10K** (< 200k context) | 4K  |
| Claude Opus Active  | 5            | **10K** (< 200k context) | 4K  |
| Claude Haiku Active| 5            | **10K** (< 200k context) | 4K  |
| Claude Haiku 3      | 5            | 25K (< 200k context)    | 5K  |

- **Batch requests:** 5/min across all models.
- **Web search tool:** 30 uses/sec across all models.
- **Files API storage:** 100 GB total per org.

A single hydrate (or create-module) call can use a large share of the 10K input tokens/min; multiple quick requests can exhaust the limit. Contact Anthropic for custom rate limits.

## Fallback chain

When both `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are set (and no DB provider is configured), `FallbackLlmClient` wraps Claude as primary and OpenAI as fallback. Any error from Claude — 429, unexpected content blocks (`server_tool_use`), model errors — silently retries with OpenAI. If OpenAI also fails, the primary error is re-thrown.

## Token limits per call type

| Call | Anthropic | OpenAI |
|------|-----------|--------|
| Recipe generation | 8192 (default) | 8192 (default) |
| Hydration (`hydrateRecipeSpec`) | 16000 | 16000 |

These are passed via `hints.maxTokens` through `LlmClient.generateRecipe`. Individual client functions accept `maxTokens` and pass it to the provider API.

## Common pitfalls

- **Do not set `max_output_tokens` below 8192 for OpenAI** — the hydration envelope easily exceeds 4096 tokens and the response will be truncated (invalid JSON). See debug.md §17.
- **Do not add large generative tasks (HTML, reports) to the hydration prompt** — they inflate output size and push response time past the Cloudflare tunnel timeout (~90s). See debug.md §18.
- **Model name must be `gpt-4o-mini`, not `gpt-5-mini`** — check `OPENAI_DEFAULT_MODEL` in `.env` or the DB `AiProvider.model` field.

## Notes
If you enable a “debug capture” mode later, store it per shop and time-bound it (e.g. 15 minutes) to avoid retaining sensitive data.
