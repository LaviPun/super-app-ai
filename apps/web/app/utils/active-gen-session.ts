/**
 * WS-C Task 7 (extracted in the Task 8 commit-0 fold-in for testability —
 * see `app/__tests__/active-gen-session.test.ts`). sessionStorage-backed
 * resumable async-generation session, keyed by prompt so a reload/reconnect
 * on the SAME prompt resumes the same job (re-fetch, never re-spend — Task 6
 * review requirement #3); a different prompt just starts fresh. All three
 * functions are best-effort — sessionStorage can be unavailable (private
 * browsing, quota, SSR) and that only degrades the resume UX, it never
 * blocks generation itself.
 *
 * Commit-0 fold-in (b): `modules._index.tsx` navigates to `/generate` with
 * ONLY `location.state.prompt` (no `?prompt=`), and a full page reload loses
 * router state — so the prompt this session was keyed on can vanish out from
 * under the resume check. `readActiveGenSession` now accepts an OPTIONAL
 * `expectedPrompt`: when the caller has a known prompt (from state or
 * `?prompt=`), the exact-match guard is unchanged; when the caller has NO
 * prompt at all (state lost, no query param), it may call with no argument
 * to trust whatever prompt this same tab already persisted for the active
 * job — the only surviving source of truth in that case.
 */
export type ActiveGenSession = { jobId: string; correlationId: string; prompt: string };

export const ACTIVE_GEN_SESSION_KEY = 'sa:gen:active';

export function readActiveGenSession(expectedPrompt?: string): ActiveGenSession | null {
  try {
    const raw = sessionStorage.getItem(ACTIVE_GEN_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ActiveGenSession>;
    if (
      typeof parsed.jobId === 'string' && parsed.jobId &&
      typeof parsed.correlationId === 'string' && parsed.correlationId &&
      typeof parsed.prompt === 'string' && parsed.prompt &&
      (expectedPrompt === undefined || parsed.prompt === expectedPrompt)
    ) {
      return { jobId: parsed.jobId, correlationId: parsed.correlationId, prompt: parsed.prompt };
    }
  } catch {
    // Corrupt or unavailable — treat as no resumable session.
  }
  return null;
}

export function writeActiveGenSession(session: ActiveGenSession): void {
  try {
    sessionStorage.setItem(ACTIVE_GEN_SESSION_KEY, JSON.stringify(session));
  } catch {
    // sessionStorage unavailable — resume-on-reload just won't work; the
    // in-flight generation itself is unaffected.
  }
}

export function clearActiveGenSession(): void {
  try {
    sessionStorage.removeItem(ACTIVE_GEN_SESSION_KEY);
  } catch {
    // ignore
  }
}
