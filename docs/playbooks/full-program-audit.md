# Full Program Audit & Repair Playbook

> Repeatable instructions for the audit → plan → wave-execution → verification → go-live
> process used for the 2026-08 launch program. Hand this file to a coordinating agent
> (or follow it yourself) whenever the app needs a deep audit, a large repair program,
> or a new multi-workstream feature phase. It is written as an instruction prompt:
> every rule here is binding unless the owner overrides it in writing.

The coordinator that runs this playbook **dispatches subagents for all heavy work**
(implementation, reviews, test suites, builds, long verification). The coordinator's
own loop is limited to: dispatch/resume, ledger writes, reading result files, and
small git/PR operations. One implementation agent per worktree at a time; reviews and
independent workstreams run in parallel.

---

## Phase 0 — Audit (find the truth)

1. **Fan out read-only audit agents**, one per subsystem (auth/billing, generation
   pipeline, publish path, jobs/webhooks, merchant UI, internal admin, infra/deploy,
   docs). Each agent's contract:
   - Verify every claim **against current code**, never against docs, memory files,
     or previous audits — all three go stale. Cite `file:line` for every finding.
   - Grade findings: launch-blocking / important / minor, each with a one-line
     *failure scenario* (concrete input → wrong outcome).
   - Explicitly list what was **checked and found healthy** — an audit that only
     lists problems can't be re-run as a regression check.
2. **Synthesize root causes**, not symptom lists. (The 2026-08 audit reduced ~40
   findings to 5 root causes.)
3. **Write the owner-decision list** (`D1…Dn`): every fork that is genuinely the
   owner's call (hosting, billing model, AI disclosure, pricing). Get answers before
   planning; record them verbatim in the program charter.
4. Do not fix anything in this phase. Truth first.

## Phase 1 — Program design (charter + waves)

1. Write a **charter**: goal, owner decisions, workstream (wave) list `WS-A…WS-n`,
   and the **dependency edges** between waves (who owns shared foundations; who
   consumes them; explicit gate conditions like "WS-I Task 8 may not start until
   WS-C's salvage is merged — checkable condition, not vibes").
2. Decide **merge sequencing** up front where branches will collide (e.g. "the UI
   rewrite merges before the engine that patches the same route; the engine rebases").
3. Cross-workstream rules live in one **coordination ledger**
   (`.superpowers/sdd/<date>-program-coordination.md`). Every ruling is appended as:
   `Ruling: <decision> — <why> — <cost if wrong>`.

## Phase 2 — Plans (one per wave)

1. Use the house plan format (`docs/superpowers/plans/YYYY-MM-DD-ws-x-*.md`):
   header (goal / architecture / spec pointer), **Global Constraints** with exact
   values, then bite-sized tasks — each task lists exact files, interfaces consumed
   and produced, test-first steps with real code, and its own commit.
   No placeholders, no "TBD", no "similar to task N".
2. Plans are written by planning agents **in parallel** (they don't conflict), each
   self-reviewed against the spec before hand-back.
3. Before executing a plan, the coordinator runs the **pre-flight conflict scan**:
   a table of every task pair sharing a file/interface, and every task checked for
   self-consistency. Rulings recorded before Task 1 dispatches.

## Phase 3 — Wave execution (the per-task loop)

Isolation: every wave runs in its **own git worktree + own branch + own local
infra ports** (Postgres/Redis per worktree — never share dev databases between
concurrently-executing waves). Every wave keeps a **ledger**
(`.superpowers/sdd/<plan-basename>/progress.md`) whose first line names its plan;
ledgers are the recovery map after context loss — trust them plus `git log` over
recollection.

For each task (or batch of small same-shape tasks):

1. **Brief** — extract the task text to its own file; the dispatch prompt adds only:
   where the task fits, interfaces from earlier tasks the brief can't know,
   resolutions of noticed ambiguities, and the report-file contract. Implementers
   never read whole plans and **never spawn subagents**.
2. **Implementer** (model per complexity: cheap for transcription, mid for
   integration, top-tier only for architecture): TDD, one commit per task,
   runs the gates itself (below), writes a full report file, returns
   DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED plus a one-line summary.
3. **Task review** — mandatory, never skipped, never replaced by self-review.
   Generate a **review package** (commit list + stat + full diff at `-U10`, one
   file) from the recorded BASE (never `HEAD~1`). The reviewer receives brief +
   report + diff path + the binding constraints as its attention lens, and a short
   list of **named crux checks** (the 2-3 things that would hurt most if wrong).
   The reviewer **runs all verification itself** (suite, tsc, build) and reads the
   diff of changed tests looking for weakening. Encourage adversarial technique:
   mutation-test a guard (disable it, confirm tests fail), rebuild the Docker image
   if the Dockerfile changed, empirically probe external-API semantics rather than
   trusting comments.
4. **Verdict handling**:
   - *Approved* → ledger `Task N: complete — <sha>, review Approved (<one-line>)`.
   - *Needs fixes* → fix round: resume the **same implementer** (rounds 1-3),
     fresh + stronger model at rounds 4-5; every controller decision on a disputed
     finding is a ledgered ruling. Then a **scoped re-review** of the fix diff only
     (cheap/mid model). Trivial mechanical fixes with verbatim evidence (grep
     output, command output pasted) may be **accepted on evidence** without a
     re-review round — record the ruling and rely on the final review as the net.
5. Parked minors go in the ledger with rulings; nothing is silently dropped.

**Gates (every commit / end of every batch)** — `npx tsc --noEmit`; targeted vitest
then full suite (record exact counts; 0 failures); `pnpm --filter web lint` under
the warning cap; `pnpm --filter web build` **mandatory whenever route files or the
import graph change** (client/server graph violations are invisible to tsc+vitest);
`pnpm evals` when the AI generation path changes; a real `docker build` when a
Dockerfile changes (nothing else catches dangling COPYs); additive-only Prisma
migrations.

## Phase 4 — Wave endgame

1. **Merge current master into the branch** (an agent resolves conflicts
   semantically — keep both intents — and reruns all gates).
2. **Final whole-branch review** on the most capable model. Its job is what
   task reviews structurally miss: cross-task composition bugs (the 2026-08 finals
   caught a double-billing path and an inert-retry bug that every task-scoped review
   had passed), program-invariant sweeps (billing ≤1 unit end-to-end, failFinalOnly
   in every processor, no-silent-failures, deadline sums), test-set diff vs master,
   and a **conflict map** against unmerged sibling branches. Output: SHIP or
   FIX FIRST + a residual-risk register.
3. FIX FIRST → **one** fix dispatch, one scoped re-review, adjudicate residuals.
4. Push, open the PR (body: summary, what ships live vs flag-gated, gates, merge
   sequencing note, owner items). **Merging is always the owner's click.**

## Phase 5 — Merge choreography & post-merge

- Respect the sequencing ruling; rebase the later branch after the earlier merges
  (a rewritten file means re-implementing the delta in the new shape, not textual
  merging — verify the sacred invariants survived by trace, not by diff).
- After every merge: master CI green is the definition of done — chase red
  immediately with a scoped hotfix (lint-cap drift and client/server graph breaks
  are the two recurring escapes).
- When all waves land: docs **delta pass** (flip every "Pending (unmerged)" claim
  by re-verifying against merged code), memory/CHANGELOG sync, worktree + branch
  cleanup (archive worktree-resident ledgers first), stale-PR triage with
  supersession evidence.

## Phase 6 — Live verification (nothing is done until probed in production)

The 2026-08 launch found four launch-blockers **only** at this phase — after every
test was green: placeholder production credentials, a stale dev-preview override,
an app that had never had a production version released, and a publish mutation
Shopify rejects. Therefore:

1. Probe the real thing end-to-end on a dev store: install → auth → generate →
   select → publish → storefront render; billing lifecycle (plan select → $0 test
   approve → callback → reconcile → in-app plan state).
2. While the owner clicks, the coordinator watches production logs (deduped tail)
   and the funnel/ops dashboards; every failure gets root-caused from server-side
   evidence before anyone retries.
3. **Credential hygiene is part of the audit**: grep production env for
   placeholder values (`replace-with`); compare key prefixes/suffixes value-blind;
   secrets are never printed or typed by an agent — pipe them
   (`source | cut | set`) or hand the paste to the owner.
4. Config that "must already be fine" isn't: verify released app version, scopes,
   URLs, webhook subscriptions against the live platform, not the local toml.

## Standing rules (apply to every phase)

- **No silent failures**: every error path surfaces to a user, a log with context,
  or an alert. A silent fallback is a finding.
- **Evidence before claims**: no "fixed/passing/done" without the command output
  that proves it, in the report. Reviews re-run the evidence independently.
- **Docs and audits are hypotheses**; code is the source of truth. Every stale-doc
  claim found gets fixed or ticketed, never repeated.
- **Value-blind secrets** everywhere; browser co-driving for owner-authenticated
  surfaces (the agent navigates/reads; the owner types credentials and clicks
  the irreversible buttons).
- **Ledgers + rulings** are the program's memory; a session that lost context
  resumes from ledgers, never re-dispatches completed work.
- Findings outside the current scope become **tickets/chips**, not scope creep.
- Costs: batch small same-shape tasks into one dispatch; pick the cheapest model
  that can do the job; final reviews get the strongest.

## How to re-run

- Full program: follow Phases 0→6 (weeks-scale; only for launch-grade efforts).
- Regression audit: Phase 0 fan-out + Phase 6 probes only; compare against the
  previous audit's "checked healthy" list.
- Single feature wave: Phases 2→6 with one plan.
- Docs drift: the separate harness at `docs/audit/README.md`.
- Admin/UI sweep: the panel-by-panel QA pattern (load every page, exercise every
  primary action, verify loud failure without backends) — see the audit-agent
  brief pattern in Phase 0 plus the Phase 3 review loop for the fixes.
