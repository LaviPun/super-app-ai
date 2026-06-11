# Spec-Driven Development (GitHub Spec Kit)

This monorepo uses [GitHub Spec Kit](https://github.com/github/spec-kit) for structured feature work alongside the phase-based V2 migration.

## Prerequisites

- **uv** — package manager for the Specify CLI ([install uv](https://docs.astral.sh/uv/))
- **Python 3.11+**
- **Specify CLI** — install or upgrade:

```bash
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git
specify --version
specify self check   # optional: check for newer release
```

## Project layout

| Path | Purpose |
|------|---------|
| `.specify/` | Templates, scripts, constitution, workflows |
| `.specify/memory/constitution.md` | Governing principles (aligned with `.cursorrules`) |
| `specs/<feature>/` | Per-feature `spec.md`, `plan.md`, `tasks.md`, checklists |
| `.cursor/skills/speckit-*` | Cursor Agent skills (slash-style workflow) |

Initialize once per repo (already done in this worktree):

```bash
specify init --here --force --integration cursor-agent --ignore-agent-tools
```

## Workflow (Cursor)

Run these in Cursor Agent (skills appear as `/speckit-constitution`, `/speckit-specify`, etc.):

| Step | Skill | Purpose |
|------|--------|---------|
| 1 | `/speckit-constitution` | Ratify or update project principles |
| 2 | `/speckit-specify` | What & why (no tech stack yet) → `specs/NNN-name/spec.md` |
| 3 | `/speckit-clarify` | Optional: resolve ambiguities before planning |
| 4 | `/speckit-plan` | Tech stack, architecture → `plan.md` |
| 5 | `/speckit-tasks` | Actionable task list → `tasks.md` |
| 6 | `/speckit-analyze` | Optional: consistency check across artifacts |
| 7 | `/speckit-implement` | Execute tasks in order |

Create a new feature directory manually (or let `/speckit-specify` do it):

```bash
.specify/scripts/bash/create-new-feature.sh \
  --number 13 \
  --short-name 'your-feature' \
  'Natural language description of the feature'
export SPECIFY_FEATURE=013-your-feature
```

## Mapping to V2 phases

| Migration artifact | Spec Kit artifact |
|--------------------|-------------------|
| `docs/phase-plan.md` § Phase N | High-level roadmap |
| `docs/gitbook/02-architecture/v2-migration/phase-N-*.md` | Implementation record / merge notes |
| `specs/0NN-<phase-name>/spec.md` | Testable requirements & acceptance |
| `specs/0NN-<phase-name>/plan.md` | Technical plan (packages, routes, workers) |
| `specs/0NN-<phase-name>/tasks.md` | Checklist for `/speckit-implement` |

**Example:** Phase 12 starter spec lives at `specs/012-storage-image-worker/spec.md`. Gitbook merge notes remain in `phase-12-storage-image-worker.md`.

For the **next** phase, use phase number as `--number` (e.g. `--number 13`) so directories align with migration numbering.

**Master index:** [`specs/000-platform-v2-master/spec.md`](../../../specs/000-platform-v2-master/spec.md) — phase coverage matrix, deferred items, links to all `specs/0NN-*` directories.

### V2 phase coverage matrix (2026-06-12, `master`)

| V2 | Name | Spec dir | `master` status |
|----|------|----------|-----------------|
| 0 | Baseline & inventory | *(master only)* | Partial |
| 1 | Target monorepo | `001-target-monorepo` | Partial |
| 2 | Shared contracts | `002-shared-contracts` | Partial |
| 3 | Fastify API | `003-fastify-api` | Not started |
| 4 | Next frontend | `004-next-frontend` | Not started |
| 5 | Job orchestration | `005-job-orchestration` | Not started |
| 6 | Worker skeleton | `006-worker-skeleton` | Partial |
| 7 | AI generation worker | `007-ai-generation-worker` | Not started |
| 8 | Internal assistant | `008-internal-assistant` | Not started |
| 9 | Webhook & flow | `009-webhook-flow` | Not started |
| 10 | Connector worker | `010-connector-worker` | Not started |
| 11 | Publish worker | `011-publish-worker` | Not started |
| 12 | Storage & image worker | `012-storage-image-worker` | **Shipped** |
| 13–21 | Preview → cutover | `013-*` … `021-*` | Not started (stub specs) |

Phase 12 deferred on master: BullMQ `asset-storage` consumer, live preview enqueue, R2 prod binding, signed URLs — see [`012-storage-image-worker/spec.md`](../../../specs/012-storage-image-worker/spec.md).

## Brownfield vs greenfield

- **Greenfield** (new capability): Start at `/speckit-specify` with user-facing requirements.
- **Brownfield** (phase already coded in a worktree): Create spec directory + fill `spec.md` from gitbook phase doc, then `/speckit-plan` and `/speckit-tasks` to capture remaining merge work and tests.

## Verification

Spec Kit does not replace package tests. After `/speckit-implement`, always run:

```bash
pnpm --filter <package> test
pnpm --filter <package> typecheck
```

Phase-specific commands are listed in each phase gitbook page.
