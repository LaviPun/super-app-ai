/**
 * SchemaForm — a generic, schema-driven settings renderer (Module System v2).
 *
 * Renders any `{ jsonSchema, uiSchema, defaults }` into Polaris web-component
 * form controls. This is the single renderer that powers (a) module settings
 * from the v2 control-pack composer, (b) the hydrate step's `adminConfig`
 * (previously generated but never rendered), and (c) typed data-record forms.
 *
 * Controlled component: parent owns `value` and persists on `onChange`.
 * Tier gating + conditional visibility come from `uiSchema` hints.
 *
 * Polaris web components (s-*) are globally registered — no imports needed.
 */
import { useCallback } from 'react';

// ── Schema shapes (a pragmatic JSON-Schema subset) ─────────────────────────

export interface JsonSchemaNode {
  type?: 'object' | 'string' | 'number' | 'integer' | 'boolean' | 'array';
  title?: string;
  description?: string;
  enum?: Array<string | number>;
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  properties?: Record<string, JsonSchemaNode>;
  items?: JsonSchemaNode;
  required?: string[];
  default?: unknown;
}

export interface FieldUiHint {
  widget?: string;
  help?: string;
  placeholder?: string;
  hidden?: boolean;
  showWhen?: { field: string; equals: string | number | boolean };
  tier?: 'basic' | 'advanced';
}

export interface SectionUiHints {
  groupLabel?: string;
  order?: string[];
  fields?: Record<string, FieldUiHint>;
}

export interface SchemaFormProps {
  /** Root JSON Schema (type: 'object'); top-level object properties become sections. */
  schema: JsonSchemaNode;
  /** Per-section UI hints, keyed by the section's property key (the pack namespace). */
  uiSchema?: Record<string, SectionUiHints>;
  /** Current value (nested object mirroring the schema). */
  value: Record<string, unknown>;
  /** Called with the full next value on any edit. */
  onChange: (next: Record<string, unknown>) => void;
  /** Tier gate: 'basic' hides fields/packs marked advanced. */
  tier?: 'basic' | 'advanced';
  /** Disable all inputs (e.g. while saving). */
  disabled?: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Immutable set at a nested path. */
function setIn(obj: Record<string, unknown>, path: string[], next: unknown): Record<string, unknown> {
  if (path.length === 0) return obj;
  const head = path[0]!;
  const rest = path.slice(1);
  const child = (obj[head] && typeof obj[head] === 'object' ? obj[head] : {}) as Record<string, unknown>;
  return { ...obj, [head]: rest.length === 0 ? next : setIn(child, rest, next) };
}

function humanize(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase());
}

function isSection(node: JsonSchemaNode): boolean {
  return node.type === 'object' && !!node.properties;
}

/** A field is hidden when its hint says so, when its tier outranks the active tier, or when showWhen fails. */
function isFieldVisible(
  hint: FieldUiHint | undefined,
  tier: 'basic' | 'advanced',
  siblingValue: (field: string) => unknown,
): boolean {
  if (!hint) return true;
  if (hint.hidden) return false;
  if (hint.tier === 'advanced' && tier === 'basic') return false;
  if (hint.showWhen) {
    const actual = siblingValue(hint.showWhen.field);
    // `equals: true` is treated as "field is set (truthy)".
    if (hint.showWhen.equals === true) return Boolean(actual);
    if (actual !== hint.showWhen.equals) return false;
  }
  return true;
}

// ── Leaf renderer ──────────────────────────────────────────────────────────

interface LeafProps {
  node: JsonSchemaNode;
  label: string;
  hint?: FieldUiHint;
  value: unknown;
  disabled?: boolean;
  onChange: (next: unknown) => void;
}

function LeafField({ node, label, hint, value, disabled, onChange }: LeafProps) {
  const help = hint?.help ?? node.description;
  const widget = hint?.widget;
  const off = disabled || undefined;

  // Enum → s-select
  if (node.enum && node.enum.length > 0) {
    const options = node.enum.map((v) => ({ label: humanize(String(v)), value: String(v) }));
    const selected = value === undefined || value === null
      ? String(node.default ?? options[0]?.value ?? '')
      : String(value);
    return (
      <s-select
        label={label}
        value={selected}
        details={help}
        disabled={off}
        onChange={(e) => onChange(e.currentTarget.value)}
      >
        {options.map((o) => <s-option key={o.value} value={o.value}>{o.label}</s-option>)}
      </s-select>
    );
  }

  // Boolean → s-switch for the 'toggle' widget, s-checkbox otherwise
  if (node.type === 'boolean' || widget === 'toggle') {
    const checked = Boolean(value ?? node.default ?? false) || undefined;
    if (widget === 'toggle') {
      return (
        <s-switch
          label={label}
          checked={checked}
          details={help}
          disabled={off}
          onChange={(e) => onChange(e.currentTarget.checked)}
        />
      );
    }
    return (
      <s-checkbox
        label={label}
        checked={checked}
        details={help}
        disabled={off}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
    );
  }

  // Number / integer → s-number-field
  if (node.type === 'number' || node.type === 'integer') {
    return (
      <s-number-field
        label={label}
        value={value === undefined || value === null ? '' : String(value)}
        min={node.minimum}
        max={node.maximum}
        step={node.type === 'integer' ? 1 : undefined}
        details={help}
        disabled={off}
        onInput={(e) => {
          const v = e.currentTarget.value;
          onChange(v === '' ? undefined : Number(v));
        }}
      />
    );
  }

  // Array of scalars → comma-separated s-text-field
  if (node.type === 'array') {
    const arr = Array.isArray(value) ? (value as unknown[]) : [];
    const allowed = node.items?.enum ? ` Allowed: ${node.items.enum.join(', ')}.` : '';
    return (
      <s-text-field
        label={label}
        value={arr.join(', ')}
        details={`${help ? help + ' ' : ''}Comma-separated.${allowed}`}
        disabled={off}
        onInput={(e) => onChange((e.currentTarget.value ?? '').split(',').map((s) => s.trim()).filter(Boolean))}
      />
    );
  }

  // String → text / url / textarea
  const strValue = value === undefined || value === null ? '' : String(value);
  const onStr = (v: string) => onChange(v === '' ? undefined : v);

  if (widget === 'textarea' || widget === 'code') {
    return (
      <s-text-area
        label={label}
        value={strValue}
        rows={4}
        maxLength={node.maxLength}
        placeholder={hint?.placeholder}
        details={help}
        disabled={off}
        onInput={(e) => onStr(e.currentTarget.value ?? '')}
      />
    );
  }
  if (node.format === 'uri' || widget === 'url') {
    return (
      <s-url-field
        label={label}
        value={strValue}
        placeholder={hint?.placeholder}
        details={help}
        disabled={off}
        onInput={(e) => onStr(e.currentTarget.value ?? '')}
      />
    );
  }
  return (
    <s-text-field
      label={label}
      value={strValue}
      maxLength={node.maxLength}
      placeholder={hint?.placeholder}
      details={help}
      disabled={off}
      onInput={(e) => onStr(e.currentTarget.value ?? '')}
    />
  );
}

// ── Object (nested) renderer: one level of nested object inside a section ───

interface ObjectFieldsProps {
  node: JsonSchemaNode;
  hints?: SectionUiHints;
  basePath: string[];
  value: Record<string, unknown>;
  rootValue: Record<string, unknown>;
  tier: 'basic' | 'advanced';
  disabled?: boolean;
  onChangeAt: (path: string[], next: unknown) => void;
}

function ObjectFields({ node, hints, basePath, value, tier, disabled, onChangeAt }: ObjectFieldsProps) {
  const props = node.properties ?? {};
  const order = hints?.order ?? Object.keys(props);
  const keys = [...order, ...Object.keys(props).filter((k) => !order.includes(k))];
  const sibling = (field: string) => value?.[field];

  return (
    <s-stack gap="base">
      {keys.map((key) => {
        const child = props[key];
        if (!child) return null;
        const hint = hints?.fields?.[key];
        if (!isFieldVisible(hint, tier, sibling)) return null;
        const label = child.title ?? humanize(key);
        const path = [...basePath, key];
        const childValue = value?.[key];

        // Nested object (e.g. primaryCta { text, url }) → subheading + inline fields
        if (isSection(child)) {
          return (
            <s-stack key={key} gap="small-100">
              <s-text type="strong">{label}</s-text>
              <s-box paddingInlineStart="base">
                <ObjectFields
                  node={child}
                  hints={undefined}
                  basePath={path}
                  value={(childValue as Record<string, unknown>) ?? {}}
                  rootValue={value}
                  tier={tier}
                  disabled={disabled}
                  onChangeAt={onChangeAt}
                />
              </s-box>
            </s-stack>
          );
        }

        return (
          <LeafField
            key={key}
            node={child}
            label={label}
            hint={hint}
            value={childValue}
            disabled={disabled}
            onChange={(next) => onChangeAt(path, next)}
          />
        );
      })}
    </s-stack>
  );
}

// ── Top-level form ─────────────────────────────────────────────────────────

export function SchemaForm({ schema, uiSchema, value, onChange, tier = 'basic', disabled }: SchemaFormProps) {
  const onChangeAt = useCallback(
    (path: string[], next: unknown) => onChange(setIn(value, path, next)),
    [value, onChange],
  );

  const props = schema.properties ?? {};
  const sectionKeys = Object.keys(props);

  // Sections = top-level object properties; loose leaves get a "Settings" card.
  const sections = sectionKeys.filter((k) => isSection(props[k]!));
  const looseLeaves = sectionKeys.filter((k) => !isSection(props[k]!));

  return (
    <s-stack gap="base">
      {sections.map((key) => {
        const node = props[key]!;
        const hints = uiSchema?.[key];
        const heading = hints?.groupLabel ?? node.title ?? humanize(key);
        return (
          <s-box key={key} border="base" borderRadius="base" padding="base">
            <s-stack gap="base">
              <s-heading>{heading}</s-heading>
              <s-divider />
              <ObjectFields
                node={node}
                hints={hints}
                basePath={[key]}
                value={(value[key] as Record<string, unknown>) ?? {}}
                rootValue={value}
                tier={tier}
                disabled={disabled}
                onChangeAt={onChangeAt}
              />
            </s-stack>
          </s-box>
        );
      })}

      {looseLeaves.length > 0 && (
        <s-box border="base" borderRadius="base" padding="base">
          <s-stack gap="base">
            <s-heading>Settings</s-heading>
            <s-divider />
            <ObjectFields
              node={{ type: 'object', properties: Object.fromEntries(looseLeaves.map((k) => [k, props[k]!])) }}
              hints={undefined}
              basePath={[]}
              value={value}
              rootValue={value}
              tier={tier}
              disabled={disabled}
              onChangeAt={onChangeAt}
            />
          </s-stack>
        </s-box>
      )}
    </s-stack>
  );
}

export default SchemaForm;
