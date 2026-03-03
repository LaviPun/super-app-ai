# AI provider integration

## Goals
- Strict JSON-only responses matching RecipeSpec JSON Schema
- Bounded retries for transient errors (429/5xx)
- Metadata logging (status, duration, provider request id, body hashes)
- No raw prompt/output persisted to logs by default

## Providers implemented
- OpenAI Responses API: uses `text.format` with `json_schema` and `strict: true`. See Structured Outputs guide and Responses reference.
- Anthropic Messages API: uses `output_config.format` with `json_schema`. See Structured Outputs docs.
- Custom OpenAI-compatible: tries `/v1/responses` first, falls back to `/v1/chat/completions` with `response_format`.

## Notes
If you enable a “debug capture” mode later, store it per shop and time-bound it (e.g. 15 minutes) to avoid retaining sensitive data.
