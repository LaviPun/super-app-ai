/**
 * Unit tests for the checkout render-vocab parsing + buyer-input write helpers.
 *
 * These are the extension's pure, framework-free logic: the metaobject `config`
 * is authored upstream but treated as UNTRUSTED here, so the parsers must drop
 * unknown kinds, reject bad keys, clamp lengths/values, and honor the read-only
 * (thank-you) surface. `writeBuyerInput` routes a captured value to the correct
 * checkout buyer-input API and must never throw.
 *
 * (The extension renders via preact into document.body against a global `shopify`
 * object, so @shopify/ui-extensions-tester — which targets the React reconciler
 * model — does not apply; this tests the logic directly, which is where the real
 * behavior lives.)
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  parseCheckoutFields,
  parseCheckoutLayout,
  writeBuyerInput,
  type CheckoutField,
} from './checkout-content';

describe('parseCheckoutFields', () => {
  it('returns [] for non-array input', () => {
    expect(parseCheckoutFields(undefined, true)).toEqual([]);
    expect(parseCheckoutFields(null, true)).toEqual([]);
    expect(parseCheckoutFields({ kind: 'text' }, true)).toEqual([]);
    expect(parseCheckoutFields('nope', true)).toEqual([]);
  });

  it('parses a valid interactive field with all attributes', () => {
    const fields = parseCheckoutFields(
      [
        {
          kind: 'select',
          key: 'gift_wrap',
          label: 'Gift wrap',
          placeholder: 'Choose',
          required: true,
          options: [
            { value: 'red', label: 'Red' },
            { value: 'blue' }, // label defaults to value
          ],
          write: { to: 'attribute' },
        },
      ],
      true,
    );
    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({
      kind: 'select',
      key: 'gift_wrap',
      label: 'Gift wrap',
      placeholder: 'Choose',
      required: true,
      readOnly: false,
      write: { to: 'attribute' },
    });
    expect(fields[0].options).toEqual([
      { value: 'red', label: 'Red' },
      { value: 'blue', label: 'blue' },
    ]);
  });

  it('marks every field read-only on the thank-you surface (interactive=false)', () => {
    const fields = parseCheckoutFields([{ kind: 'text', key: 'note', label: 'Note' }], false);
    expect(fields).toHaveLength(1);
    expect(fields[0].readOnly).toBe(true);
  });

  it('drops unknown field kinds', () => {
    const fields = parseCheckoutFields(
      [
        { kind: 'radio', key: 'a', label: 'A' }, // not in FIELD_KINDS
        { kind: 'number', key: 'qty', label: 'Qty' },
      ],
      true,
    );
    expect(fields.map((f) => f.kind)).toEqual(['number']);
  });

  it('defaults a missing kind to "text"', () => {
    const fields = parseCheckoutFields([{ key: 'k', label: 'L' }], true);
    expect(fields[0].kind).toBe('text');
  });

  it('skips items with a missing or invalid key (regex-gated)', () => {
    const fields = parseCheckoutFields(
      [
        { kind: 'text', label: 'no key' },
        { kind: 'text', key: 'has space', label: 'bad' }, // space fails KEY_RE
        { kind: 'text', key: 'a'.repeat(61), label: 'too long' }, // > 60 chars
        { kind: 'text', key: 'ok-key.1', label: 'good' },
      ],
      true,
    );
    expect(fields).toHaveLength(1);
    expect(fields[0].key).toBe('ok-key.1');
  });

  it('skips items with no label', () => {
    expect(parseCheckoutFields([{ kind: 'text', key: 'k' }], true)).toEqual([]);
  });

  it('clamps label (80), placeholder (120) and only keeps required===true', () => {
    const fields = parseCheckoutFields(
      [{ kind: 'text', key: 'k', label: 'L'.repeat(200), placeholder: 'P'.repeat(200), required: 'yes' }],
      true,
    );
    expect(fields[0].label).toHaveLength(80);
    expect(fields[0].placeholder).toHaveLength(120);
    expect(fields[0].required).toBe(false); // truthy-but-not-true is not honored
  });

  it('drops an invalid write target and caps to the first 20 fields', () => {
    const bad = parseCheckoutFields([{ kind: 'text', key: 'k', label: 'L', write: { to: 'cookie' } }], true);
    expect(bad[0].write).toBeUndefined();

    const many = Array.from({ length: 25 }, (_, i) => ({ kind: 'text', key: `k${i}`, label: `L${i}` }));
    expect(parseCheckoutFields(many, true)).toHaveLength(20);
  });
});

describe('parseCheckoutLayout', () => {
  it('returns [] for non-array input', () => {
    expect(parseCheckoutLayout(undefined)).toEqual([]);
    expect(parseCheckoutLayout({ kind: 'banner' })).toEqual([]);
  });

  it('parses a banner with a valid tone and clamps text', () => {
    const items = parseCheckoutLayout([{ kind: 'banner', text: 'x'.repeat(500), tone: 'success' }]);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('banner');
    expect(items[0].tone).toBe('success');
    expect(items[0].text).toHaveLength(400);
  });

  it('drops unknown kinds and unknown tones', () => {
    const items = parseCheckoutLayout([
      { kind: 'carousel', text: 'nope' }, // unknown kind dropped
      { kind: 'banner', text: 'hi', tone: 'neon' }, // unknown tone -> undefined
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].tone).toBeUndefined();
  });

  it('clamps a progress-bar value into [0,1]', () => {
    expect(parseCheckoutLayout([{ kind: 'progress-bar', value: 5 }])[0].value).toBe(1);
    expect(parseCheckoutLayout([{ kind: 'progress-bar', value: -3 }])[0].value).toBe(0);
    expect(parseCheckoutLayout([{ kind: 'progress-bar', value: 0.4 }])[0].value).toBe(0.4);
    // non-finite / non-number -> undefined
    expect(parseCheckoutLayout([{ kind: 'progress-bar', value: 'x' }])[0].value).toBeUndefined();
  });

  it('normalizes badges/icons arrays (filter, cap, clamp)', () => {
    const items = parseCheckoutLayout([
      {
        kind: 'trust-badges',
        badges: [' secure ', '', 42, null, 'b'.repeat(60)],
        icons: Array.from({ length: 20 }, (_, i) => `icon${i}`),
      },
    ]);
    expect(items[0].badges).toEqual(['secure', 'b'.repeat(40)]); // trimmed, empties/non-strings dropped, clamped to 40
    expect(items[0].icons).toHaveLength(12); // capped at 12
  });
});

describe('writeBuyerInput', () => {
  const orig = (globalThis as Record<string, unknown>).shopify;
  afterEach(() => {
    (globalThis as Record<string, unknown>).shopify = orig;
    vi.restoreAllMocks();
  });

  const field = (over: Partial<CheckoutField> = {}): CheckoutField => ({
    kind: 'text',
    key: 'gift_note',
    label: 'Gift note',
    readOnly: false,
    write: { to: 'attribute' },
    ...over,
  });

  it('returns "unsupported" when the field has no write target', async () => {
    expect(await writeBuyerInput(field({ write: undefined }), 'v')).toBe('unsupported');
  });

  it('returns "unsupported" for a read-only (thank-you) field', async () => {
    expect(await writeBuyerInput(field({ readOnly: true }), 'v')).toBe('unsupported');
  });

  it('returns "unsupported" when the global shopify api is absent', async () => {
    (globalThis as Record<string, unknown>).shopify = undefined;
    expect(await writeBuyerInput(field(), 'v')).toBe('unsupported');
  });

  it('routes an attribute write through applyAttributeChange', async () => {
    const applyAttributeChange = vi.fn().mockResolvedValue({});
    (globalThis as Record<string, unknown>).shopify = { applyAttributeChange };
    const result = await writeBuyerInput(field({ write: { to: 'attribute' } }), 'blue ribbon');
    expect(result).toBe('ok');
    expect(applyAttributeChange).toHaveBeenCalledWith({
      type: 'updateAttribute',
      key: 'gift_note',
      value: 'blue ribbon',
    });
  });

  it('routes a note write through applyNoteChange', async () => {
    const applyNoteChange = vi.fn().mockResolvedValue({});
    (globalThis as Record<string, unknown>).shopify = { applyNoteChange };
    expect(await writeBuyerInput(field({ write: { to: 'note' } }), 'leave at door')).toBe('ok');
    expect(applyNoteChange).toHaveBeenCalledWith({ type: 'updateNote', note: 'leave at door' });
  });

  it('routes a metafield write and applies namespace/key defaults', async () => {
    const applyMetafieldChange = vi.fn().mockResolvedValue({});
    (globalThis as Record<string, unknown>).shopify = { applyMetafieldChange };
    await writeBuyerInput(field({ write: { to: 'metafield' } }), 'engrave: J');
    expect(applyMetafieldChange).toHaveBeenCalledWith({
      type: 'updateCartMetafield',
      metafield: {
        namespace: '$app:superapp',
        key: 'gift_note', // falls back to field.key
        type: 'single_line_text_field',
        value: 'engrave: J',
      },
    });
  });

  it('honors explicit metafield namespace and metafieldKey', async () => {
    const applyMetafieldChange = vi.fn().mockResolvedValue({});
    (globalThis as Record<string, unknown>).shopify = { applyMetafieldChange };
    await writeBuyerInput(field({ write: { to: 'metafield', namespace: 'custom', metafieldKey: 'gk' } }), 'v');
    expect(applyMetafieldChange.mock.calls[0][0].metafield).toMatchObject({ namespace: 'custom', key: 'gk' });
  });

  it('returns "unsupported" when the target-specific api method is missing', async () => {
    // note write requested but only applyAttributeChange present (e.g. accelerated checkout)
    (globalThis as Record<string, unknown>).shopify = { applyAttributeChange: vi.fn() };
    expect(await writeBuyerInput(field({ write: { to: 'note' } }), 'v')).toBe('unsupported');
  });

  it('returns "error" (never throws) when the change is rejected', async () => {
    (globalThis as Record<string, unknown>).shopify = {
      applyAttributeChange: vi.fn().mockRejectedValue(new Error('cart instruction disabled')),
    };
    expect(await writeBuyerInput(field({ write: { to: 'attribute' } }), 'v')).toBe('error');
  });
});
