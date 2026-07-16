import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { useState } from 'react';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { MerchantShell } from '~/components/merchant/MerchantShell';
import { Progress } from '~/components/merchant/polaris';

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

// [icon, title, description, href, anchor id] — the anchor id lets any page deep-link to its guide.
const GUIDES: [string, string, string, string, string][] = [
  ['wand', 'Generate your first module', 'Describe what you want in plain language and publish in minutes.', '/templates', 'guide-generate'],
  ['automation', 'Automate with Flows', 'Trigger steps when something happens in your store.', '/flows', 'guide-flows'],
  ['connect', 'Connect external APIs', 'Add a connector, test it, and reuse it in modules and flows.', '/connectors', 'guide-connectors'],
  ['database', 'Work with Data stores', 'Sync Shopify data or create custom stores for anything.', '/data', 'guide-data'],
  ['rocket', 'Publishing & rollback', 'Every change is versioned — preview, publish, or roll back instantly.', '/modules', 'guide-publishing'],
  ['plan', 'Plans, usage & billing', 'Understand credits, limits, and how to upgrade.', '/billing', 'guide-billing'],
  ['chat', 'Raise an issue', 'Something not working? Get an instant first response from our AI assistant.', '/support', 'guide-support'],
];
const FAQS: [string, string][] = [
  ['Is anything live before I publish?', 'No. Everything you generate is a draft. It only affects your storefront after you click Publish, and you can roll back anytime.'],
  ['What does an AI credit cost me?', 'One generation or modification uses one AI credit. Your plan includes a monthly allowance shown on the Billing page.'],
  ['Can I edit generated code?', 'Yes — use the Style builder for visual tweaks, or add scoped, sanitized custom CSS on any module.'],
  ['Will modules slow down my store?', 'Modules are scoped and lazy-loaded. Each one is validated for performance and theme safety before publishing.'],
];

export default function HelpIndex() {
  return (
    <MerchantShell polaris>
      <HelpBody />
    </MerchantShell>
  );
}

function HelpBody() {
  const { checklist } = useLoaderData<typeof loader>();
  const done = checklist.filter((c) => c[1]).length;
  return (
    <s-page heading="Help & guides" inlineSize="base">
      <s-paragraph color="subdued">Everything you need to get the most out of SuperApp AI.</s-paragraph>

      <s-grid gridTemplateColumns="2fr 1fr" gap="base">
        <s-section heading="Guides">
          <s-grid gridTemplateColumns="repeat(2, 1fr)" gap="base">
            {GUIDES.map((g) => (
              <s-clickable key={g[1]} id={g[4]} href={g[3]} padding="base" border="base" borderRadius="base">
                <s-stack gap="small-100">
                  <s-icon type={g[0] as never} tone="info" />
                  <s-stack gap="none">
                    <s-text type="strong">{g[1]}</s-text>
                    <s-text tone="neutral" color="subdued">{g[2]}</s-text>
                  </s-stack>
                  <s-stack direction="inline" gap="small-100" alignItems="center">
                    <s-text type="strong">Open</s-text>
                    <s-icon type="arrow-right" size="small" tone="info" />
                  </s-stack>
                </s-stack>
              </s-clickable>
            ))}
          </s-grid>
        </s-section>

        <s-section heading="Getting started">
          <s-stack gap="base">
            <s-grid gridTemplateColumns="1fr auto" gap="small-100" alignItems="center">
              <s-text tone="neutral" color="subdued">Onboarding progress</s-text>
              <s-text tone="neutral" color="subdued">{done} / {checklist.length}</s-text>
            </s-grid>
            <Progress value={done} max={checklist.length} />
            <s-stack gap="small-100">
              {checklist.map((c, i) => (
                <s-stack key={i} direction="inline" gap="small-100" alignItems="center">
                  <s-icon type={c[1] ? 'check-circle-filled' : 'circle-dashed'} size="small" tone={c[1] ? 'success' : 'neutral'} />
                  {c[1]
                    ? <s-text tone="neutral" color="subdued">{c[0]}</s-text>
                    : <s-text type="strong">{c[0]}</s-text>}
                </s-stack>
              ))}
            </s-stack>
          </s-stack>
        </s-section>
      </s-grid>

      <s-section heading="Frequently asked">
        <s-stack gap="none">
          {FAQS.map((f, i) => (
            <s-stack key={i} gap="none">
              {i > 0 && <s-divider />}
              <FaqRow q={f[0]} a={f[1]} />
            </s-stack>
          ))}
        </s-stack>
      </s-section>
    </s-page>
  );
}

function FaqRow({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <s-stack gap="none">
      <s-clickable onClick={() => setOpen((o) => !o)} paddingBlock="small-100">
        <s-grid gridTemplateColumns="1fr auto" gap="small-100" alignItems="center">
          <s-text type="strong">{q}</s-text>
          <s-icon type={open ? 'chevron-up' : 'chevron-down'} size="small" tone="neutral" />
        </s-grid>
      </s-clickable>
      {open && (
        <s-box paddingBlockEnd="small-100">
          <s-text tone="neutral" color="subdued">{a}</s-text>
        </s-box>
      )}
    </s-stack>
  );
}

export { MerchantErrorBoundary as ErrorBoundary } from '~/components/merchant/MerchantErrorBoundary';
