import { describe, it, expect } from 'vitest';
import { parseDataModel, validateRecord, dataModelToForm, dataModelToZod } from '../data-model.js';

const schemaJson = JSON.stringify({
  fields: [
    { name: 'email', type: 'email', required: true },
    { name: 'plan', type: 'select', options: ['free', 'pro'] },
    { name: 'seats', type: 'number' },
    { name: 'active', type: 'boolean' },
  ],
});

describe('data-model', () => {
  it('parses a valid schemaJson and rejects empty/invalid', () => {
    expect(parseDataModel(schemaJson)?.fields).toHaveLength(4);
    expect(parseDataModel(null)).toBeNull();
    expect(parseDataModel('{"fields":[]}')).toBeNull();
    expect(parseDataModel('not json')).toBeNull();
  });

  it('validates records against the typed model', () => {
    const model = parseDataModel(schemaJson)!;
    expect(validateRecord(model, { email: 'a@b.com', plan: 'pro', seats: 3, active: true }).ok).toBe(true);
    expect(validateRecord(model, { plan: 'pro' }).ok).toBe(false); // missing required email
    expect(validateRecord(model, { email: 'nope', plan: 'pro' }).ok).toBe(false); // bad email
    expect(validateRecord(model, { email: 'a@b.com', plan: 'enterprise' }).ok).toBe(false); // bad enum
  });

  it('treats an untyped store as always valid', () => {
    expect(validateRecord(null, { anything: 1 }).ok).toBe(true);
  });

  it('derives a SchemaForm config under a single record section', () => {
    const model = parseDataModel(schemaJson)!;
    const form = dataModelToForm(model);
    const record = (form.jsonSchema as any).properties.record;
    expect(Object.keys(record.properties)).toEqual(['email', 'plan', 'seats', 'active']);
    expect(record.properties.plan.enum).toEqual(['free', 'pro']);
    expect(record.required).toEqual(['email']);
  });

  it('builds a Zod validator with correct optionality', () => {
    const model = parseDataModel(schemaJson)!;
    const zod = dataModelToZod(model);
    expect(zod.safeParse({ email: 'a@b.com' }).success).toBe(true);
    expect(zod.safeParse({}).success).toBe(false);
  });
});
