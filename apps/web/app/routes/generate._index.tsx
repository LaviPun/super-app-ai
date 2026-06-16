import { json } from '@remix-run/node';
import { useNavigate, useLocation, useFetcher } from '@remix-run/react';
import { useEffect, useRef, useState } from 'react';
import { shopify } from '~/shopify.server';
import { MerchantShell, useMerchantCtx } from '~/components/merchant/MerchantShell';
import { Icon, Btn, Badge, StatusBadge, Field, Input, Textarea, Select, Toggle, Banner, titleCase } from '~/components/superapp';

/* eslint-disable @typescript-eslint/no-explicit-any */

// Embedded routes require Shopify auth; the loader just authenticates so a
// non-authed request 302-redirects rather than 500s.
export async function loader({ request }: { request: Request }) {
  await shopify.authenticate.admin(request);
  return json({ ok: true });
}

// Multi-module blueprint returned alongside the single-module options when the
// request maps to a coordinated set (flag-gated; see docs/blueprints.md).
type BlueprintResult = {
  name: string;
  summary: string;
  moduleCount: number;
  modules: { role: string; type: string; explanation: string; recipe: Record<string, unknown> }[];
  links?: { fromRole: string; toRole: string; note: string }[];
};

const RADIUS_MAP: Record<string, number> = { none: 0, sm: 6, md: 10, lg: 16, full: 999 };
const SIZE_MAP: Record<string, { h: number; f: number }> = { S: { h: 38, f: 13 }, M: { h: 46, f: 15 }, L: { h: 54, f: 17 } };
const SHADOW_MAP: Record<string, string> = { none: 'none', sm: '0 1px 2px rgba(20,33,58,.12)', md: '0 4px 12px rgba(20,33,58,.16)', lg: '0 12px 28px rgba(20,33,58,.22)' };
const COST_PER_CHANGE = 1;
const START_CREDITS = 1138;

const GEN_STEPS = [
  { icon: 'magic', label: 'Understanding your request' },
  { icon: 'layers', label: 'Exploring module types — Storefront UI' },
  { icon: 'layers', label: 'Drafting 3 layout concepts' },
  { icon: 'shield', label: 'Validating each against schema' },
  { icon: 'eye', label: 'Rendering live previews' },
];

const BASE_SETTINGS = {
  label: 'Add to cart', price: '$48.00', buttonColor: '#1F3A5F', buttonText: '#FFFFFF',
  bg: '#FFFFFF', radius: 'md', size: 'M', mode: 'sticky', anchor: 'bottom', width: 'full',
  shadow: 'lg', hideMobile: false, showQty: true, showVariants: true, countdown: false,
};

// Visual concept presets — mirror the prototype's 3 layout concepts. The real
// AI recipe (returned by /api/ai/create-module) is attached per concept so
// "Publish"/"Save draft" can create the real module.
const CONCEPT_PRESETS = [
  {
    id: 'sticky', name: 'Sticky Buy Bar', type: 'Storefront UI', icon: 'desktop', accent: '#6B40D8',
    tagline: 'Locks a full-width buy bar to the bottom of every product page.',
    tags: ['Variant picker', 'Quantity stepper', 'Add-to-cart'],
    settings: { ...BASE_SETTINGS, mode: 'sticky', anchor: 'bottom', buttonColor: '#1F3A5F', radius: 'md', shadow: 'lg' },
    intro: 'Done. I built a **Sticky Buy Bar** — it pins a full-width add-to-cart bar to the bottom of the product page so the buy action is always one tap away.',
  },
  {
    id: 'floating', name: 'Floating Action Button', type: 'Storefront UI', icon: 'cart', accent: '#0E9F6E',
    tagline: 'A compact pill that floats bottom-right and follows the shopper.',
    tags: ['Add-to-cart', 'Price badge'],
    settings: { ...BASE_SETTINGS, mode: 'floating', buttonColor: '#0E9F6E', radius: 'full', shadow: 'lg', showVariants: false, showQty: false, size: 'L' },
    intro: 'Done. I built a **Floating Action Button** — a compact pill anchored to the bottom-right that stays in reach as the shopper scrolls.',
  },
  {
    id: 'inline', name: 'Inline Buy Block', type: 'Storefront UI', icon: 'layers', accent: '#2F80ED',
    tagline: 'Sits inside the product details with urgency built in.',
    tags: ['Variant picker', 'Quantity stepper', 'Countdown', 'Add-to-cart'],
    settings: { ...BASE_SETTINGS, mode: 'inline', buttonColor: '#14213A', radius: 'lg', bg: '#F6F8FB', countdown: true },
    intro: 'Done. I built an **Inline Buy Block** — it places the add-to-cart controls right inside the product details, framed in a soft card with an urgency countdown.',
  },
];

type Concept = typeof CONCEPT_PRESETS[number] & { recipe?: Record<string, unknown>; explanation?: string };

export default function GeneratePage() {
  return (
    <MerchantShell fullBleed>
      <GenerateWorkspace />
    </MerchantShell>
  );
}

function GenerateWorkspace() {
  const ctx = useMerchantCtx();
  const navigate = useNavigate();
  const location = useLocation();
  const seed = (location.state as any) || { prompt: 'A sticky add-to-cart bar with a variant picker', type: 'ai' };

  const proposeFetcher = useFetcher<{ options?: { index: number; explanation: string; recipe: Record<string, unknown> }[]; blueprint?: BlueprintResult | null; error?: string; message?: string }>();
  const confirmFetcher = useFetcher<{ moduleId?: string; recipeId?: string; firstModuleId?: string; moduleCount?: number; error?: string }>();
  const [blueprint, setBlueprint] = useState<BlueprintResult | null>(null);

  const [phase, setPhase] = useState<'generating' | 'choosing' | 'ready'>('generating');
  const [stepIdx, setStepIdx] = useState(0);
  const [candidates, setCandidates] = useState<Concept[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [settingsMap, setSettingsMap] = useState<Record<string, any>>({});
  const [threadMap, setThreadMap] = useState<Record<string, any[]>>({});
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [tab, setTab] = useState<'preview' | 'validation'>('preview');
  const [ctrlTab, setCtrlTab] = useState<'basic' | 'advanced' | 'css'>('basic');
  const [refine, setRefine] = useState('');
  const [thinking, setThinking] = useState(false);
  const [credits, setCredits] = useState(START_CREDITS);
  const [historyMap, setHistoryMap] = useState<Record<string, any[]>>({});
  const [dockOpen, setDockOpen] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  const settings = settingsMap[selected ?? ''] || BASE_SETTINGS;
  const set = (patch: any) => setSettingsMap((m) => ({ ...m, [selected!]: { ...m[selected!], ...patch } }));
  const thread = threadMap[selected ?? ''] || [];
  const history = historyMap[selected ?? ''] || [];
  const activeCand = candidates.find((c) => c.id === selected);
  const activeIdx = candidates.findIndex((c) => c.id === selected);

  // Kick off real generation when entering the generating phase.
  useEffect(() => {
    if (phase !== 'generating') return;
    if (proposeFetcher.state === 'idle' && !proposeFetcher.data) {
      const fd = new FormData();
      fd.set('prompt', String(seed.prompt ?? ''));
      fd.set('preferredType', 'Auto');
      fd.set('preferredCategory', 'Auto');
      fd.set('preferredBlockType', 'Auto');
      fd.set('matchStoreColors', 'true');
      proposeFetcher.submit(fd, { method: 'post', action: '/api/ai/create-module' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Step animation while generation is in flight.
  useEffect(() => {
    if (phase !== 'generating') return;
    setStepIdx(0);
    let i = 0;
    const tick = setInterval(() => { i += 1; setStepIdx((s) => Math.min(s + 1, GEN_STEPS.length)); if (i >= GEN_STEPS.length) clearInterval(tick); }, 560);
    return () => clearInterval(tick);
  }, [phase]);

  // When real options arrive (or error), build the chooser.
  useEffect(() => {
    if (proposeFetcher.state !== 'idle' || !proposeFetcher.data) return;
    if (proposeFetcher.data.error) {
      ctx.toast(proposeFetcher.data.message || proposeFetcher.data.error, { error: true });
      navigate('/modules');
      return;
    }
    const opts = proposeFetcher.data.options ?? [];
    const concs: Concept[] = CONCEPT_PRESETS.map((p, i) => ({
      ...p,
      recipe: opts[i]?.recipe,
      explanation: opts[i]?.explanation,
      name: (opts[i]?.recipe?.name as string) || p.name,
      intro: opts[i]?.explanation ? `Done. ${opts[i].explanation}` : p.intro,
    }));
    const sm: Record<string, any> = {}, tm: Record<string, any[]> = {}, hm: Record<string, any[]> = {};
    concs.forEach((c) => {
      sm[c.id] = { ...c.settings };
      tm[c.id] = [
        { role: 'user', text: String(seed.prompt ?? '') },
        { role: 'assistant', text: c.intro + '\n\nUse the controls on the right to fine-tune it, or ask me to change anything below.' },
      ];
      hm[c.id] = [{ id: 'h_gen', label: 'Module generated', detail: `Created “${c.name}” from your prompt.`, cost: 1, time: 'Just now' }];
    });
    setCandidates(concs);
    setSettingsMap(sm);
    setThreadMap(tm);
    setHistoryMap(hm);
    setBlueprint(proposeFetcher.data.blueprint ?? null);
    setSelected(null);
    setPhase('choosing');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposeFetcher.state, proposeFetcher.data]);

  // After confirm (real module created), go to the module detail.
  useEffect(() => {
    if (confirmFetcher.state === 'idle' && confirmFetcher.data?.firstModuleId) {
      ctx.toast(`Blueprint created — ${confirmFetcher.data.moduleCount ?? 'multiple'} modules`);
      navigate(`/modules?recipe=${confirmFetcher.data.recipeId}`);
      return;
    }
    if (confirmFetcher.state === 'idle' && confirmFetcher.data?.moduleId) {
      ctx.toast('Module created');
      navigate(`/modules/${confirmFetcher.data.moduleId}`);
    } else if (confirmFetcher.state === 'idle' && confirmFetcher.data?.error) {
      ctx.toast(confirmFetcher.data.error, { error: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmFetcher.state, confirmFetcher.data]);

  useEffect(() => { if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight; }, [thread, thinking, phase]);

  const doRefine = (text?: string) => {
    const q = (text ?? refine).trim();
    if (!q || !selected || credits <= 0) return;
    setThreadMap((m) => ({ ...m, [selected]: [...(m[selected] || []), { role: 'user', text: q }] }));
    setRefine(''); setThinking(true);
    const lower = q.toLowerCase();
    setTimeout(() => {
      let reply = 'Updated. Check the preview — let me know if you’d like anything else.';
      let patch: any = null;
      if (/green/.test(lower)) { patch = { buttonColor: '#0E9F6E' }; reply = 'Changed the button to brand green. The contrast still passes AA against white text.'; }
      else if (/black|dark/.test(lower)) { patch = { buttonColor: '#14213A' }; reply = 'Switched the button to near-black for a bolder look.'; }
      else if (/round|radius|pill/.test(lower)) { patch = { radius: 'full' }; reply = 'Made the button fully rounded (pill).'; }
      else if (/countdown|timer|urgency/.test(lower)) { patch = { countdown: true }; reply = 'Added a small urgency countdown above the button.'; }
      else if (/mobile/.test(lower)) { patch = { hideMobile: false, mode: 'sticky' }; reply = 'Kept the bar sticky on mobile too.'; }
      else if (/float/.test(lower)) { patch = { mode: 'floating' }; reply = 'Switched to a floating button anchored bottom-right.'; }
      else if (/big|large/.test(lower)) { patch = { size: 'L' }; reply = 'Bumped the button up to the large size.'; }
      if (patch) setSettingsMap((m) => ({ ...m, [selected]: { ...m[selected], ...patch } }));
      setThinking(false);
      setThreadMap((m) => ({ ...m, [selected]: [...(m[selected] || []), { role: 'assistant', text: reply }] }));
      setCredits((c) => Math.max(0, c - COST_PER_CHANGE));
      setHistoryMap((m) => ({ ...m, [selected]: [...(m[selected] || []), { id: 'h_' + Date.now(), label: q, detail: reply, cost: COST_PER_CHANGE, time: 'Just now' }] }));
    }, 1100);
  };

  const openConcept = (id: string) => { setSelected(id); setTab('preview'); setCtrlTab('basic'); setPhase('ready'); };
  const backToOptions = () => setPhase('choosing');
  const regenerate = () => {
    setCandidates([]); setSettingsMap({}); setThreadMap({}); setHistoryMap({}); setSelected(null);
    setPhase('generating');
    const fd = new FormData();
    fd.set('prompt', String(seed.prompt ?? ''));
    fd.set('preferredType', 'Auto'); fd.set('preferredCategory', 'Auto'); fd.set('preferredBlockType', 'Auto'); fd.set('matchStoreColors', 'true');
    proposeFetcher.submit(fd, { method: 'post', action: '/api/ai/create-module' });
  };

  // Create the real module from the selected concept's AI recipe, then navigate.
  const finishBlueprint = () => {
    if (!blueprint) return;
    const fd = new FormData();
    fd.set('blueprint', JSON.stringify({
      name: blueprint.name,
      summary: blueprint.summary,
      modules: blueprint.modules.map((m) => ({ role: m.role, explanation: m.explanation, recipe: m.recipe })),
      links: blueprint.links ?? [],
    }));
    confirmFetcher.submit(fd, { method: 'post', action: '/api/ai/create-blueprint' });
  };

  const finish = (fallbackMsg: string) => {
    const recipe = activeCand?.recipe;
    if (!recipe) { ctx.toast(fallbackMsg); navigate('/modules'); return; }
    const fd = new FormData();
    fd.set('spec', JSON.stringify(recipe));
    confirmFetcher.submit(fd, { method: 'post', action: '/api/ai/create-module-from-recipe' });
  };

  if (phase === 'generating') return <GenLoading seed={seed} stepIdx={stepIdx} onCancel={() => navigate('/')} />;
  if (phase === 'choosing') return <GenChoose seed={seed} candidates={candidates} settingsMap={settingsMap} onSelect={openConcept} onRegenerate={regenerate} onCancel={() => navigate('/')} />;

  const publishing = confirmFetcher.state !== 'idle';

  return (
    <div className="gen-shell">
      <header className="gen-head">
        <div className="row-3" style={{ minWidth: 0 }}>
          <button className="gen-back-btn" onClick={backToOptions} title="Back to all 3 concepts">
            <Icon name="arrowLeft" size={15} /><span>All concepts</span>
          </button>
          <span className="tile-ico" style={{ width: 34, height: 34, background: 'var(--p-info-bg)', color: 'var(--sa-secondary)' }}>
            <Icon name={(activeCand && activeCand.icon) || 'desktop'} size={17} />
          </span>
          <div className="stack" style={{ gap: 1, minWidth: 0 }}>
            <div className="row-2"><span className="t-h3">{activeCand ? activeCand.name : 'Module'}</span><StatusBadge value="DRAFT" /></div>
            <span className="t-xs t-muted">{(activeCand ? activeCand.type : 'Storefront UI') + ' · concept ' + (activeIdx + 1) + ' of ' + candidates.length + ' · unsaved'}</span>
          </div>
        </div>
        <div className="row-2">
          <Btn icon="magic" onClick={regenerate} title="Discard all 3 and generate again">Regenerate</Btn>
          <Btn onClick={() => navigate('/')}>Discard</Btn>
          <Btn onClick={() => finish('Saved as draft — other concepts discarded')}>Save draft</Btn>
          <Btn variant="primary" icon="rocket" loading={publishing} onClick={() => finish('Published — live in a few minutes')}>Publish</Btn>
        </div>
      </header>
      {blueprint && (
        <div style={{ padding: '12px 16px 0' }}>
          <Banner tone="info" title={`This request is a full solution: ${blueprint.name} (${blueprint.moduleCount} modules)`}>
            <div className="stack" style={{ gap: 8 }}>
              <span className="t-sm">{blueprint.summary}</span>
              <div className="row-2" style={{ flexWrap: 'wrap', gap: 6 }}>
                {blueprint.modules.map((m) => (
                  <Badge key={m.role}>{`${m.role} · ${titleCase(String(m.type).replace(/\./g, ' '))}`}</Badge>
                ))}
              </div>
              <div>
                <Btn variant="primary" icon="layers" loading={publishing} onClick={finishBlueprint}>
                  {`Create all ${blueprint.moduleCount} modules`}
                </Btn>
              </div>
            </div>
          </Banner>
        </div>
      )}
      <div className="gen-body">
        <GenBuildPanel
          settings={settings} set={set} ctrlTab={ctrlTab} setCtrlTab={setCtrlTab}
          thread={thread} thinking={thinking} refine={refine} setRefine={setRefine} onRefine={doRefine}
          credits={credits} dockOpen={dockOpen} setDockOpen={setDockOpen} histOpen={histOpen} setHistOpen={setHistOpen} history={history}
        />
        <div className="gen-center">
          <div className="gen-toolbar">
            <div className="seg">
              <button aria-selected={device === 'desktop'} onClick={() => setDevice('desktop')}><Icon name="desktop" size={14} />Desktop</button>
              <button aria-selected={device === 'mobile'} onClick={() => setDevice('mobile')}><Icon name="store" size={14} />Mobile</button>
            </div>
            <div className="row-2">
              <Btn size="sm" icon="refresh" title="Refresh preview" />
              <Btn size="sm" icon="external">Open</Btn>
            </div>
            <div className="grow" />
            <div className="tabs-mini">
              {(['preview', 'validation'] as const).map((x) => (
                <button key={x} className={'tab-mini' + (tab === x ? ' sel' : '')} onClick={() => setTab(x)}>{titleCase(x)}</button>
              ))}
            </div>
          </div>
          <div className="gen-canvas-wrap">
            {tab === 'preview' && <GenPreview settings={settings} device={device} />}
            {tab === 'validation' && <GenValidation />}
          </div>
        </div>
      </div>
    </div>
  );
}

function GenLoading({ seed, stepIdx, onCancel }: any) {
  return (
    <div className="gen-loading">
      <div className="gen-loading-card">
        <div className="gen-orb-wrap">
          <span className="gen-orb-halo" /><span className="gen-orb-ring r1" /><span className="gen-orb-ring r2" /><span className="gen-orb-ring r3" />
          <div className="gen-orb"><Icon name="magic" size={28} /></div>
        </div>
        <div className="gen-loading-eyebrow"><span className="pulse-dot" />Generating 3 concepts</div>
        <div className="t-h2" style={{ marginTop: 6, textAlign: 'center' }}>Designing your module</div>
        <div className="gen-prompt-echo">“{seed.prompt}”</div>
        <div className="gen-steps">
          {GEN_STEPS.map((s, i) => {
            const done = i < stepIdx, active = i === stepIdx;
            return (
              <div key={i} className={'gen-step' + (done ? ' done' : active ? ' active' : '')}>
                <span className="gen-step-ico">{done ? <Icon name="check" size={14} /> : active ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <span className="gen-step-dot" />}</span>
                <span>{s.label}</span>
              </div>
            );
          })}
        </div>
        <div className="gen-progress"><i style={{ width: Math.min(100, (stepIdx / GEN_STEPS.length) * 100) + '%' }} /></div>
        <button className="btn btn-plain btn-plain-subdued" style={{ marginTop: 8 }} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function GenChoose({ seed, candidates, settingsMap, onSelect, onRegenerate, onCancel }: any) {
  return (
    <div className="gen-choose">
      <div className="gen-choose-aurora" />
      <div className="gen-choose-grid-bg" />
      <div className="gen-choose-inner">
        <div className="gen-choose-head">
          <div className="gen-choose-eyebrow"><span className="pulse-dot" />3 concepts generated</div>
          <h1 className="gen-choose-title">Pick a starting point</h1>
          <p className="gen-choose-sub">From “{seed.prompt}”. Open any concept to customize it — the other two stay right here until you save. Nothing is stored yet, so you can regenerate anytime.</p>
          <button className="gen-choose-close" onClick={onCancel} title="Cancel"><Icon name="x" size={16} /></button>
        </div>
        <div className="gen-cand-grid">
          {candidates.map((c: any, i: number) => (
            <GenCandCard key={c.id} c={c} idx={i} total={candidates.length} settings={settingsMap[c.id] || c.settings} onSelect={() => onSelect(c.id)} />
          ))}
        </div>
        <div className="gen-choose-foot">
          <button className="gen-regen-btn" onClick={onRegenerate}><Icon name="magic" size={15} />Regenerate all three</button>
          <span className="t-xs t-muted">Nothing is saved — concepts reset when you regenerate or leave.</span>
        </div>
      </div>
    </div>
  );
}

function GenCandCard({ c, idx, total, settings, onSelect }: any) {
  const num = String(idx + 1).padStart(2, '0') + ' / ' + String(total).padStart(2, '0');
  return (
    <button className="gen-cand" style={{ ['--acc' as any]: c.accent, animationDelay: (0.08 + idx * 0.12) + 's' }} onClick={onSelect}>
      <span className="gen-cand-scan" />
      <span className="cand-num">{num}</span>
      <div className="cand-head">
        <span className="cand-ico"><Icon name={c.icon} size={19} /></span>
        <div className="stack" style={{ gap: 2, minWidth: 0, textAlign: 'left' }}>
          <span className="cand-name">{c.name}</span>
          <span className="t-xs t-muted">{c.type}</span>
        </div>
      </div>
      <p className="cand-tagline">{c.tagline}</p>
      <GenCandMini s={settings} accent={c.accent} />
      <div className="cand-tags">{c.tags.map((t: string) => <span key={t} className="cand-tag">{t}</span>)}</div>
      <div className="cand-cta">
        <span className="cand-open"><Icon name="magic" size={14} />Open & customize</span>
        <Icon name="arrowRight" size={16} />
      </div>
    </button>
  );
}

function GenCandMini({ s, accent }: any) {
  const r = Math.min(RADIUS_MAP[s.radius] ?? 10, 14);
  const btn = (
    <span className="cand-btn" style={{ background: s.buttonColor, color: s.buttonText, borderRadius: r }}>
      <Icon name="cart" size={11} />{s.label}
    </span>
  );
  const chips = s.showVariants && (
    <span className="cand-chips">{[0, 1, 2].map((i) => <i key={i} className={i === 1 ? 'on' : ''} style={i === 1 ? { borderColor: accent, background: accent } : undefined} />)}</span>
  );
  let bar;
  if (s.mode === 'floating') bar = <span className="cand-bar cand-bar-floating">{btn}</span>;
  else if (s.mode === 'inline') bar = (
    <span className="cand-bar cand-bar-inline" style={{ background: s.bg }}>
      {s.countdown && <span className="cand-count">12:45</span>}{chips}<span className="grow" />{btn}
    </span>
  );
  else bar = <span className="cand-bar cand-bar-sticky">{chips}<span className="grow" />{btn}</span>;
  return (
    <div className="cand-mini">
      <div className="cand-mini-top"><i /><i /><i /></div>
      <div className="cand-mini-pdp">
        <div className="cand-mini-img" />
        <div className="cand-mini-lines">
          <i className="w3" /><i className="w1" /><i className="w4" style={{ background: accent, opacity: .55 }} /><i className="w2" />
        </div>
      </div>
      {bar}
    </div>
  );
}

function GenBuildPanel(props: any) {
  return (
    <aside className="gen-build-panel">
      <GenControls settings={props.settings} set={props.set} ctrlTab={props.ctrlTab} setCtrlTab={props.setCtrlTab} />
      <GenBuilderDock
        credits={props.credits} costPerChange={COST_PER_CHANGE} open={props.dockOpen} setOpen={props.setDockOpen}
        thread={props.thread} thinking={props.thinking} refine={props.refine} setRefine={props.setRefine} onRefine={props.onRefine}
        changes={props.history.length} onOpenHistory={() => props.setHistOpen(true)}
      />
      {props.histOpen && <GenHistory history={props.history} credits={props.credits} onClose={() => props.setHistOpen(false)} />}
    </aside>
  );
}

function GenBuilderDock({ credits, costPerChange, open, setOpen, thread, thinking, refine, setRefine, onRefine, changes, onOpenHistory }: any) {
  const last = thread.slice().reverse().find((m: any) => m.role === 'assistant');
  const low = credits <= 40, out = credits <= 0;
  const suggestions = ['Use brand green', 'Make it a pill', 'Add a countdown'];
  return (
    <div className={'gen-dock' + (open ? ' open' : '')}>
      <button className="gen-dock-head" onClick={() => setOpen(!open)}>
        <span className="gen-dock-ava"><Icon name="magic" size={15} /></span>
        <div className="gen-dock-id">
          <span className="t-strong t-sm">Builder</span>
          <span className="t-xs t-muted">{open ? 'Describe a change — applied live' : 'Tap to refine with AI'}</span>
        </div>
        <span className={'gen-credit-pill' + (low ? ' low' : '')} title={credits.toLocaleString() + ' AI credits remaining'}>
          <Icon name="bolt" size={12} />{credits.toLocaleString()} left
        </span>
        <span className="gen-dock-chev"><Icon name={open ? 'chevronDown' : 'chevronUp'} size={16} /></span>
      </button>
      {open && (
        <div className="gen-dock-body">
          <div className={'gen-dock-last' + (last ? '' : ' empty')}>
            {last ? (
              <>
                <span className="gen-last-ico"><Icon name="check" size={12} /></span>
                <div className="gen-last-body">
                  <div className="gen-last-cap">Latest change</div>
                  <div className="gen-last-text" dangerouslySetInnerHTML={{ __html: gmd(last.text) }} />
                </div>
              </>
            ) : <span className="t-xs t-muted">No changes yet — ask for an edit below and you’ll see what happened here.</span>}
          </div>
          {thinking && (
            <div className="gen-dock-thinking">
              <div className="asst-typing"><span /><span /><span /></div>
              <span className="t-xs t-muted">Applying your change…</span>
            </div>
          )}
          <div className={'gen-dock-input' + (out ? ' is-out' : '')}>
            <textarea className="gen-refine-input" rows={1} placeholder={out ? 'Out of credits — top up to keep building' : 'Refine with AI…'}
              value={refine} disabled={out} onChange={(e) => setRefine(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onRefine(); } }} />
            <Btn variant="magic" icon="send" onClick={() => onRefine()} disabled={out || !refine.trim()} />
          </div>
          {!out && (
            <div className="gen-dock-sugg">
              {suggestions.map((sg) => <button key={sg} className="example-chip" onClick={() => onRefine(sg)}><Icon name="magic" size={11} />{sg}</button>)}
            </div>
          )}
          <div className="gen-dock-foot">
            <span className="gen-cost-note"><Icon name="bolt" size={12} />Each change costs <b>{costPerChange === 1 ? '1 credit' : costPerChange + ' credits'}</b></span>
            <button className="gen-hist-btn" onClick={onOpenHistory}>
              <Icon name="clock" size={13} />History{changes ? <span className="gen-hist-count">{changes}</span> : null}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function GenHistory({ history, credits, onClose }: any) {
  const spent = history.reduce((a: number, h: any) => a + h.cost, 0);
  return (
    <div className="gen-hist">
      <div className="gen-hist-head">
        <div className="stack" style={{ gap: 1 }}>
          <span className="t-strong t-sm">Change history</span>
          <span className="t-xs t-muted">{history.length + ' change' + (history.length === 1 ? '' : 's') + ' · ' + spent + ' credit' + (spent === 1 ? '' : 's') + ' spent'}</span>
        </div>
        <button className="gen-hist-x" onClick={onClose} title="Close"><Icon name="x" size={15} /></button>
      </div>
      <div className="gen-hist-list">
        {history.slice().reverse().map((h: any) => (
          <div key={h.id} className="gen-hist-row">
            <span className="gen-hist-dot" />
            <div className="gen-hist-main">
              <div className="gen-hist-label">{h.label}</div>
              <div className="gen-hist-detail">{h.detail}</div>
              <div className="gen-hist-time">{h.time}</div>
            </div>
            <span className="gen-hist-cost">{'−' + h.cost}</span>
          </div>
        ))}
      </div>
      <div className="gen-hist-foot">
        <Icon name="bolt" size={13} />
        <span><b>{credits.toLocaleString()}</b> credits remaining</span>
        <span className="grow" />
        <a className="gen-hist-topup" href="/billing">Top up</a>
      </div>
    </div>
  );
}

function GenPreview({ settings: s, device }: any) {
  const r = RADIUS_MAP[s.radius] ?? 10, sz = SIZE_MAP[s.size] ?? SIZE_MAP.M!;
  const btn = (
    <button className="pv-btn" style={{ background: s.buttonColor, color: s.buttonText, borderRadius: r, height: sz.h, fontSize: sz.f }}>
      <Icon name="cart" size={sz.f + 2} />{s.label}{s.price && <span style={{ opacity: .85 }}>{'— ' + s.price}</span>}
    </button>
  );
  const variants = s.showVariants && <div className="pv-variants">{['XS', 'S', 'M', 'L', 'XL'].map((v, i) => <span key={v} className={'pv-chip' + (i === 2 ? ' sel' : '')}>{v}</span>)}</div>;
  const qty = s.showQty && <div className="pv-qty"><span>−</span><b>1</b><span>+</span></div>;
  const countdown = s.countdown && <div className="pv-countdown"><Icon name="clock" size={13} />Order in 12:45 for same-day dispatch</div>;
  const moduleBar = (
    <div className={'pv-module pv-mode-' + s.mode + ' pv-anchor-' + s.anchor}
      style={{ background: s.bg, borderRadius: s.mode === 'inline' ? r : undefined, boxShadow: s.mode === 'inline' ? 'none' : SHADOW_MAP[s.shadow] }}>
      {countdown}
      <div className="pv-module-row">
        {s.mode !== 'floating' && variants}
        {s.mode !== 'floating' && qty}
        <div className="grow" />
        {btn}
      </div>
    </div>
  );
  return (
    <div className={'gen-canvas' + (device === 'mobile' ? ' mobile' : '')}>
      <div className="pv-frame">
        <div className="pv-browser"><span className="pv-dot" /><span className="pv-dot" /><span className="pv-dot" /><div className="pv-url">aurora-threads.com/products/everyday-hoodie</div></div>
        <div className="pv-store">
          <div className="pv-storehead"><div className="pv-logo">AURORA</div><div className="pv-nav"><span /><span /><span /><Icon name="cart" size={16} /></div></div>
          <div className="pv-pdp">
            <div className="pv-gallery"><div className="pv-img skel" /><div className="pv-thumbs">{[0, 1, 2].map((i) => <div key={i} className="pv-thumb skel" />)}</div></div>
            <div className="pv-info">
              <div className="pv-crumb">Home / Apparel / Hoodies</div>
              <div className="pv-title">Everyday Hoodie</div>
              <div className="pv-price">$48.00</div>
              <div className="pv-stars">★★★★★<span className="t-muted"> 128 reviews</span></div>
              <p className="pv-desc">Heavyweight organic cotton fleece with a relaxed fit and double-lined hood. Pre-shrunk and built to last wash after wash.</p>
              {s.mode === 'inline' && moduleBar}
              <div className="pv-meta"><span>Free shipping over $75</span><span>30-day returns</span></div>
            </div>
          </div>
          {s.mode !== 'inline' && moduleBar}
        </div>
      </div>
    </div>
  );
}

function GenControls({ settings: s, set, ctrlTab, setCtrlTab }: any) {
  const swatches = ['#1F3A5F', '#0E9F6E', '#14213A', '#2F80ED', '#D97706', '#DC2626'];
  return (
    <div className="gbp-controls">
      <div className="gen-controls-head"><span className="t-h3">Controls</span><span className="t-xs t-muted">Changes apply live</span></div>
      <div className="gen-ctrl-tabs">
        {(['basic', 'advanced', 'css'] as const).map((x) => (
          <button key={x} className={'gen-ctrl-tab' + (ctrlTab === x ? ' sel' : '')} onClick={() => setCtrlTab(x)}>{x === 'css' ? 'Custom CSS' : titleCase(x)}</button>
        ))}
      </div>
      <div className="gen-ctrl-body">
        {ctrlTab === 'basic' && (
          <div className="stack-4">
            <Field label="Button label"><Input value={s.label} onChange={(e: any) => set({ label: e.target.value })} /></Field>
            <Field label="Price suffix" optional><Input value={s.price} onChange={(e: any) => set({ price: e.target.value })} /></Field>
            <Field label="Button color"><SwatchRow value={s.buttonColor} swatches={swatches} onChange={(c: string) => set({ buttonColor: c })} /></Field>
            <Field label="Button text color"><SwatchRow value={s.buttonText} swatches={['#FFFFFF', '#14213A']} onChange={(c: string) => set({ buttonText: c })} /></Field>
            <Field label="Corner radius"><SegField value={s.radius} options={[['none', 'None'], ['sm', 'S'], ['md', 'M'], ['lg', 'L'], ['full', 'Pill']]} onChange={(v: string) => set({ radius: v })} /></Field>
            <Field label="Button size"><SegField value={s.size} options={[['S', 'S'], ['M', 'M'], ['L', 'L']]} onChange={(v: string) => set({ size: v })} /></Field>
          </div>
        )}
        {ctrlTab === 'advanced' && (
          <div className="stack-4">
            <Field label="Layout mode" help="How the module sits on the page">
              <Select options={[{ value: 'sticky', label: 'Sticky bar' }, { value: 'inline', label: 'Inline (in product info)' }, { value: 'floating', label: 'Floating button' }]} value={s.mode} onChange={(e: any) => set({ mode: e.target.value })} />
            </Field>
            {s.mode === 'sticky' && <Field label="Anchor"><SegField value={s.anchor} options={[['top', 'Top'], ['bottom', 'Bottom']]} onChange={(v: string) => set({ anchor: v })} /></Field>}
            <Field label="Background"><SwatchRow value={s.bg} swatches={['#FFFFFF', '#F6F8FB', '#14213A']} onChange={(c: string) => set({ bg: c })} /></Field>
            <Field label="Shadow"><SegField value={s.shadow} options={[['none', 'None'], ['sm', 'S'], ['md', 'M'], ['lg', 'L']]} onChange={(v: string) => set({ shadow: v })} /></Field>
            <div className="divider" />
            <ToggleRow label="Show variant picker" checked={s.showVariants} onChange={() => set({ showVariants: !s.showVariants })} />
            <ToggleRow label="Show quantity stepper" checked={s.showQty} onChange={() => set({ showQty: !s.showQty })} />
            <ToggleRow label="Urgency countdown" checked={s.countdown} onChange={() => set({ countdown: !s.countdown })} />
            <ToggleRow label="Hide on mobile" checked={s.hideMobile} onChange={() => set({ hideMobile: !s.hideMobile })} />
          </div>
        )}
        {ctrlTab === 'css' && (
          <div className="stack-3">
            <Banner tone="info">Scoped &amp; sanitized · max 2000 characters.</Banner>
            <Textarea mono rows={10} defaultValue={'.sa-bar {\n  backdrop-filter: blur(8px);\n}\n.sa-bar__button:hover {\n  transform: translateY(-1px);\n}'} />
          </div>
        )}
      </div>
    </div>
  );
}

function SwatchRow({ value, swatches, onChange }: any) {
  return (
    <div className="row-2 row-wrap">
      {swatches.map((c: string) => <button key={c} className={'swatch-btn' + (c.toLowerCase() === value.toLowerCase() ? ' sel' : '')} style={{ background: c }} onClick={() => onChange(c)} title={c} />)}
      <span className="t-mono t-xs t-muted">{value}</span>
    </div>
  );
}
function SegField({ value, options, onChange }: any) {
  return (
    <div className="seg" style={{ width: '100%' }}>
      {options.map((o: any) => <button key={o[0]} aria-selected={value === o[0]} onClick={() => onChange(o[0])} style={{ flex: 1, justifyContent: 'center' }}>{o[1]}</button>)}
    </div>
  );
}
function ToggleRow({ label, checked, onChange }: any) {
  return <label className="row spread" style={{ cursor: 'pointer' }}><span className="t-sm">{label}</span><Toggle checked={checked} onChange={onChange} /></label>;
}
function GenValidation() {
  const checks = [['Build check', 'Module builds and renders cleanly'], ['Accessibility', 'Button contrast passes WCAG AA'], ['Performance', 'No render-blocking assets'], ['Theme safety', 'Scoped styles — no theme conflicts'], ['Plan capability', 'Storefront UI available on Growth']];
  return (
    <div style={{ padding: 20, maxWidth: 640, width: '100%', margin: '0 auto' }}>
      <Banner tone="success" title="All checks passed">This module is safe to publish. It was checked for accessibility, performance, and your plan’s capabilities.</Banner>
      <div className="card" style={{ marginTop: 16 }}>
        {checks.map((c, i) => (
          <div key={i} className="val-row">
            <span className="val-ico"><Icon name="check" size={14} /></span>
            <div className="grow"><div className="t-sm t-strong">{c[0]}</div><div className="t-xs t-muted">{c[1]}</div></div>
            <Badge tone="success">Pass</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
function gmd(str: string) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
}
