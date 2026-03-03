import { json } from '@remix-run/node';
import { MODULE_CATALOG } from '@superapp/core';

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') ?? '').toLowerCase().trim();
  const category = url.searchParams.get('category') ?? undefined;
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
  const pageSize = Math.min(100, Math.max(10, Number(url.searchParams.get('pageSize') ?? '50')));

  let items = MODULE_CATALOG;

  if (category) items = items.filter(i => i.category === category);
  if (q) items = items.filter(i =>
    i.catalogId.toLowerCase().includes(q) ||
    i.description.toLowerCase().includes(q)
  );

  const total = items.length;
  const start = (page - 1) * pageSize;
  const end = start + pageSize;

  return json({ total, page, pageSize, items: items.slice(start, end) });
}
