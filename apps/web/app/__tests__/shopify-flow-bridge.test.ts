import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  FLOW_ACTIONS,
  toOrderGid,
  emitFlowTriggerSafe,
  FLOW_TRIGGER_TOPICS,
} from '~/services/workflows/shopify-flow-bridge';

// extensions/ lives at the repo root; vitest runs from apps/web.
const EXTENSIONS_DIR = path.resolve(process.cwd(), '..', '..', 'extensions');

/** Reference field types have no `key`; Flow sends them under a fixed payload key. */
const REFERENCE_PAYLOAD_KEY: Record<string, string> = {
  order_reference: 'order_id',
  customer_reference: 'customer_id',
  product_reference: 'product_id',
};

/**
 * Extract the runtime payload keys from a flow_action/flow_trigger toml, in the
 * same way Shopify Flow serializes `properties`: custom fields by their `key`,
 * reference fields by their fixed payload key.
 */
function extractPayloadKeys(tomlText: string): string[] {
  const keys: string[] = [];
  const blocks = tomlText.split('[[settings.fields]]').slice(1);
  for (const block of blocks) {
    const body = block.split(/\n\s*\[/)[0] ?? block; // up to the next table header
    const type = body.match(/\btype\s*=\s*"([^"]+)"/)?.[1];
    const key = body.match(/\bkey\s*=\s*"([^"]+)"/)?.[1];
    if (!type) continue;
    if (REFERENCE_PAYLOAD_KEY[type]) keys.push(REFERENCE_PAYLOAD_KEY[type]!);
    else if (key) keys.push(key);
  }
  return keys;
}

function readActionToml(dir: string): { handle: string; runtimeUrl?: string; keys: string[] } {
  const text = fs.readFileSync(path.join(EXTENSIONS_DIR, dir, 'shopify.extension.toml'), 'utf8');
  const handle = text.match(/handle\s*=\s*"([^"]+)"/)?.[1] ?? '';
  const runtimeUrl = text.match(/^runtime_url\s*=\s*"([^"]+)"/m)?.[1];
  return { handle, runtimeUrl, keys: extractPayloadKeys(text) };
}

const ACTION_DIRS = [
  'superapp-flow-action-send-http',
  'superapp-flow-action-send-notification',
  'superapp-flow-action-tag-order',
  'superapp-flow-action-write-store',
];

const TRIGGER_DIRS = [
  'superapp-flow-trigger-module-published',
  'superapp-flow-trigger-connector-synced',
  'superapp-flow-trigger-data-record-created',
  'superapp-flow-trigger-workflow-completed',
  'superapp-flow-trigger-workflow-failed',
];

// FLOW_ACTIONS keyed by handle (its `id`) for lookup against the toml handles.
const actionById = Object.fromEntries(Object.values(FLOW_ACTIONS).map((a) => [a.id, a]));

describe('Flow action toml settings keys match the bridge payload keys', () => {
  it.each(ACTION_DIRS)('%s toml keys == FLOW_ACTIONS inputFields keys', (dir) => {
    const { handle, keys } = readActionToml(dir);
    const def = actionById[handle];
    expect(def, `no FLOW_ACTIONS entry for handle "${handle}"`).toBeTruthy();
    const expected = def!.inputFields.map((f) => f.key);
    expect(keys.slice().sort()).toEqual(expected.slice().sort());
  });
});

describe('Flow action runtime_url is a real absolute host (defect #1 regression guard)', () => {
  it.each(ACTION_DIRS)('%s runtime_url is absolute https and not localhost', (dir) => {
    const { runtimeUrl } = readActionToml(dir);
    expect(runtimeUrl, 'runtime_url missing').toBeTruthy();
    expect(runtimeUrl!.startsWith('https://')).toBe(true);
    expect(/localhost|127\.0\.0\.1/.test(runtimeUrl!)).toBe(false);
    expect(runtimeUrl!.endsWith('/api/flow/action')).toBe(true);
  });
});

describe('Trigger toml field keys match the keys emitted from the event sites', () => {
  // These MUST equal the payload keys the emit call sites build (module.service,
  // flow-runner, data-store.service, connector.service). flowTriggerReceive requires
  // the payload keys to equal each field's `key`, and all fields to be present.
  const EXPECTED: Record<string, string[]> = {
    'superapp-flow-trigger-module-published': ['Module ID', 'Module Name', 'Module Type', 'Shop Domain'],
    'superapp-flow-trigger-connector-synced': ['Connector ID', 'Connector Name', 'Sync Status', 'Shop Domain'],
    'superapp-flow-trigger-data-record-created': ['Store Key', 'Record ID', 'Record Title', 'Shop Domain'],
    'superapp-flow-trigger-workflow-completed': ['Workflow ID', 'Workflow Name', 'Run ID', 'Shop Domain'],
    'superapp-flow-trigger-workflow-failed': ['Workflow ID', 'Workflow Name', 'Run ID', 'Error Message', 'Shop Domain'],
  };

  it.each(TRIGGER_DIRS)('%s field keys match the emitted payload keys', (dir) => {
    const text = fs.readFileSync(path.join(EXTENSIONS_DIR, dir, 'shopify.extension.toml'), 'utf8');
    const keys = extractPayloadKeys(text);
    expect(keys.slice().sort()).toEqual(EXPECTED[dir]!.slice().sort());
  });
});

describe('toOrderGid coerces order_reference values into Admin order GIDs', () => {
  it('passes a GID through unchanged', () => {
    expect(toOrderGid('gid://shopify/Order/123')).toBe('gid://shopify/Order/123');
  });
  it('wraps a bare legacyResourceId', () => {
    expect(toOrderGid('123456')).toBe('gid://shopify/Order/123456');
  });
  it('trims whitespace', () => {
    expect(toOrderGid('  789  ')).toBe('gid://shopify/Order/789');
  });
  it('returns undefined for empty/missing/non-string input', () => {
    expect(toOrderGid('')).toBeUndefined();
    expect(toOrderGid('   ')).toBeUndefined();
    expect(toOrderGid(undefined)).toBeUndefined();
    expect(toOrderGid(12345)).toBeUndefined();
  });
});

describe('emitFlowTriggerSafe is best-effort and never throws', () => {
  it('resolves (no-op under test env) without throwing on missing token', async () => {
    await expect(
      emitFlowTriggerSafe('shop.myshopify.com', undefined, FLOW_TRIGGER_TOPICS.MODULE_PUBLISHED, { a: 1 }),
    ).resolves.toBeUndefined();
  });
});
