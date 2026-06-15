// Bridges the ported design pages (which expect a `ctx` with `.go()` + `.toast()`)
// onto Remix navigation + the internal layout's outlet `showToast`.
import { useMemo } from 'react';
import { useNavigate, useOutletContext } from '@remix-run/react';
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
