import { json } from '@remix-run/node';
import { useLoaderData, useNavigate, useFetcher, useRevalidator } from '@remix-run/react';
import { useState, useEffect } from 'react';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { DataStoreService, PREDEFINED_STORES } from '~/services/data/data-store.service';
import { MerchantShell, useMerchantCtx } from '~/components/merchant/MerchantShell';
import {
  Icon, Btn, Badge, Card, PageHead, Modal, Field, Input, Textarea, Toggle, fmtNum,
} from '~/components/superapp';

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
    <MerchantShell>
      <DataBody stores={stores} predefined={predefined} />
    </MerchantShell>
  );
}

function DataStoreCard({ d, enabled, records, onToggle, onView }: any) {
  return (
    <div className="card card-pad data-card">
      <div className="row spread" style={{ marginBottom: 12 }}>
        <span className="tile-ico" style={{ background: 'var(--p-info-bg)', color: 'var(--sa-secondary)' }}><Icon name="database" size={19} /></span>
        {d.kind === 'predefined'
          ? <label className="row spread"><Toggle checked={enabled} onChange={onToggle} /></label>
          : <Badge tone={enabled ? 'success' : undefined}>{enabled ? 'Enabled' : 'Disabled'}</Badge>}
      </div>
      <div className="t-strong">{d.name}</div>
      <div className="t-sm t-muted" style={{ marginTop: 2 }}>{d.desc}</div>
      <div className="row spread" style={{ marginTop: 14 }}>
        <span className="t-sm t-num"><b>{fmtNum(records)}</b><span className="t-muted"> records</span></span>
        <button className="btn btn-sm" onClick={onView}>View records</button>
      </div>
    </div>
  );
}

function DataBody({ stores, predefined }: any) {
  const ctx = useMerchantCtx();
  const navigate = useNavigate();
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const { revalidate } = useRevalidator();
  const [modal, setModal] = useState(false);
  const [customKey, setCustomKey] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  const [customDesc, setCustomDesc] = useState('');
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

  const createCustom = () => {
    const key = customKey.trim();
    if (!key || !customLabel.trim() || !KEY_REGEX.test(key)) { ctx.toast('Enter a valid key + name', { error: true }); return; }
    setPendingMsg('Custom store created');
    fetcher.submit({ intent: 'create-custom', key, label: customLabel.trim(), description: customDesc.trim() || undefined } as any, { method: 'POST', action: '/api/data-stores', encType: 'application/json' });
    setModal(false); setCustomKey(''); setCustomLabel(''); setCustomDesc('');
  };

  const predefinedCards = predefined.map((p: any) => ({ key: p.key, name: p.label, desc: p.description, kind: 'predefined' as const }));
  const customStores = stores.filter((s: any) => !predefined.some((p: any) => p.key === s.key))
    .map((s: any) => ({ key: s.key, name: s.label, desc: s.description ?? '', kind: 'custom' as const }));

  return (
    <div className="page">
      <PageHead
        title="Data"
        sub="Predefined stores stay in sync with Shopify. Create custom stores to hold anything — reviews, waitlists, applications."
        actions={<Btn variant="primary" icon="plus" onClick={() => setModal(true)}>Create custom store</Btn>}
      />
      <h2 className="t-h2" style={{ marginBottom: 12 }}>Predefined</h2>
      <div className="grid grid-3" style={{ marginBottom: 28 }}>
        {predefinedCards.map((d: any) => (
          <DataStoreCard key={d.key} d={d} enabled={enabledKeys.has(d.key)} records={recordsFor(d.key)}
            onToggle={() => toggleStore(d.key, !enabledKeys.has(d.key))}
            onView={() => navigate(`/data/${d.key}`)} />
        ))}
      </div>
      <div className="row spread" style={{ marginBottom: 12 }}><h2 className="t-h2">Custom stores</h2></div>
      {customStores.length === 0 ? (
        <Card pad><div className="t-sm t-muted">No custom stores yet — create one to hold reviews, waitlists, or applications.</div></Card>
      ) : (
        <div className="grid grid-3">
          {customStores.map((d: any) => (
            <DataStoreCard key={d.key} d={d} enabled={enabledKeys.has(d.key)} records={recordsFor(d.key)}
              onToggle={() => toggleStore(d.key, !enabledKeys.has(d.key))}
              onView={() => navigate(`/data/${d.key}`)} />
          ))}
        </div>
      )}
      {modal && (
        <Modal title="Create custom store" onClose={() => setModal(false)}
          footer={(
            <>
              <span className="grow" />
              <Btn onClick={() => setModal(false)}>Cancel</Btn>
              <Btn variant="primary" onClick={createCustom}>Create store</Btn>
            </>
          )}>
          <div className="stack-4">
            <Field label="Display name"><Input value={customLabel} onChange={(e: any) => setCustomLabel(e.target.value)} placeholder="Product Reviews" autoFocus /></Field>
            <Field label="Key" help="Used in flows and the API — lowercase, no spaces"
              error={customKey && !KEY_REGEX.test(customKey) ? 'Use only lowercase letters, numbers and underscores' : undefined}>
              <Input mono value={customKey} onChange={(e: any) => setCustomKey(e.target.value)} placeholder="product_reviews" />
            </Field>
            <Field label="Description" optional><Textarea value={customDesc} onChange={(e: any) => setCustomDesc(e.target.value)} placeholder="What does this store hold?" /></Field>
          </div>
        </Modal>
      )}
    </div>
  );
}
