import { json } from '@remix-run/node';
import { useLoaderData, useNavigate, useFetcher, useRevalidator } from '@remix-run/react';
import { useState, useEffect, useRef } from 'react';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { DataStoreService, PREDEFINED_STORES } from '~/services/data/data-store.service';
import { MerchantShell, useMerchantCtx } from '~/components/merchant/MerchantShell';
import { LearnMore, fmtNum, useCustomEvent, useViewMode, ViewToggle } from '~/components/merchant/polaris';

/* eslint-disable @typescript-eslint/no-explicit-any */

const KEY_REGEX = /^[a-z0-9_]+$/;

export async function loader({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);
  const prisma = getPrisma();
  const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shopRow) return json({ stores: [], predefined: PREDEFINED_STORES });

  const svc = new DataStoreService();
  const stores = await svc.listStores(shopRow.id);

  return json({ stores, predefined: PREDEFINED_STORES });
}

export default function DataIndex() {
  const { stores, predefined } = useLoaderData<typeof loader>();
  return (
    <MerchantShell polaris>
      <DataBody stores={stores} predefined={predefined} />
    </MerchantShell>
  );
}

function DataStoreCard({ d, enabled, records, onToggle, onView }: any) {
  return (
    <s-box padding="base" border="base" borderRadius="base">
      <s-stack gap="small-100">
        <s-stack direction="inline" justifyContent="space-between" alignItems="center">
          <s-icon type="database" tone="info" />
          {d.kind === 'predefined' ? (
            <s-switch
              accessibilityLabel={`${enabled ? 'Disable' : 'Enable'} ${d.name}`}
              checked={enabled || undefined}
              onChange={onToggle}
            />
          ) : (
            <s-badge tone={enabled ? 'success' : 'neutral'}>{enabled ? 'Enabled' : 'Disabled'}</s-badge>
          )}
        </s-stack>
        <s-stack gap="none">
          <s-text type="strong">{d.name}</s-text>
          <s-text color="subdued">{d.desc}</s-text>
        </s-stack>
        <s-stack direction="inline" justifyContent="space-between" alignItems="center">
          <s-text color="subdued">
            <s-text type="strong">{fmtNum(records)}</s-text> records
          </s-text>
          <s-button variant="tertiary" onClick={onView}>View records</s-button>
        </s-stack>
      </s-stack>
    </s-box>
  );
}

function DataStoreTable({ items, enabledKeys, recordsFor, onToggle, onView }: any) {
  return (
    <s-table>
      <s-table-header-row>
        <s-table-header listSlot="primary">Store</s-table-header>
        <s-table-header>Records</s-table-header>
        <s-table-header listSlot="inline">Status</s-table-header>
        <s-table-header>Actions</s-table-header>
      </s-table-header-row>
      <s-table-body>
        {items.map((d: any) => {
          const enabled = enabledKeys.has(d.key);
          return (
            <s-table-row key={d.key}>
              <s-table-cell>
                <s-stack gap="none">
                  <s-text type="strong">{d.name}</s-text>
                  <s-text tone="neutral" color="subdued">{d.desc}</s-text>
                </s-stack>
              </s-table-cell>
              <s-table-cell>{fmtNum(recordsFor(d.key))}</s-table-cell>
              <s-table-cell>
                {d.kind === 'predefined' ? (
                  <s-switch
                    accessibilityLabel={`${enabled ? 'Disable' : 'Enable'} ${d.name}`}
                    checked={enabled || undefined}
                    onChange={() => onToggle(d)}
                  />
                ) : (
                  <s-badge tone={enabled ? 'success' : 'neutral'}>{enabled ? 'Enabled' : 'Disabled'}</s-badge>
                )}
              </s-table-cell>
              <s-table-cell>
                <s-button variant="tertiary" onClick={() => onView(d)}>View records</s-button>
              </s-table-cell>
            </s-table-row>
          );
        })}
      </s-table-body>
    </s-table>
  );
}

function DataBody({ stores, predefined }: any) {
  const ctx = useMerchantCtx();
  const navigate = useNavigate();
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const { revalidate } = useRevalidator();
  const [view, setView] = useViewMode('data');
  const [modal, setModal] = useState(false);
  // Toast set at submit time, shown only once the server confirms the mutation.
  const [pendingMsg, setPendingMsg] = useState<string | null>(null);

  useEffect(() => {
    const interval = setInterval(revalidate, 30_000);
    window.addEventListener('focus', revalidate);
    return () => { clearInterval(interval); window.removeEventListener('focus', revalidate); };
  }, [revalidate]);
  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data) {
      if (fetcher.data.error) ctx.toast(fetcher.data.error, { error: true });
      else if (fetcher.data.ok && pendingMsg) ctx.toast(pendingMsg);
      if (pendingMsg) setPendingMsg(null);
      revalidate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data, revalidate]);

  const enabledKeys = new Set(stores.filter((s: any) => s.isEnabled).map((s: any) => s.key));
  const recordsFor = (key: string) => stores.find((s: any) => s.key === key)?.recordCount ?? 0;

  const toggleStore = (key: string, enable: boolean) => {
    setPendingMsg(enable ? 'Store enabled' : 'Store disabled');
    fetcher.submit({ intent: enable ? 'enable' : 'disable', key } as any, { method: 'POST', action: '/api/data-stores', encType: 'application/json' });
  };

  const createCustom = (key: string, label: string, desc: string) => {
    setPendingMsg('Custom store created');
    fetcher.submit({ intent: 'create-custom', key, label, description: desc || undefined } as any, { method: 'POST', action: '/api/data-stores', encType: 'application/json' });
    setModal(false);
  };

  const predefinedCards = predefined.map((p: any) => ({ key: p.key, name: p.label, desc: p.description, kind: 'predefined' as const }));
  const customStores = stores.filter((s: any) => !predefined.some((p: any) => p.key === s.key))
    .map((s: any) => ({ key: s.key, name: s.label, desc: s.description ?? '', kind: 'custom' as const }));

  return (
    <s-page heading="Data" inlineSize="base">
      <s-button slot="primary-action" variant="primary" icon="plus" onClick={() => setModal(true)}>
        Create custom store
      </s-button>
      <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
        <s-paragraph color="subdued">
          Predefined stores stay in sync with Shopify. Create custom stores to hold anything — reviews, waitlists, applications.{' '}
          <LearnMore anchor="guide-data" topic="data stores" />
        </s-paragraph>
        <ViewToggle view={view} onChange={setView} />
      </s-grid>
      <s-section heading="Predefined">
        {view === 'cards' ? (
          <s-grid gridTemplateColumns="repeat(auto-fill, minmax(230px, 1fr))" gap="base">
            {predefinedCards.map((d: any) => (
              <DataStoreCard key={d.key} d={d} enabled={enabledKeys.has(d.key)} records={recordsFor(d.key)}
                onToggle={() => toggleStore(d.key, !enabledKeys.has(d.key))}
                onView={() => navigate(`/data/${d.key}`)} />
            ))}
          </s-grid>
        ) : (
          <DataStoreTable items={predefinedCards} enabledKeys={enabledKeys} recordsFor={recordsFor}
            onToggle={(d: any) => toggleStore(d.key, !enabledKeys.has(d.key))}
            onView={(d: any) => navigate(`/data/${d.key}`)} />
        )}
      </s-section>
      <s-section heading="Custom stores">
        {customStores.length === 0 ? (
          <s-text color="subdued">No custom stores yet — create one to hold reviews, waitlists, or applications.</s-text>
        ) : view === 'cards' ? (
          <s-grid gridTemplateColumns="repeat(auto-fill, minmax(230px, 1fr))" gap="base">
            {customStores.map((d: any) => (
              <DataStoreCard key={d.key} d={d} enabled={enabledKeys.has(d.key)} records={recordsFor(d.key)}
                onToggle={() => toggleStore(d.key, !enabledKeys.has(d.key))}
                onView={() => navigate(`/data/${d.key}`)} />
            ))}
          </s-grid>
        ) : (
          <DataStoreTable items={customStores} enabledKeys={enabledKeys} recordsFor={recordsFor}
            onToggle={(d: any) => toggleStore(d.key, !enabledKeys.has(d.key))}
            onView={(d: any) => navigate(`/data/${d.key}`)} />
        )}
      </s-section>
      {modal && <CreateStoreModal onClose={() => setModal(false)} onCreate={createCustom} />}
    </s-page>
  );
}

/**
 * Create-custom-store form modal. Fields are controlled state (client-side key
 * validation) and the primary action lives in the modal's `primary-action`
 * slot — no DOM queries anywhere.
 */
function CreateStoreModal({ onClose, onCreate }: { onClose: () => void; onCreate: (key: string, label: string, desc: string) => void }) {
  const ctx = useMerchantCtx();
  const modalRef = useRef<HTMLElement | null>(null);
  const [customKey, setCustomKey] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  const [customDesc, setCustomDesc] = useState('');

  useEffect(() => {
    (modalRef.current as (HTMLElement & { show?: () => void }) | null)?.show?.();
  }, []);
  useCustomEvent(modalRef, 'afterhide', onClose);

  const create = () => {
    const key = customKey.trim();
    if (!key || !customLabel.trim() || !KEY_REGEX.test(key)) { ctx.toast('Enter a valid key + name', { error: true }); return; }
    onCreate(key, customLabel.trim(), customDesc.trim());
  };

  return (
    <s-modal ref={modalRef as never} heading="Create custom store">
      <s-stack gap="base">
        <s-text-field
          label="Display name"
          placeholder="Product Reviews"
          value={customLabel}
          onInput={(e) => setCustomLabel(e.currentTarget.value ?? '')}
        />
        <s-text-field
          label="Key"
          placeholder="product_reviews"
          details="Used in flows and the API — lowercase, no spaces"
          error={customKey && !KEY_REGEX.test(customKey) ? 'Use only lowercase letters, numbers and underscores' : undefined}
          value={customKey}
          onInput={(e) => setCustomKey(e.currentTarget.value ?? '')}
        />
        <s-text-area
          label="Description (optional)"
          placeholder="What does this store hold?"
          value={customDesc}
          onInput={(e) => setCustomDesc(e.currentTarget.value ?? '')}
        />
      </s-stack>
      <s-button slot="primary-action" variant="primary" onClick={create}>Create store</s-button>
      <s-button slot="secondary-actions" onClick={onClose}>Cancel</s-button>
    </s-modal>
  );
}

export { MerchantErrorBoundary as ErrorBoundary } from '~/components/merchant/MerchantErrorBoundary';
