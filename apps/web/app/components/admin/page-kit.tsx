/* Admin page kit: shared helpers used by every ported internal.* page.
   Re-exports the design foundation primitives + a Remix-aware `ctx`, link helpers,
   and a tiny client-store hook so the ported design markup stays 1:1. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { superappRoute } from '~/components/superapp';
import { useAdminCtx } from './admin-ctx';

export { useAdminCtx, useAdminOps, adminHref } from './admin-ctx';
export type { AdminCtx } from './admin-ctx';

// Re-export everything the design pages reference from the shared foundation so a
// ported page can import its whole toolkit from one module.
export * from '~/components/superapp';

// Shared relative-time formatter — routes import it alongside the rest of the kit.
export { formatRelativeTime } from '~/utils/relative-time';

// Real href for the design's hash routes (used by PageHead back/crumbs + inline links).
export function href(hash: string): string {
  return superappRoute(hash);
}

/** A hash-route <a> that navigates via Remix instead of changing the URL hash.
    Mirrors the design's inline links (cell-link / storeLink / related-link). */
export function ALink({ to, className, style, onClick, children }: any) {
  const ctx = useAdminCtx();
  return React.createElement(
    'a',
    {
      href: superappRoute(to),
      className,
      style,
      onClick: (e: React.MouseEvent) => {
        e.preventDefault();
        if (onClick) onClick(e);
        if (!e.defaultPrevented || true) {
          e.stopPropagation();
          ctx.go(to);
        }
      },
    },
    children,
  );
}

// storeLink / cell-link factory matching the design's `storeLink(name, id)`.
export function StoreLink({ name, id }: { name: string; id: string }) {
  return React.createElement(ALink, { to: '#/admin/stores/' + id, className: 'cell-link', onClick: (e: any) => e.stopPropagation() }, name);
}
