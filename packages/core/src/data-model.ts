/**
 * Module-owned data models (Module System v2 backend data).
 *
 * A DataStore can carry a typed field schema in `DataStore.schemaJson`. This
 * module is the single source of truth for that schema: it parses it, derives a
 * Zod validator for records, and derives a SchemaForm-compatible
 * `{ jsonSchema, uiSchema, defaults }` so the SAME renderer used for module
 * settings drives typed record add/edit forms. Pure + isomorphic.
 */
import { z } from 'zod';

export const DATA_FIELD_TYPES = [
  'text', 'textarea', 'number', 'boolean', 'date', 'url', 'email', 'select',
] as const;
export type DataFieldType = (typeof DATA_FIELD_TYPES)[number];

export const DataFieldSchema = z.object({
  /** Stable machine name (the payload key). */
  name: z.string().min(1).max(60).regex(/^[A-Za-z][A-Za-z0-9_]*$/, 'Field name must be alphanumeric/underscore.'),
  label: z.string().max(80).optional(),
  type: z.enum(DATA_FIELD_TYPES).default('text'),
  required: z.boolean().default(false),
  /** Choices for `select` type. */
  options: z.array(z.string().min(1).max(80)).max(50).optional(),
  /** Marks the field as PII for redaction/storage policy. */
  piiFlag: z.boolean().default(false),
  help: z.string().max(200).optional(),
});
export type DataField = z.infer<typeof DataFieldSchema>;

export const DataModelSchema = z.object({
  fields: z.array(DataFieldSchema).max(60).default([]),
});
export type DataModel = z.infer<typeof DataModelSchema>;

/**
 * A module-declared typed data store (Module System v2 backend data). Pinned
 * onto the recipe `Base` as `dataModel` so any surface type can persist
 * first-party records. Provisioned at publish time via the canonical
 * `ensureTypedStore` writer — one authoritative record shape, N render surfaces.
 */
export const ModuleDataStoreSchema = z.object({
  /** Store label shown in the merchant Data Stores UI. */
  label: z.string().min(1).max(80),
  description: z.string().max(200).optional(),
  /**
   * Optional stable key override. When omitted, publish derives `module_<moduleId>`.
   * Normalized by `ensureTypedStore` (lowercased, non-[a-z0-9_] → '_', ≤40 chars).
   */
  key: z.string().min(1).max(40).optional(),
  /** The typed field schema. Reuses the DataField system 1:1. */
  schema: DataModelSchema,
});
export type ModuleDataStore = z.infer<typeof ModuleDataStoreSchema>;

/** Parse `DataStore.schemaJson` into a DataModel, or null if absent/empty/invalid. */
export function parseDataModel(schemaJson: string | null | undefined): DataModel | null {
  if (!schemaJson) return null;
  try {
    const parsed = DataModelSchema.safeParse(JSON.parse(schemaJson));
    return parsed.success && parsed.data.fields.length > 0 ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Build a Zod validator for a record payload from a DataModel. */
export function dataModelToZod(model: DataModel): z.ZodObject<z.ZodRawShape> {
  const shape: z.ZodRawShape = {};
  for (const f of model.fields) {
    let s: z.ZodTypeAny;
    switch (f.type) {
      case 'number': s = z.number(); break;
      case 'boolean': s = z.boolean(); break;
      case 'select': s = f.options?.length ? z.enum(f.options as [string, ...string[]]) : z.string(); break;
      case 'url': s = z.string().url(); break;
      case 'email': s = z.string().email(); break;
      default: s = z.string();
    }
    shape[f.name] = f.required ? s : s.optional();
  }
  return z.object(shape);
}

export interface RecordValidationResult {
  ok: boolean;
  /** Coerced/validated payload when ok. */
  data?: Record<string, unknown>;
  /** Human-readable error when not ok. */
  error?: string;
}

/** Validate a record payload against a model. No-op (ok) when the store is untyped. */
export function validateRecord(model: DataModel | null, payload: unknown): RecordValidationResult {
  if (!model) return { ok: true, data: (payload ?? {}) as Record<string, unknown> };
  const result = dataModelToZod(model).safeParse(payload ?? {});
  if (result.success) return { ok: true, data: result.data as Record<string, unknown> };
  return { ok: false, error: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
}

export interface DataRecordForm {
  jsonSchema: Record<string, unknown>;
  uiSchema: Record<string, unknown>;
  defaults: Record<string, unknown>;
}

/**
 * Derive a SchemaForm config for typed record entry. The payload fields live
 * under a single `record` section so the grouped renderer shows one card.
 */
export function dataModelToForm(model: DataModel): DataRecordForm {
  const properties: Record<string, Record<string, unknown>> = {};
  const required: string[] = [];
  const fieldHints: Record<string, Record<string, unknown>> = {};

  for (const f of model.fields) {
    const node: Record<string, unknown> = { title: f.label ?? f.name };
    if (f.help) node.description = f.help;
    switch (f.type) {
      case 'number': node.type = 'number'; break;
      case 'boolean': node.type = 'boolean'; break;
      case 'select': node.type = 'string'; node.enum = f.options ?? []; break;
      case 'url': node.type = 'string'; node.format = 'uri'; break;
      case 'email': node.type = 'string'; break;
      case 'textarea': node.type = 'string'; fieldHints[f.name] = { widget: 'textarea' }; break;
      case 'date': node.type = 'string'; fieldHints[f.name] = { widget: 'datetime' }; break;
      default: node.type = 'string';
    }
    properties[f.name] = node;
    if (f.required) required.push(f.name);
  }

  return {
    jsonSchema: {
      type: 'object',
      properties: { record: { type: 'object', title: 'Record', properties, required } },
    },
    uiSchema: { record: { groupLabel: 'Record', fields: fieldHints } },
    defaults: { record: {} },
  };
}
