#!/usr/bin/env bash
# Provision Cloudflare resources for Platform V2 (R2, Queues, KV). Cloudflare-only — no Kubernetes.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if command -v wrangler >/dev/null 2>&1; then
  WRANGLER=(wrangler)
elif command -v pnpm >/dev/null 2>&1; then
  WRANGLER=(pnpm exec wrangler)
else
  echo "error: install wrangler or pnpm" >&2
  exit 1
fi

R2_BUCKET="superapp-assets"
KV_TITLE="superapp-job-status"
QUEUES=(
  asset-storage
  ai-generation
  flow
  connector
  publish
  webhook
  retention
)

echo "=== Cloudflare resource setup (superapp) ==="
echo "repo: $ROOT"
echo ""

if ! "${WRANGLER[@]}" whoami >/dev/null 2>&1; then
  echo "Not logged in to Cloudflare."
  echo "Operator step: run wrangler login, then re-run this script."
  exit 1
fi

echo "Account:"
"${WRANGLER[@]}" whoami
echo ""

create_r2_bucket() {
  local list
  list="$("${WRANGLER[@]}" r2 bucket list 2>/dev/null || true)"
  if echo "$list" | grep -q "$R2_BUCKET"; then
    echo "[ok] R2 bucket $R2_BUCKET"
  else
    echo "[create] R2 bucket $R2_BUCKET"
    "${WRANGLER[@]}" r2 bucket create "$R2_BUCKET"
  fi
}

create_queue() {
  local name="$1"
  local list
  list="$("${WRANGLER[@]}" queues list 2>/dev/null || true)"
  if echo "$list" | grep -qw "$name"; then
    echo "[ok] queue $name"
  else
    echo "[create] queue $name"
    "${WRANGLER[@]}" queues create "$name"
  fi
}

create_kv_namespace() {
  local title="$1"
  local list
  list="$("${WRANGLER[@]}" kv namespace list 2>/dev/null || true)"
  if echo "$list" | grep -q "$title"; then
    echo "[ok] KV namespace $title (production)"
  else
    echo "[create] KV namespace $title (production)"
    "${WRANGLER[@]}" kv namespace create "$title"
  fi

  if echo "$list" | grep -q "${title} (preview)"; then
    echo "[ok] KV namespace $title (preview)"
  else
    echo "[create] KV namespace $title (preview)"
    "${WRANGLER[@]}" kv namespace create "$title" --preview
  fi
}

create_r2_bucket
for queue in "${QUEUES[@]}"; do
  create_queue "$queue"
done
create_kv_namespace "$KV_TITLE"

echo ""
echo "=== Next steps ==="
echo "1. Copy KV namespace IDs into apps/api/wrangler.jsonc:"
echo "   kv_namespaces → JOB_STATUS_KV id + preview_id"
echo "   List IDs: ${WRANGLER[*]} kv namespace list"
echo ""
echo "2. Set Worker vars/secrets (dashboard or wrangler secret put):"
echo "   - JOB_EXECUTION_MODE=queue   (after queues are bound)"
echo "   - PLATFORM_V2_ENABLED=true"
echo "   - Any Shopify / AI secrets required by your environment"
echo ""
echo "3. Deploy:"
echo "   pnpm --filter @superapp/api deploy:cf"
echo "   pnpm --filter @superapp/workers deploy:cf"
echo "   pnpm --filter @superapp/frontend build && pnpm --filter @superapp/frontend deploy:cf"
echo ""
echo "4. Verify:"
echo "   curl https://<api-worker-host>/health"
echo "   curl https://<api-worker-host>/ready"
