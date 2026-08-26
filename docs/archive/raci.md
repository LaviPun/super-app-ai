# Release Safety RACI

## Purpose

Define operational ownership for release safety controls introduced in Phase 4.

## Roles

- **Eng Platform**
  - Responsible for capability graph, policy snapshot compiler, progressive publish orchestration.
- **Backend Service Team**
  - Responsible for release state machine integration, route-level gating, audit-trail persistence.
- **SRE / On-call**
  - Responsible for rollout threshold tuning, rollback execution oversight, dashboard alerts.
- **Security / Governance**
  - Accountable for policy/allowlist governance and failure-class review.
- **Product / Ops**
  - Consulted on staged rollout windows and customer impact handling.
- **Support**
  - Informed for rollback incidents and customer-facing mitigations.

## RACI by Control

- **Capability Graph + Surface Allowlist**
  - R: Eng Platform
  - A: Security / Governance
  - C: Backend Service Team
  - I: Product / Ops

- **Release State Machine + Feature Flags**
  - R: Backend Service Team
  - A: Eng Platform
  - C: SRE / On-call
  - I: Support

- **Rollback Budget + Progressive Publish**
  - R: SRE / On-call
  - A: Eng Platform
  - C: Backend Service Team
  - I: Product / Ops, Support

- **Transition Audit Trail + Dashboard**
  - R: Backend Service Team
  - A: Security / Governance
  - C: SRE / On-call
  - I: Product / Ops

- **Telemetry Cardinality Budget**
  - R: Backend Service Team
  - A: Eng Platform
  - C: Security / Governance
  - I: SRE / On-call

