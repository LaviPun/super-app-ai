/**
 * Renders published SuperApp checkout offers using only buyer-facing content:
 * heading, message, resolved product details (title / image / price), plus the
 * build #2 render vocab — interactive buyer-input fields and layout/presentation
 * blocks. The renderer branches by the extension `target` (surface): interactive
 * fields WRITE back into the checkout on `purchase.checkout.*` targets and degrade
 * to read-only labels on thank-you/order-status surfaces.
 *
 * Internal config (GIDs, targets, raw JSON) is never shown to buyers; offers with
 * nothing buyer-facing are filtered out upstream and render nothing here. Uses only
 * checkout-safe Polaris `s-*` components.
 */
import { useState } from 'preact/hooks';
import type { CheckoutOffer, OfferProduct } from '../hooks/useCheckoutConfig';
import type { CheckoutField, CheckoutLayoutItem } from '../lib/checkout-content';
import { writeBuyerInput } from '../lib/checkout-content';

export type AddToOrderResult = 'success' | 'error';

/** The `s-payment-icon` `type` prop value type (the checkout PaymentIconName union). */
type PaymentIconType = preact.JSX.IntrinsicElements['s-payment-icon']['type'];

/**
 * Map our compact payment-icon vocab onto the checkout `s-payment-icon` name set
 * (a few differ, e.g. `diners` → `diners-club`). Values come from untrusted config
 * JSON, so cast to the icon-name union; an unknown value degrades to `generic`.
 */
function normalizePaymentIcon(type: string): PaymentIconType {
  const alias: Record<string, string> = { diners: 'diners-club' };
  return (alias[type] ?? type) as PaymentIconType;
}

type Props = {
  offers: CheckoutOffer[];
  /** The extension target this instance is mounted at (drives surface behavior). */
  extensionTarget: string;
  /** Present only on the checkout surface when the cart accepts new lines. */
  onAddToOrder?: (variantGid: string) => Promise<AddToOrderResult>;
};

function OfferProductRow({
  product,
  onAddToOrder,
}: {
  product: OfferProduct;
  onAddToOrder?: Props['onAddToOrder'];
}) {
  const [adding, setAdding] = useState(false);
  const [outcome, setOutcome] = useState<'idle' | 'added' | 'failed'>('idle');

  const showAddButton = Boolean(onAddToOrder) && product.availableForSale && outcome !== 'added';

  async function handleAdd() {
    if (!onAddToOrder || adding) return;
    setAdding(true);
    const result = await onAddToOrder(product.variantGid);
    setAdding(false);
    setOutcome(result === 'success' ? 'added' : 'failed');
  }

  return (
    <s-stack gap="small-200">
      <s-stack direction="inline" gap="base" alignItems="center">
        {product.imageUrl && (
          <s-product-thumbnail src={product.imageUrl} alt={product.imageAlt ?? product.title} size="base" />
        )}
        <s-stack gap="none">
          <s-text>{product.title}</s-text>
          {product.price && <s-text color="subdued">{product.price}</s-text>}
        </s-stack>
        {showAddButton && (
          <s-button variant="secondary" loading={adding} onClick={handleAdd}>
            Add to order
          </s-button>
        )}
      </s-stack>
      {outcome === 'added' && <s-text tone="success">Added to your order.</s-text>}
      {outcome === 'failed' && <s-text tone="critical">This item couldn't be added.</s-text>}
    </s-stack>
  );
}

/** Badge tone is narrower than the config tone set (auto|neutral|critical). */
function badgeTone(t?: CheckoutLayoutItem['tone']): 'auto' | 'neutral' | 'critical' {
  return t === 'critical' ? 'critical' : 'auto';
}
/** Progress tone is narrower still (auto|critical). */
function progressTone(t?: CheckoutLayoutItem['tone']): 'auto' | 'critical' {
  return t === 'critical' ? 'critical' : 'auto';
}
/** Banner tone accepts the full config set; default to `info`. */
function bannerTone(t?: CheckoutLayoutItem['tone']): 'auto' | 'info' | 'success' | 'warning' | 'critical' {
  return t ?? 'info';
}

/** Renders one non-interactive layout/presentation block. */
function LayoutBlock({ item }: { item: CheckoutLayoutItem }) {
  switch (item.kind) {
    case 'banner':
      return <s-banner tone={bannerTone(item.tone)}>{item.text ?? ''}</s-banner>;
    case 'progress-bar':
      return (
        <s-stack gap="small-200">
          {item.text && <s-text>{item.text}</s-text>}
          <s-progress value={item.value ?? 0} max={1} tone={progressTone(item.tone)} />
        </s-stack>
      );
    case 'trust-badges':
      return (
        <s-stack direction="inline" gap="small-200">
          {(item.badges ?? []).map((b, i) => (
            <s-badge key={i} tone={badgeTone(item.tone)}>
              {b}
            </s-badge>
          ))}
        </s-stack>
      );
    case 'payment-icons':
      return (
        <s-stack direction="inline" gap="small-200" alignItems="center">
          {(item.icons ?? []).map((type, i) => (
            <s-payment-icon key={i} type={normalizePaymentIcon(type)} />
          ))}
        </s-stack>
      );
    case 'countdown':
      return (
        <s-stack gap="none">
          {item.text && <s-text type="strong">{item.text}</s-text>}
          {item.endsAt && (
            <s-text tone={item.tone ?? 'critical'}>
              <s-time dateTime={item.endsAt}>{item.endsAt}</s-time>
            </s-text>
          )}
        </s-stack>
      );
    case 'testimonial':
      return (
        <s-stack gap="none">
          {item.text && <s-paragraph>{item.text}</s-paragraph>}
          {item.attribution && <s-text color="subdued">— {item.attribution}</s-text>}
        </s-stack>
      );
    case 'divider':
      return <s-divider />;
    default:
      return null;
  }
}

/**
 * Read the current string value off a change event's target. Checkout `s-*`
 * controls fire a change `Event` whose `currentTarget` is the custom element
 * carrying a `value`/`values`/`checked`; we read defensively (values may be a list
 * for choice-list). Kept untyped-tolerant because the event shape varies per kind.
 */
function readEventValue(e: Event): string {
  const el = e.currentTarget as unknown as { value?: unknown; values?: unknown } | null;
  if (!el) return '';
  if (Array.isArray(el.values)) return el.values.map(String).join(',');
  return el.value == null ? '' : String(el.value);
}
function readEventChecked(e: Event): boolean {
  const el = e.currentTarget as unknown as { checked?: unknown } | null;
  return !!el && el.checked === true;
}

/** Renders one interactive field (or a read-only label on thank-you surfaces). */
function FieldControl({ field }: { field: CheckoutField }) {
  const [value, setValue] = useState('');
  const [state, setState] = useState<'idle' | 'saved' | 'error'>('idle');

  // Read-only surface (thank-you / order-status): show label + captured value only.
  if (field.readOnly) {
    return (
      <s-stack direction="inline" gap="small-200">
        <s-text type="strong">{field.label}:</s-text>
        <s-text>{value || '—'}</s-text>
      </s-stack>
    );
  }

  async function commit(next: string) {
    setValue(next);
    if (!field.write) return;
    const result = await writeBuyerInput(field, next);
    setState(result === 'ok' ? 'saved' : result === 'error' ? 'error' : 'idle');
  }

  const feedback =
    state === 'saved' ? (
      <s-text tone="success">Saved.</s-text>
    ) : state === 'error' ? (
      <s-text tone="critical">Couldn't save that.</s-text>
    ) : null;

  switch (field.kind) {
    case 'checkbox':
      return (
        <s-stack gap="none">
          <s-checkbox
            label={field.label}
            name={field.key}
            onChange={(e: Event) => commit(readEventChecked(e) ? 'yes' : 'no')}
          />
          {feedback}
        </s-stack>
      );
    case 'textarea':
      return (
        <s-stack gap="none">
          <s-text-area
            label={field.label}
            name={field.key}
            placeholder={field.placeholder}
            required={field.required}
            onChange={(e: Event) => commit(readEventValue(e))}
          />
          {feedback}
        </s-stack>
      );
    case 'choice-list':
      return (
        <s-stack gap="none">
          <s-choice-list
            label={field.label}
            name={field.key}
            onChange={(e: Event) => commit(readEventValue(e))}
          >
            {(field.options ?? []).map((o) => (
              <s-choice key={o.value} value={o.value}>
                {o.label}
              </s-choice>
            ))}
          </s-choice-list>
          {feedback}
        </s-stack>
      );
    case 'select':
      return (
        <s-stack gap="none">
          <s-select
            label={field.label}
            name={field.key}
            onChange={(e: Event) => commit(readEventValue(e))}
          >
            {(field.options ?? []).map((o) => (
              <s-option key={o.value} value={o.value}>
                {o.label}
              </s-option>
            ))}
          </s-select>
          {feedback}
        </s-stack>
      );
    case 'email':
      return (
        <s-stack gap="none">
          <s-email-field
            label={field.label}
            name={field.key}
            placeholder={field.placeholder}
            required={field.required}
            onChange={(e: Event) => commit(readEventValue(e))}
          />
          {feedback}
        </s-stack>
      );
    case 'number':
      return (
        <s-stack gap="none">
          <s-number-field
            label={field.label}
            name={field.key}
            required={field.required}
            onChange={(e: Event) => commit(readEventValue(e))}
          />
          {feedback}
        </s-stack>
      );
    case 'text':
    default:
      return (
        <s-stack gap="none">
          <s-text-field
            label={field.label}
            name={field.key}
            placeholder={field.placeholder}
            required={field.required}
            onChange={(e: Event) => commit(readEventValue(e))}
          />
          {feedback}
        </s-stack>
      );
  }
}

export function CheckoutBlockRenderer({ offers, onAddToOrder }: Props) {
  if (offers.length === 0) return null;

  return (
    <s-stack gap="large-100">
      {offers.map((offer) => (
        <s-stack key={offer.key} gap="small-200">
          {offer.heading && <s-heading>{offer.heading}</s-heading>}
          {offer.message && <s-paragraph>{offer.message}</s-paragraph>}
          {offer.layout.map((item, i) => (
            <LayoutBlock key={`l${i}`} item={item} />
          ))}
          {offer.product && <OfferProductRow product={offer.product} onAddToOrder={onAddToOrder} />}
          {offer.fields.map((field) => (
            <FieldControl key={field.key} field={field} />
          ))}
        </s-stack>
      ))}
    </s-stack>
  );
}
