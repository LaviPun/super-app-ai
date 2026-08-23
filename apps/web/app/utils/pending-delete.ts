/**
 * Commit an undo-window pending delete when its owning component unmounts.
 *
 * The modules index shows a 6s "Undo" window after a confirmed delete; while it
 * is open the row is only hidden optimistically. If the merchant navigates away
 * before the timer fires, the delete must COMMIT (they confirmed it) — not
 * silently cancel. `keepalive: true` lets the browser finish the POST during
 * navigation. Fire-and-forget: the component is gone, so there is nothing to
 * toast — rejections are swallowed.
 */
export function commitPendingDeletes(ids: string[], fetchImpl: typeof fetch = fetch): void {
  for (const id of ids) {
    void fetchImpl(`/api/modules/${id}/delete`, {
      method: 'POST',
      credentials: 'same-origin',
      keepalive: true,
      headers: { Accept: 'application/json' },
    }).catch(() => {});
  }
}
