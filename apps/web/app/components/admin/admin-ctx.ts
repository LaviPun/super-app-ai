// Bridges the ported design pages (which expect a `ctx` with `.go()` + `.toast()`)
// onto Remix navigation + the internal layout's outlet `showToast`.
import { useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useOutletContext, useFetcher } from '@remix-run/react';
import { superappRoute } from '~/components/superapp';

export type AdminOutletContext = { showToast: (message: string, error?: boolean) => void };

export type AdminCtx = {
  /** Navigate by the design's hash route (#/admin/...) — mapped to the real /internal path. */
  go: (hash: string) => void;
  /** Fire a toast through the layout's Polaris toast host. */
  toast: (message: string, error?: boolean) => void;
  density: 'compact';
};

export function useAdminCtx(): AdminCtx {
  const navigate = useNavigate();
  const { showToast } = useOutletContext<AdminOutletContext>();
  return useMemo<AdminCtx>(
    () => ({
      go: (hash: string) => navigate(superappRoute(hash)),
      toast: (message: string, error?: boolean) => showToast(message, error),
      density: 'compact',
    }),
    [navigate, showToast],
  );
}

// Plain href for <a> tags (PageHead crumbs / back links use real anchors).
export function adminHref(hash: string): string {
  return superappRoute(hash);
}

type OpsResult = { ok: boolean; message: string; id: number };

/**
 * Wire an admin mutation button to the real, audit-logged `/internal/ops` action.
 * `run(intent, { resource, message, id })` posts to the server (requireInternalAdmin
 * + ActivityLog) and toasts the server's response. Replaces the prototype's
 * client-only optimistic toasts with genuine server round-trips.
 */
export function useAdminOps() {
  const fetcher = useFetcher<OpsResult>();
  const { toast } = useAdminCtx();

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data) {
      toast(fetcher.data.message, !fetcher.data.ok);
    }
  }, [fetcher.state, fetcher.data, toast]);

  const run = useCallback(
    (intent: string, opts: { resource?: string; message: string; id?: string; extra?: Record<string, string> }) => {
      const fd = new FormData();
      fd.set('intent', intent);
      if (opts.resource) fd.set('resource', opts.resource);
      if (opts.id) fd.set('id', opts.id);
      fd.set('message', opts.message);
      for (const [k, v] of Object.entries(opts.extra ?? {})) fd.set(k, v);
      fetcher.submit(fd, { method: 'post', action: '/internal/ops' });
    },
    [fetcher],
  );

  // `pendingFormData` is the in-flight submission's FormData (null when idle) so
  // callers can derive per-row busy state (e.g. which jobId is being replayed).
  // `data` is the settled server response (`{ ok, message }`) so callers can render
  // inline per-action outcome — the toast above still fires regardless.
  return {
    run,
    busy: fetcher.state !== 'idle',
    pendingFormData: fetcher.formData ?? null,
    data: fetcher.data ?? null,
  };
}
