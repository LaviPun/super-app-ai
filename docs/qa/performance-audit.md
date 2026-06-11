# Performance & accessibility audit — 2026-05-19

Tool: **Lighthouse 12.6.1** (headless Chrome), categories: performance, accessibility, best-practices.

## Production builds

| URL | Build | Perf | A11y | Best practices |
|-----|-------|------|------|----------------|
| `http://127.0.0.1:4100/internal/login` | Remix `pnpm build` + `PORT=4100 pnpm start` | **92** | **100** | **89** |
| `http://127.0.0.1:3102/` | Next `pnpm build` + `next start -p 3102` | **100** | **89** | **96** |

## Notes

- Scores are on **production** artifacts, not Vite dev HMR.
- Next app defaults `start` script to port **3000** (same as merchant Remix dev). For local prod Lighthouse use `pnpm exec next start -p 3102` or set `PORT` in your runbook.
- Dev-only noise (Vite WebSocket, HMR) is filtered in Playwright crawl specs; not included in Lighthouse runs.
- Further pages (authenticated internal dashboard, embedded merchant) require session cookies or Shopify iframe — run manually after login or extend E2E to export storage state for Lighthouse CI if needed.

## Playwright axe (authenticated internal)

`e2e/internal/a11y-auth.spec.ts` — **no serious** violations on:

- `/internal/login`
- `/internal`
- `/internal/ai-assistant`
- `/internal/templates`
- `/internal/settings`
