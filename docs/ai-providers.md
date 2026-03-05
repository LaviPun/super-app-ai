# AI provider integration

## Goals
- Strict JSON-only responses matching RecipeSpec JSON Schema
- Bounded retries for transient errors (429/5xx)
- Metadata logging (status, duration, provider request id, body hashes)
- No raw prompt/output persisted to logs by default

## Providers implemented
- OpenAI Responses API: uses `text.format` with `json_schema` and `strict: true`. See Structured Outputs guide and Responses reference.
- Anthropic Messages API: uses `output_config.format` with `json_schema`. See Structured Outputs docs. Supports **Claude Agent Skills** and **code execution** when configured (see below).
- Custom OpenAI-compatible: tries `/v1/responses` first, falls back to `/v1/chat/completions` with `response_format`.

## Claude (Anthropic) Agent Skills and code execution
For ANTHROPIC providers you can optionally enable:
- **Agent Skills**: Pass a list of skill IDs in the Messages API `container.skills` parameter. Use beta headers `skills-2025-10-02` and `files-api-2025-04-14`. Skills can be Anthropic-built (e.g. `pptx`, `xlsx`, `docx`, `pdf`) or custom (IDs like `skill_01AbCdEf...`). Max 8 skills per request.
- **Code execution**: Pass the `code_execution_20250825` tool and beta header `code-execution-2025-08-25`.

Configuration is stored per provider in `AiProvider.extraConfig` (JSON: `{ skills?: string[], codeExecution?: boolean }`). Set it when adding an ANTHROPIC provider or via "Update Claude options" on the AI Providers internal page. Settings → "AI & API keys" links to AI Providers for API keys and Claude/OpenAI options.

## Notes
If you enable a “debug capture” mode later, store it per shop and time-bound it (e.g. 15 minutes) to avoid retaining sensitive data.
