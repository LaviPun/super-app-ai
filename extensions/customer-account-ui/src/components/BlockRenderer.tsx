/**
 * Renders customer-account blocks using Polaris web components (s-*, 2026-04).
 * Config-driven: each block descriptor selects an s-* element. Build #3 (034)
 * widens the vocab from TEXT|LINK|BADGE|DIVIDER to the interactive + data-bound
 * set (BUTTON, FORM, MODAL) and binds live values resolved upstream.
 *
 * The legacy four kinds render byte-identically to before, except DIVIDER now maps
 * to `s-divider` (the correct 2026-04 element — `s-separator` does not exist in the
 * customer-account component set).
 */
import { useState } from 'preact/hooks';
import type { BlockDef, BlockConfig } from '../hooks/useBlockConfig';
import type { CaBlock, CaField, CaTone, CaButtonVariant } from '../lib/ca-content';

type Props = { blocks: BlockDef[]; bound?: BlockConfig['bound'] };

/** The display text for a block: resolved binding value, else literal content. */
function displayText(block: CaBlock, bound?: BlockConfig['bound']): string {
  if (block.bind && bound && bound[block.bind]) return bound[block.bind] as string;
  return block.content ?? '';
}

/**
 * Map our config tone set (info|success|warning|critical) onto the narrower
 * `s-badge` tone union (auto|neutral|critical). Only `critical` is semantic; the
 * rest present as `auto` (the default accent).
 */
function badgeTone(t?: CaTone): 'auto' | 'neutral' | 'critical' {
  return t === 'critical' ? 'critical' : 'auto';
}

/**
 * Map our button variant set (primary|secondary|tertiary) onto the `s-button`
 * union (primary|secondary|auto). `tertiary` degrades to `auto`.
 */
function buttonVariant(v?: CaButtonVariant): 'primary' | 'secondary' | 'auto' {
  if (v === 'primary') return 'primary';
  if (v === 'secondary') return 'secondary';
  return 'auto';
}

/** Read the current string value off a change event's custom element. */
function readEventValue(e: Event): string {
  const el = e.currentTarget as unknown as { value?: unknown; checked?: unknown } | null;
  if (!el) return '';
  if (typeof el.checked === 'boolean') return el.checked ? 'yes' : 'no';
  return el.value == null ? '' : String(el.value);
}

function FieldControl({ field, onChange }: { field: CaField; onChange: (key: string, value: string) => void }) {
  const commit = (e: Event) => onChange(field.key, readEventValue(e));
  switch (field.kind) {
    case 'textarea':
      return <s-text-area label={field.label} name={field.key} placeholder={field.placeholder} required={field.required} onChange={commit} />;
    case 'select':
      return (
        <s-select label={field.label} name={field.key} onChange={commit}>
          {(field.options ?? []).map((o) => (
            <s-option key={o.value} value={o.value}>{o.label}</s-option>
          ))}
        </s-select>
      );
    case 'email':
      return <s-email-field label={field.label} name={field.key} placeholder={field.placeholder} required={field.required} onChange={commit} />;
    case 'number':
      return <s-number-field label={field.label} name={field.key} required={field.required} onChange={commit} />;
    case 'checkbox':
      return <s-checkbox label={field.label} name={field.key} onChange={commit} />;
    case 'text':
    default:
      return <s-text-field label={field.label} name={field.key} placeholder={field.placeholder} required={field.required} onChange={commit} />;
  }
}

/**
 * A FORM block: renders its fields and (when `submit` is set) POSTs the captured
 * values to the app-proxy subpath. Submission degrades gracefully — a failed POST
 * shows an inline error, never throws.
 */
function FormBlock({ block }: { block: CaBlock }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const onChange = (key: string, value: string) => setValues((v) => ({ ...v, [key]: value }));

  async function submit() {
    if (!block.submit || state === 'saving') return;
    setState('saving');
    try {
      const res = await fetch(block.submit.proxyPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      setState(res.ok ? 'saved' : 'error');
    } catch {
      setState('error');
    }
  }

  return (
    <s-stack gap="base">
      {(block.fields ?? []).map((f) => (
        <FieldControl key={f.key} field={f} onChange={onChange} />
      ))}
      {block.submit && (
        <s-button variant={buttonVariant(block.variant ?? 'primary')} loading={state === 'saving'} onClick={submit}>
          {block.submit.submitLabel ?? 'Submit'}
        </s-button>
      )}
      {state === 'saved' && <s-text tone="success">Submitted.</s-text>}
      {state === 'error' && <s-text tone="critical">Something went wrong. Please try again.</s-text>}
    </s-stack>
  );
}

/** A MODAL block: an s-modal opened by a BUTTON with a matching `modalId`. */
function ModalBlock({ block }: { block: CaBlock }) {
  if (!block.id) return null;
  return (
    <s-modal id={block.id} heading={block.content ?? undefined}>
      {block.content && <s-paragraph>{block.content}</s-paragraph>}
    </s-modal>
  );
}

export function BlockRenderer({ blocks, bound }: Props) {
  return (
    <s-stack gap="base">
      {blocks.map((block, i) => {
        const text = displayText(block, bound);
        switch (block.kind) {
          case 'TEXT':
            return <s-text key={i}>{text}</s-text>;
          case 'LINK':
            // A bound URL (e.g. order.trackingUrl) wins over a static url.
            return (
              <s-link key={i} href={block.url ?? text ?? '#'}>
                {block.content ?? text ?? 'Link'}
              </s-link>
            );
          case 'BADGE':
            return (
              <s-badge key={i} tone={badgeTone(block.tone)}>
                {text}
              </s-badge>
            );
          case 'DIVIDER':
            return <s-divider key={i} />;
          case 'BUTTON':
            // Opens a MODAL by id (commandFor) when modalId is set; else navigates.
            return block.modalId ? (
              <s-button
                key={i}
                variant={buttonVariant(block.variant ?? 'secondary')}
                commandFor={block.modalId}
                command="--show"
              >
                {block.content ?? 'Open'}
              </s-button>
            ) : (
              <s-button key={i} variant={buttonVariant(block.variant ?? 'secondary')} href={block.url}>
                {block.content ?? 'Continue'}
              </s-button>
            );
          case 'FORM':
            return <FormBlock key={i} block={block} />;
          case 'MODAL':
            return <ModalBlock key={i} block={block} />;
          case 'ACTION':
            // ACTION blocks are mounted by the order.action target pair, not inline.
            return null;
          default:
            return null;
        }
      })}
    </s-stack>
  );
}
