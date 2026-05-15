# Security Leak Ledger

Phase 1 source of truth references `docs/audit/security-leak-ledger.json`.

Included entries: 29 findings from the prior audit pass (IDs with gaps preserved from the prior report).

| ID    | Sev      | File                                                       | Owner          | Status |
| ----- | -------- | ---------------------------------------------------------- | -------------- | ------ |
| F-001 | Critical | apps/web/app/services/observability/api-log.service.ts     | Observability  | Open   |
| F-002 | Critical | apps/web/app/routes/api.connectors.create.tsx              | Connectors     | Open   |
| F-003 | Critical | apps/web/app/routes/api.connectors.$connectorId.update.tsx | Connectors     | Open   |
| F-004 | Critical | apps/web/app/routes/api.connectors.test.tsx                | Connectors     | Open   |
| F-005 | Critical | apps/web/app/routes/api.data-stores.tsx                    | Data Platform  | Open   |
| F-006 | Critical | apps/web/app/routes/proxy.capture.tsx                      | Data Platform  | Open   |
| F-007 | Critical | apps/web/app/routes/internal.api-logs.$logId.tsx           | Internal Admin | Open   |
| F-008 | Critical | apps/web/app/routes/api.report-error.tsx                   | Internal Admin | Open   |
| F-009 | Critical | apps/web/app/routes/webhooks.customers.redact.tsx          | Compliance     | Open   |
| F-010 | Critical | apps/web/app/routes/webhooks.shop.redact.tsx               | Compliance     | Open   |
| F-011 | High     | apps/web/app/services/ai/llm.server.ts                     | AI Platform    | Open   |
| F-012 | High     | apps/web/app/routes/internal.ai-assistant.chat.stream.tsx  | AI Platform    | Open   |
| F-013 | Critical | apps/web/app/services/data/data-store.service.ts           | Data Platform  | Open   |
| F-014 | High     | apps/web/app/services/connectors/connector.service.ts      | Security       | Open   |
| F-015 | High     | apps/web/app/services/flows/flow-runner.service.ts         | Security       | Open   |
| F-016 | High     | apps/web/app/services/ai/prompt-router.server.ts           | Security       | Open   |
| F-017 | High     | apps/web/app/services/ai/prompt-router.server.ts           | Observability  | Open   |
| F-018 | High     | apps/web/app/routes/internal.login.tsx                     | Internal Admin | Open   |
| F-019 | High     | apps/web/app/services/connectors/connector.service.ts      | Connectors     | Open   |
| F-020 | Medium   | apps/web/app/services/observability/api-log.service.ts     | Observability  | Open   |
| F-021 | Medium   | apps/web/app/routes/api.cron.tsx                           | Observability  | Open   |
| F-022 | Medium   | apps/web/app/internal-admin/session.server.ts              | Internal Admin | Open   |
| F-026 | Medium   | apps/web/app/routes/internal.tsx                           | Internal Admin | Open   |
| F-027 | Medium   | apps/web/app/routes/connectors.\_index.tsx                 | Connectors     | Open   |
| F-028 | Low      | apps/web/app/services/ai/internal-assistant.server.ts      | Security       | Open   |
| F-029 | Low      | apps/web/app/services/observability/api-log.service.ts     | Observability  | Open   |
| F-030 | Low      | apps/web/app/services/observability/logger.server.ts       | Observability  | Open   |
| F-031 | Low      | apps/web/app/routes/api.cron.tsx                           | Security       | Open   |
| F-032 | Low      | apps/web/app/routes/internal.metaobject-backfill.tsx       | Internal Admin | Open   |
