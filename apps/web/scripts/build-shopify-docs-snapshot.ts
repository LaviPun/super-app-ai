/*
 * build-shopify-docs-snapshot — refresh / validate the committed Shopify platform
 * docs grounding snapshot consumed by
 * `app/services/ai/shopify-docs-grounding.server.ts`.
 *
 * Run: npx tsx --tsconfig tsconfig.scripts.json scripts/build-shopify-docs-snapshot.ts [--restamp]
 *
 * ── How the CONTENT is refreshed ────────────────────────────────────────────
 * The docBlocks are distilled from the Shopify Dev MCP, which is a DEV-ONLY,
 * stdio-transport server (`@shopify/dev-mcp`) — it cannot be reached from CI or
 * production, and shopify.dev exposes no stable UNAUTHENTICATED docs-search HTTP
 * endpoint to hit here. So content refresh is a human/agent-in-the-loop step, not
 * an automated fetch:
 *
 *   1. In an environment with the Shopify Dev MCP available (e.g. Claude Code /
 *      Cursor with the shopify-dev-mcp server configured), for EACH family call:
 *        - learn_shopify_api(api: <surface>)  → conversationId
 *        - search_docs_chunks(conversationId, prompt: <family constraints query>)
 *      Families → API surface:
 *        theme                   → liquid
 *        checkoutUi              → polaris-checkout-extensions
 *        postPurchase            → polaris-checkout-extensions (post-purchase docs)
 *        discountFunction        → functions
 *        cartTransform           → functions
 *        deliveryPaymentFunction → functions
 *        adminExtension          → polaris-admin-extensions
 *        customerAccount         → polaris-customer-account-extensions
 *        flow                    → (search app-extensions / flow docs)
 *        webPixel                → (search web-pixels-api docs)
 *   2. DISTILL each family to <= ~600 tokens of dense, imperative facts
 *      (constraints, correct patterns, deprecations). Prefer fewer certain facts
 *      over speculative API specifics.
 *   3. Paste each into `shopify-docs/snapshot.json` under families.<key>.docBlock,
 *      update sourceRefs, then run THIS script with --restamp.
 *
 * ── What this script DOES automatically ─────────────────────────────────────
 *   - Recomputes each family's tokenEstimate (chars/4 heuristic).
 *   - Validates: every family docBlock is non-empty and <= MAX_FAMILY_TOKENS.
 *   - Prints a per-family token report.
 *   - With --restamp: rewrites snapshot.json (stamped tokenEstimates, and
 *     generatedAt = today when --restamp is passed) so the staleness clock resets
 *     only when a human confirms the content was refreshed.
 *
 * Exits non-zero if validation fails (usable as a CI guard).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const MAX_FAMILY_TOKENS = 700;

interface FamilyBlock {
  docBlock: string;
  tokenEstimate: number;
  sourceRefs?: string[];
}
interface DocsSnapshot {
  generatedAt: string;
  source: 'shopify-dev-mcp' | 'model-knowledge';
  note?: string;
  families: Record<string, FamilyBlock>;
}

/** Coarse token heuristic — kept in sync with the grounding module's intent. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function main(): void {
  const restamp = process.argv.includes('--restamp');
  const here = dirname(fileURLToPath(import.meta.url));
  const snapshotPath = join(here, '..', 'app', 'services', 'ai', 'shopify-docs', 'snapshot.json');

  const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8')) as DocsSnapshot;
  const families = Object.entries(snapshot.families);
  if (families.length === 0) {
    console.error('✗ snapshot has no families');
    process.exit(1);
  }

  const problems: string[] = [];
  let maxTokens = 0;

  console.log(`Shopify docs snapshot — generatedAt=${snapshot.generatedAt} source=${snapshot.source}`);
  console.log('family'.padEnd(26) + 'chars'.padStart(8) + 'tokens'.padStart(8));
  console.log('-'.repeat(42));

  for (const [key, block] of families) {
    const doc = (block.docBlock ?? '').trim();
    if (!doc) problems.push(`family "${key}" has an empty docBlock`);
    const tokens = estimateTokens(doc);
    maxTokens = Math.max(maxTokens, tokens);
    if (tokens > MAX_FAMILY_TOKENS) {
      problems.push(`family "${key}" is ${tokens} tokens (> ${MAX_FAMILY_TOKENS})`);
    }
    block.tokenEstimate = tokens; // re-stamp in-memory
    console.log(key.padEnd(26) + String(doc.length).padStart(8) + String(tokens).padStart(8));
  }

  console.log('-'.repeat(42));
  console.log(`families=${families.length}  maxTokens=${maxTokens}  cap=${MAX_FAMILY_TOKENS}`);

  if (problems.length > 0) {
    console.error('\n✗ validation failed:');
    for (const p of problems) console.error('  - ' + p);
    process.exit(1);
  }

  if (restamp) {
    snapshot.generatedAt = new Date().toISOString().slice(0, 10);
    writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2) + '\n');
    console.log(`\n✓ re-stamped snapshot (generatedAt=${snapshot.generatedAt}, tokenEstimates updated)`);
  } else {
    console.log('\n✓ validation passed (run with --restamp to rewrite tokenEstimates + generatedAt)');
  }
}

main();
