/**
 * Checkout render vocab (build #2, 034) — the buyer-facing half of the generic
 * checkout UI extension. The compiler persists a checkout.block's declarative
 * config verbatim into the `$app:superapp_checkout_upsell` metaobject; this module
 * parses the untrusted `config.fields` / `config.layout` JSON into narrow,
 * render-safe shapes and provides the buyer-input write helper.
 *
 * Parsing is defensive (the metaobject is authored upstream but treated as
 * untrusted here): unknown kinds are dropped, missing required keys skip the item,
 * and everything is clamped. Interactive fields are honored only on the checkout
 * surface — on thank-you they are marked read-only (no buyer-input APIs exist there).
 */

export type CheckoutFieldKind = 'text' | 'textarea' | 'checkbox' | 'choice-list' | 'select' | 'email' | 'number';
export type CheckoutInputTarget = 'attribute' | 'note' | 'metafield';

export type CheckoutFieldOption = { value: string; label: string };

export type CheckoutField = {
  kind: CheckoutFieldKind;
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: CheckoutFieldOption[];
  write?: { to: CheckoutInputTarget; namespace?: string; metafieldKey?: string };
  /** True on read-only surfaces (thank-you): render as a label, never an input. */
  readOnly: boolean;
};

export type CheckoutLayoutKind =
  | 'banner'
  | 'progress-bar'
  | 'trust-badges'
  | 'payment-icons'
  | 'countdown'
  | 'testimonial'
  | 'divider';

export type CheckoutTone = 'auto' | 'info' | 'success' | 'warning' | 'critical';

export type CheckoutLayoutItem = {
  kind: CheckoutLayoutKind;
  text?: string;
  tone?: CheckoutTone;
  value?: number;
  badges?: string[];
  icons?: string[];
  endsAt?: string;
  attribution?: string;
};

const FIELD_KINDS = new Set<CheckoutFieldKind>([
  'text',
  'textarea',
  'checkbox',
  'choice-list',
  'select',
  'email',
  'number',
]);
const INPUT_TARGETS = new Set<CheckoutInputTarget>(['attribute', 'note', 'metafield']);
const LAYOUT_KINDS = new Set<CheckoutLayoutKind>([
  'banner',
  'progress-bar',
  'trust-badges',
  'payment-icons',
  'countdown',
  'testimonial',
  'divider',
]);
const TONES = new Set<CheckoutTone>(['auto', 'info', 'success', 'warning', 'critical']);
const KEY_RE = /^[a-zA-Z0-9_.\-]{1,60}$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
}

function parseOptions(v: unknown): CheckoutFieldOption[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: CheckoutFieldOption[] = [];
  for (const raw of v.slice(0, 20)) {
    if (!isRecord(raw)) continue;
    const value = str(raw.value);
    const label = str(raw.label) ?? value;
    if (value && label) out.push({ value: value.slice(0, 80), label: label.slice(0, 80) });
  }
  return out.length > 0 ? out : undefined;
}

function parseWrite(v: unknown): CheckoutField['write'] {
  if (!isRecord(v)) return undefined;
  const to = str(v.to) as CheckoutInputTarget | undefined;
  if (!to || !INPUT_TARGETS.has(to)) return undefined;
  return {
    to,
    namespace: str(v.namespace)?.slice(0, 60),
    metafieldKey: str(v.metafieldKey)?.slice(0, 60),
  };
}

/**
 * Parse `config.fields` into render-safe interactive field descriptors. When
 * `interactive` is false (thank-you surface), every field is marked read-only.
 */
export function parseCheckoutFields(v: unknown, interactive: boolean): CheckoutField[] {
  if (!Array.isArray(v)) return [];
  const out: CheckoutField[] = [];
  for (const raw of v.slice(0, 20)) {
    if (!isRecord(raw)) continue;
    const kind = (str(raw.kind) as CheckoutFieldKind | undefined) ?? 'text';
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
      write: parseWrite(raw.write),
      readOnly: !interactive,
    });
  }
  return out;
}

/** Parse `config.layout` into render-safe presentational descriptors. */
export function parseCheckoutLayout(v: unknown): CheckoutLayoutItem[] {
  if (!Array.isArray(v)) return [];
  const out: CheckoutLayoutItem[] = [];
  for (const raw of v.slice(0, 20)) {
    if (!isRecord(raw)) continue;
    const kind = str(raw.kind) as CheckoutLayoutKind | undefined;
    if (!kind || !LAYOUT_KINDS.has(kind)) continue;
    const tone = str(raw.tone) as CheckoutTone | undefined;
    const valueNum = typeof raw.value === 'number' && Number.isFinite(raw.value) ? Math.min(1, Math.max(0, raw.value)) : undefined;
    out.push({
      kind,
      text: str(raw.text)?.slice(0, 400),
      tone: tone && TONES.has(tone) ? tone : undefined,
      value: valueNum,
      badges: Array.isArray(raw.badges)
        ? raw.badges.map(str).filter((s): s is string => !!s).slice(0, 10).map((s) => s.slice(0, 40))
        : undefined,
      icons: Array.isArray(raw.icons)
        ? raw.icons.map(str).filter((s): s is string => !!s).slice(0, 12)
        : undefined,
      endsAt: str(raw.endsAt)?.slice(0, 40),
      attribution: str(raw.attribution)?.slice(0, 120),
    });
  }
  return out;
}

/**
 * The buyer-input write surface of the checkout `shopify` global. Present only on
 * `purchase.checkout.*` targets (thank-you/order-status are read-only). Declared
 * locally so the shared renderer can call it without leaking checkout-only types
 * into the thank-you type shim.
 */
type BuyerInputApi = {
  applyAttributeChange?: (c: { type: 'updateAttribute'; key: string; value: string }) => Promise<unknown>;
  applyNoteChange?: (c: { type: 'updateNote'; note: string }) => Promise<unknown>;
  applyMetafieldChange?: (c: {
    type: 'updateCartMetafield';
    metafield: { namespace: string; key: string; type: string; value: string };
  }) => Promise<unknown>;
};

export type WriteResult = 'ok' | 'error' | 'unsupported';

/**
 * Write a captured field value back into the checkout via the field's `write`
 * target. Returns `unsupported` when the relevant API/cart-instruction isn't
 * available (accelerated checkout, disabled instruction, or thank-you surface),
 * `error` on a rejected change, and `ok` on success. Never throws.
 */
export async function writeBuyerInput(field: CheckoutField, value: string): Promise<WriteResult> {
  const write = field.write;
  if (!write || field.readOnly) return 'unsupported';
  const api = (globalThis as unknown as { shopify?: BuyerInputApi }).shopify;
  if (!api) return 'unsupported';
  try {
    if (write.to === 'note' && api.applyNoteChange) {
      await api.applyNoteChange({ type: 'updateNote', note: value });
      return 'ok';
    }
    if (write.to === 'metafield' && api.applyMetafieldChange) {
      await api.applyMetafieldChange({
        type: 'updateCartMetafield',
        metafield: {
          namespace: write.namespace || '$app:superapp',
          key: write.metafieldKey || field.key,
          type: 'single_line_text_field',
          value,
        },
      });
      return 'ok';
    }
    if (write.to === 'attribute' && api.applyAttributeChange) {
      await api.applyAttributeChange({ type: 'updateAttribute', key: field.key, value });
      return 'ok';
    }
    return 'unsupported';
  } catch {
    return 'error';
  }
}
