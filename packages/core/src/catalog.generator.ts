import fs from 'node:fs';
import path from 'node:path';

type Entry = Record<string, unknown> & { catalogId: string };

const surfaces = [
  'home','collection','product','cart','mini_cart','search','account','blog','page','footer','header','policy'
] as const;

const intents = [
  'promo','capture','upsell','cross_sell','trust','urgency','info','support','compliance','localization'
] as const;

const components = [
  'banner','announcement_bar','notification_bar','popup','modal','drawer','toast','badge',
  'progress_bar','tabs','accordion','sticky_cta','coupon_reveal'
] as const;

const triggers = [
  'page_load','time_3s','time_10s','scroll_25','scroll_75','exit_intent','add_to_cart','cart_value_x','product_view_2','returning_visitor'
] as const;

function makeId(...parts: string[]) { return parts.join('.'); }

export function generateCatalog(limit = 2400): Entry[] {
  const out: Entry[] = [];

  for (const s of surfaces) for (const c of components) for (const i of intents) {
    out.push({
      catalogId: makeId('storefront', c, i, s),
      category: 'STOREFRONT_UI',
      templateKind: c,
      surface: s,
      intent: i,
      requires: ['THEME_ASSETS'],
      description: `${c} for ${i} on ${s}`,
      defaults: { placement: s, intent: i },
    });
  }

  for (const s of surfaces) for (const i of intents) for (const t of triggers) {
    for (const c of ['popup','modal','drawer','toast']) {
      out.push({
        catalogId: makeId('storefront', c, i, s, 'trigger', t),
        category: 'STOREFRONT_UI',
        templateKind: c,
        surface: s,
        intent: i,
        trigger: t,
        requires: ['THEME_ASSETS'],
        description: `${c} (${t}) for ${i} on ${s}`,
        defaults: { placement: s, intent: i, trigger: t },
      });
    }
  }

  // Add other categories here similarly (admin/function/integration/flow)
  // For Day-1, keep the list small enough for humans; for AI, you can ship larger lists.
  return out.slice(0, limit);
}

if (process.argv[1]?.includes('catalog.generator')) {
  const generated = generateCatalog(2400);
  const fp = path.resolve(process.cwd(), 'src/catalog.generated.json');
  fs.writeFileSync(fp, JSON.stringify(generated, null, 2));
  // eslint-disable-next-line no-console
  console.log(`Wrote ${generated.length} entries to ${fp}`);
}
