/**
 * Shared query-param scaffolding for the internal log list loaders
 * (error logs, API logs, audit).
 *
 * The three loaders parse the same primitives — free-text `q`, an optional
 * `correlationId`, and a `dateFrom`/`dateTo` createdAt range — then layer their
 * own route-specific filters on top and run their own findMany (each has
 * different includes/selects). This helper builds the shared slice of the
 * `where` and resolves cursor pagination via pagination.server, leaving the
 * caller to augment `where` and echo the parsed values back in its response.
 */
import { parseCursorParams } from './pagination.server';

export interface LogFilterOptions {
  /** Fields to OR-match the free-text `q` against, e.g. ['message', 'route', 'source']. */
  searchFields: string[];
  /** Parse & apply the `correlationId` filter. Defaults to true; audit has no such column. */
  correlation?: boolean;
  /** Page size when the request carries no explicit `pageSize`. Defaults to 150. */
  defaultTake?: number;
}

export interface LogFilterResult<W> {
  /** Shared where-slice: `OR` search, optional `correlationId`, optional `createdAt` range. */
  where: W;
  /** Cursor row for the current page, or undefined for the first page. */
  cursor: { id: string } | undefined;
  /** Rows to fetch. */
  take: number;
  /** Rows to skip (1 when a cursor is set, else 0). */
  skip: number;
  // Parsed values echoed so the loader can rebuild its `filters` response
  // without re-reading the query string.
  search?: string;
  correlationId?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export function parseLogFilters<W extends Record<string, unknown>>(
  url: URL,
  opts: LogFilterOptions,
): LogFilterResult<W> {
  const search = url.searchParams.get('q') || undefined;
  const correlationId = opts.correlation === false ? undefined : url.searchParams.get('correlationId') || undefined;
  const dateFrom = url.searchParams.get('dateFrom') ? new Date(url.searchParams.get('dateFrom')!) : undefined;
  const dateTo = url.searchParams.get('dateTo') ? new Date(url.searchParams.get('dateTo')!) : undefined;

  const where: Record<string, unknown> = {};
  if (search) where.OR = opts.searchFields.map((field) => ({ [field]: { contains: search } }));
  if (correlationId) where.correlationId = correlationId;
  if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: dateTo } : {}),
    };
  }

  const page = parseCursorParams(url, opts.defaultTake ?? 150);
  return { where: where as W, cursor: page.cursor, take: page.take, skip: page.skip, search, correlationId, dateFrom, dateTo };
}
