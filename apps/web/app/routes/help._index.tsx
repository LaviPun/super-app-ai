import { json } from '@remix-run/node';
import { Link, useLoaderData } from '@remix-run/react';
import { useState } from 'react';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { MerchantShell } from '~/components/merchant/MerchantShell';
import { Icon, Card, PageHead, Progress } from '~/components/superapp';

export async function loader({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);
  const prisma = getPrisma();
  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop }, select: { id: true } });

  const [moduleCount, publishedCount, flowCount, connectorCount] = shop
    ? await Promise.all([
        prisma.module.count({ where: { shopId: shop.id } }),
        prisma.module.count({ where: { shopId: shop.id, status: 'PUBLISHED' } }),
        prisma.workflowDef.count({ where: { tenantId: shop.id } }),
        prisma.connector.count({ where: { shopId: shop.id } }),
      ])
    : [0, 0, 0, 0];

  // Real onboarding progress — each step is derived from what the store has actually done.
  const checklist: [string, boolean][] = [
    ['Connect your store', Boolean(shop)],
    ['Generate a module', moduleCount > 0],
    ['Publish to storefront', publishedCount > 0],
    ['Build your first flow', flowCount > 0],
    ['Connect an external API', connectorCount > 0],
  ];
  return json({ checklist });
}

const GUIDES: [string, string, string, string][] = [
  ['magic', 'Generate your first module', 'Describe what you want in plain language and publish in minutes.', '/templates'],
  ['flow', 'Automate with Flows', 'Trigger steps when something happens in your store.', '/flows'],
  ['connect', 'Connect external APIs', 'Add a connector, test it, and reuse it in modules and flows.', '/connectors'],
  ['database', 'Work with Data stores', 'Sync Shopify data or create custom stores for anything.', '/data'],
  ['rocket', 'Publishing & rollback', 'Every change is versioned — preview, publish, or roll back instantly.', '/modules'],
  ['plan', 'Plans, usage & billing', 'Understand credits, limits, and how to upgrade.', '/billing'],
  ['chat', 'Raise an issue', 'Something not working? Get an instant first response from our AI assistant.', '/support'],
];
const FAQS: [string, string][] = [
  ['Is anything live before I publish?', 'No. Everything you generate is a draft. It only affects your storefront after you click Publish, and you can roll back anytime.'],
  ['What does an AI credit cost me?', 'One generation or modification uses one AI credit. Your plan includes a monthly allowance shown on the Billing page.'],
  ['Can I edit generated code?', 'Yes — use the Style builder for visual tweaks, or add scoped, sanitized custom CSS on any module.'],
  ['Will modules slow down my store?', 'Modules are scoped and lazy-loaded. Each one is validated for performance and theme safety before publishing.'],
];

export default function HelpIndex() {
  return (
    <MerchantShell>
      <HelpBody />
    </MerchantShell>
  );
}

function HelpBody() {
  const { checklist } = useLoaderData<typeof loader>();
  const done = checklist.filter((c) => c[1]).length;
  return (
    <div className="page">
      <PageHead
        title="Help & guides"
        sub="Everything you need to get the most out of SuperApp AI."
      />
      <div className="col-main" style={{ marginBottom: 18 }}>
        <div className="grid grid-2">
          {GUIDES.map((g) => (
            <Link key={g[1]} to={g[3]} className="card card-pad stack-2" style={{ textDecoration: 'none', color: 'inherit' }}>
              <span className="tile-ico" style={{ background: 'var(--p-info-bg)', color: 'var(--sa-primary)' }}><Icon name={g[0]} size={19} /></span>
              <div className="t-h3">{g[1]}</div>
              <div className="t-sm t-muted">{g[2]}</div>
              <div className="row-1 t-sm" style={{ color: 'var(--sa-primary)', fontWeight: 600, marginTop: 2 }}>Open<Icon name="arrowRight" size={14} /></div>
            </Link>
          ))}
        </div>
        <Card pad>
          <div className="row spread" style={{ marginBottom: 12 }}>
            <div className="t-h3">Getting started</div>
            <span className="t-xs t-muted t-num">{done} / {checklist.length}</span>
          </div>
          <Progress value={(done / checklist.length) * 100} />
          <div className="stack-2" style={{ marginTop: 14 }}>
            {checklist.map((c, i) => (
              <div key={i} className="row-2">
                <span className={'check-ring' + (c[1] ? ' on' : '')}>{c[1] && <Icon name="check" size={12} />}</span>
                <span className={'t-sm' + (c[1] ? ' t-muted' : ' t-strong')} style={c[1] ? { textDecoration: 'line-through' } : undefined}>{c[0]}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <Card pad>
        <div className="t-h3" style={{ marginBottom: 6 }}>Frequently asked</div>
        <div className="stack">{FAQS.map((f, i) => <FaqRow key={i} q={f[0]} a={f[1]} />)}</div>
      </Card>
    </div>
  );
}

function FaqRow({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="faq-row">
      <button className="faq-q" onClick={() => setOpen((o) => !o)}>
        <span className="grow t-sm t-strong" style={{ textAlign: 'left' }}>{q}</span>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={16} className="t-muted" />
      </button>
      {open && <div className="t-sm t-muted" style={{ padding: '0 0 12px', lineHeight: 1.55 }}>{a}</div>}
    </div>
  );
}
