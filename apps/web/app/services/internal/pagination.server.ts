/**
 * Tiny cursor-pagination helper for internal admin list pages.
 *
 * We page by descending (createdAt, id) so the order is stable even when
 * multiple rows share the same createdAt.
 *
 * The "cursor" we expose to the URL is just the id of the last visible row;
 * Prisma resolves it to a stable starting point via `cursor: { id }`.
 */

export const DEFAULT_INTERNAL_PAGE_SIZE = 100;
export const MAX_INTERNAL_PAGE_SIZE = 500;

export type CursorPage = {
  /** Where to start (inclusive when combined with skip:1). */
  cursor: { id: string } | undefined;
  /** Number of rows to fetch per page. */
  take: number;
  /** Whether to skip the cursor row itself. Always 1 when a cursor is set. */
  skip: number;
};

export function parseCursorParams(url: URL, defaultTake = DEFAULT_INTERNAL_PAGE_SIZE): CursorPage {
  const cursorId = url.searchParams.get('cursor')?.trim();
  const takeRaw = Number(url.searchParams.get('pageSize') ?? defaultTake);
  const take = Number.isFinite(takeRaw)
    ? Math.min(Math.max(1, Math.floor(takeRaw)), MAX_INTERNAL_PAGE_SIZE)
    : defaultTake;
  if (cursorId) {
    return { cursor: { id: cursorId }, take, skip: 1 };
  }
  return { cursor: undefined, take, skip: 0 };
}

export function buildNextCursorUrl<T extends { id: string }>(
  url: URL,
  rows: T[],
  pageSize: number,
): string | null {
  if (rows.length < pageSize) return null;
  const last = rows[rows.length - 1];
  if (!last) return null;
  const next = new URL(url);
  next.searchParams.set('cursor', last.id);
  return next.pathname + (next.search ? next.search : '');
}
