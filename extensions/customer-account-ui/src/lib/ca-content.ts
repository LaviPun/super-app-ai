/**
 * Customer-account render vocab (build #3, 034) — the buyer-facing half of the
 * generic customer-account UI extension. The compiler persists a
 * `customerAccount.blocks` config verbatim into the
 * `$app:superapp_customer_account_block` metaobject; this module parses the
 * untrusted `config.blocks` JSON into narrow, render-safe descriptors and
 * declares the live-data binding vocabulary the extension resolves at render time.
 *
 * Parsing is defensive (the metaobject is authored upstream but treated as
 * untrusted here): unknown kinds are dropped, missing required keys skip the block,
 * and every string is clamped. The four legacy kinds (TEXT|LINK|BADGE|DIVIDER)
 * parse byte-identically to their previous shape, so existing configs render
 * unchanged.
 */

export type CaBlockKind = 'TEXT' | 'LINK' | 'BADGE' | 'DIVIDER' | 'BUTTON' | 'FORM' | 'MODAL' | 'ACTION';
export type CaTone = 'info' | 'success' | 'warning' | 'critical';
export type CaButtonVariant = 'primary' | 'secondary' | 'tertiary';
export type CaActionKind = 'modal' | 'link';
export type CaFieldKind = 'text' | 'textarea' | 'select' | 'email' | 'number' | 'checkbox';

/**
 * A live value a block binds to. The extension resolves it via the Customer
 * Account / Order API or our app-owned source; unresolved bindings fall back to
 * the block's literal `content`.
 */
export type CaBinding =
  | 'order.trackingNumber'
  | 'order.trackingUrl'
  | 'order.fulfillmentStatus'
  | 'order.financialStatus'
  | 'order.returnStatus'
  | 'order.statusPageUrl'
  | 'customer.storeCreditBalance'
  | 'customer.displayName'
  | 'customer.ordersCount'
  | 'subscription.nextOrderDate'
  | 'subscription.status'
  | 'loyalty.points';

export type CaFieldOption = { value: string; label: string };

export type CaField = {
  kind: CaFieldKind;
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: CaFieldOption[];
};

export type CaBlock = {
  kind: CaBlockKind;
  content?: string;
  url?: string;
  tone?: CaTone;
  /** Live-data binding; when set the resolved value replaces `content`. */
  bind?: CaBinding;
  /** BUTTON → opens the MODAL block with this id. */
  modalId?: string;
  /** MODAL / ACTION → stable id a BUTTON / menu-item references. */
  id?: string;
  variant?: CaButtonVariant;
  /** ACTION (order.action pair) → present as an in-page modal or a link. */
  action?: CaActionKind;
  /** FORM → input fields rendered and (if `submit` set) POSTed to the app proxy. */
  fields?: CaField[];
  /** FORM submit target (app-proxy subpath). Omit → collect/display only. */
  submit?: { proxyPath: string; submitLabel?: string };
};

const BLOCK_KINDS = new Set<CaBlockKind>([
  'TEXT',
  'LINK',
  'BADGE',
  'DIVIDER',
  'BUTTON',
  'FORM',
  'MODAL',
  'ACTION',
]);
const TONES = new Set<CaTone>(['info', 'success', 'warning', 'critical']);
const VARIANTS = new Set<CaButtonVariant>(['primary', 'secondary', 'tertiary']);
const ACTION_KINDS = new Set<CaActionKind>(['modal', 'link']);
const FIELD_KINDS = new Set<CaFieldKind>(['text', 'textarea', 'select', 'email', 'number', 'checkbox']);
const BINDINGS = new Set<CaBinding>([
  'order.trackingNumber',
  'order.trackingUrl',
  'order.fulfillmentStatus',
  'order.financialStatus',
  'order.returnStatus',
  'order.statusPageUrl',
  'customer.storeCreditBalance',
  'customer.displayName',
  'customer.ordersCount',
  'subscription.nextOrderDate',
  'subscription.status',
  'loyalty.points',
]);
const KEY_RE = /^[a-zA-Z0-9_.\-]{1,60}$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
}

function parseOptions(v: unknown): CaFieldOption[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: CaFieldOption[] = [];
  for (const raw of v.slice(0, 20)) {
    if (!isRecord(raw)) continue;
    const value = str(raw.value);
    const label = str(raw.label) ?? value;
    if (value && label) out.push({ value: value.slice(0, 80), label: label.slice(0, 80) });
  }
  return out.length > 0 ? out : undefined;
}

function parseFields(v: unknown): CaField[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: CaField[] = [];
  for (const raw of v.slice(0, 12)) {
    if (!isRecord(raw)) continue;
    const kind = (str(raw.kind) as CaFieldKind | undefined) ?? 'text';
    if (!FIELD_KINDS.has(kind)) continue;
    const key = str(raw.key);
    const label = str(raw.label);
    if (!key || !KEY_RE.test(key) || !label) continue;
    out.push({
      kind,
      key,
      label: label.slice(0, 80),
      placeholder: str(raw.placeholder)?.slice(0, 120),
      required: raw.required === true,
      options: parseOptions(raw.options),
    });
  }
  return out.length > 0 ? out : undefined;
}

function parseSubmit(v: unknown): CaBlock['submit'] {
  if (!isRecord(v)) return undefined;
  const proxyPath = str(v.proxyPath);
  if (!proxyPath) return undefined;
  return { proxyPath: proxyPath.slice(0, 200), submitLabel: str(v.submitLabel)?.slice(0, 60) };
}

/** Parse the untrusted `config.blocks` array into render-safe block descriptors. */
export function parseCaBlocks(v: unknown): CaBlock[] {
  if (!Array.isArray(v)) return [];
  const out: CaBlock[] = [];
  for (const raw of v.slice(0, 20)) {
    if (!isRecord(raw)) continue;
    const kind = str(raw.kind) as CaBlockKind | undefined;
    if (!kind || !BLOCK_KINDS.has(kind)) continue;
    const tone = str(raw.tone) as CaTone | undefined;
    const variant = str(raw.variant) as CaButtonVariant | undefined;
    const action = str(raw.action) as CaActionKind | undefined;
    const bind = str(raw.bind) as CaBinding | undefined;
    out.push({
      kind,
      content: str(raw.content)?.slice(0, 240),
      url: str(raw.url)?.slice(0, 2048),
      tone: tone && TONES.has(tone) ? tone : undefined,
      bind: bind && BINDINGS.has(bind) ? bind : undefined,
      modalId: str(raw.modalId)?.slice(0, 60),
      id: str(raw.id)?.slice(0, 60),
      variant: variant && VARIANTS.has(variant) ? variant : undefined,
      action: action && ACTION_KINDS.has(action) ? action : undefined,
      fields: parseFields(raw.fields),
      submit: parseSubmit(raw.submit),
    });
  }
  return out;
}
