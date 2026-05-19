# Platform V2 — Phase 7 AI Generation Worker

**Status:** Local/testable worker foundation complete  
**Plan reference:** [platform-v2-migration-plan.md](../platform-v2-migration-plan.md) § Phase 7

## Legacy source paths inspected

The current Remix app still executes merchant AI work synchronously in these representative routes:

- `apps/web/app/routes/api.agent.generate-options.tsx`
- `apps/web/app/routes/api.ai.create-module.tsx`
- `apps/web/app/routes/api.ai.create-module.stream.tsx`
- `apps/web/app/routes/api.ai.hydrate-module.tsx`
- `apps/web/app/routes/api.ai.modify-module.tsx`
- `apps/web/app/routes/api.agent.modules.$moduleId.hydrate.tsx`
- `apps/web/app/routes/api.agent.modules.$moduleId.modify.tsx`

Core implementation remains in `apps/web/app/services/ai/llm.server.ts`. V2 does not import those Remix internals directly.

## V2 worker foundation

| Area | Implementation |
|------|----------------|
| Worker job types | `AI_GENERATE`, `AI_HYDRATE`, `AI_MODIFY` |
| Adapter boundary | `AiGenerationAdapter` with `generate`, `hydrate`, and `modify` methods |
| Trust boundary | `AI_GENERATE` and `AI_MODIFY` outputs must validate as `RecipeSpec` via `@superapp/core` |
| Provider fallback | `StubAiGenerationAdapter` for local/test use when provider/RunPod credentials are unavailable |
| Job ledger | Optional `JobLedgerRepository` updates running/success/failed state and stores result/error |
| Events | Emits `JOB_STARTED`, `JOB_PROGRESS`, and `JOB_COMPLETED` on success; errors are recorded for retry handling |

## Remaining external/runtime blockers

- Real provider execution should be wired through a dedicated V2 adapter once provider resolver, prompt builder, repair loop, and usage recorder are extracted from `apps/web`.
- RunPod/GPU execution requires credentials and runtime configuration not available locally.
- Live queue execution still depends on Redis/BullMQ availability from Phase 5 external verification.

## Safety notes

- The worker never accepts raw merchant code as deployable output.
- AI-generated outputs are constrained to `RecipeSpec` JSON.
- API routes remain enqueue-only; no long-running AI work was added to Fastify handlers.

## Verification

Latest gate results are tracked in `docs/implementation-status.md`.
