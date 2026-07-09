#!/usr/bin/env node
/**
 * Pre-commit landmine guard for Shopify config files (wired via lint-staged).
 *
 * `shopify app dev` rewrites shopify.app.toml / shopify.extension.toml into a
 * stripped-down dev state (drops extension dirs, GDPR + webhook subscriptions,
 * write_themes, POS post-return/exchange targets, downgrades api_version).
 * Committing that state silently regresses features.
 *
 * This guard blocks the commit when a SENTINEL that exists in HEAD's version
 * of the file is missing from the STAGED version — i.e. it only ever fires on
 * a regression, never on legitimate forward changes (new scopes, new targets,
 * version upgrades all pass; adding sentinels over time keeps it honest).
 *
 * Fix when it fires: restore the file (`git restore --staged <file> && git
 * checkout -- <file>`) and keep your real change out of the dev-stripped copy.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const SENTINELS = {
  'shopify.app.toml': [
    'write_themes', // theme edit access (native sections)
    'customers/data_request', // GDPR compliance webhooks
    'customers/redact',
    'shop/redact',
    '[webhooks]', // subscription block
  ],
  'shopify.extension.toml': [
    // POS post-purchase surfaces the dev state drops
    'pos.return.post',
    'pos.exchange.post',
  ],
};

function gitShow(ref) {
  try {
    return execFileSync('git', ['show', ref], { encoding: 'utf8' });
  } catch {
    return null; // not in HEAD / not staged — nothing to compare
  }
}

// lint-staged passes ABSOLUTE paths; `git show <rev>:<path>` needs repo-relative.
const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const files = process.argv.slice(2).map((f) => path.relative(repoRoot, path.resolve(f)));
const failures = [];

for (const file of files) {
  const base = path.basename(file);
  const sentinels = SENTINELS[base];
  if (!sentinels) continue;
  const head = gitShow(`HEAD:${file}`);
  const staged = gitShow(`:${file}`);
  if (staged == null) continue; // deletion — not this guard's concern
  if (head == null) continue; // new file — no regression baseline
  for (const s of sentinels) {
    if (head.includes(s) && !staged.includes(s)) {
      failures.push(`${file}: staged version LOST "${s}" (present in HEAD) — this looks like the \`shopify app dev\` stripped-down state.`);
    }
  }
  // api_version downgrade check (app toml only)
  const ver = (t) => t?.match(/api_version\s*=\s*"(\d{4}-\d{2})"/)?.[1];
  const headVer = ver(head);
  const stagedVer = ver(staged);
  if (headVer && stagedVer && stagedVer < headVer) {
    failures.push(`${file}: api_version downgraded ${headVer} → ${stagedVer} — dev-stripped state.`);
  }
}

if (failures.length > 0) {
  console.error('\n✖ Shopify config landmine guard (scripts/check-shopify-config.mjs):\n');
  for (const f of failures) console.error(`  • ${f}`);
  console.error('\n  These files were rewritten by `shopify app dev`. Unstage & restore them:');
  console.error('    git restore --staged <file> && git checkout -- <file>\n');
  process.exit(1);
}
