# Product

## Register

product

## Platform

web

## Users

The primary users are the platform's own operations and engineering team — first-party internal staff who run the multi-tenant AI Shopify SuperApp. They reach the console through SSO-gated internal auth (`requireInternalAdmin` / internal session), never as merchants. Their context is operational: they arrive to answer "is the fleet healthy right now, and if not, where and why," and to configure the platform that every merchant store depends on. They work fast, often mid-incident, across many stores at once, and they trust the numbers on screen to be real. This is not a merchant-facing surface; the people who use it are distinct from the merchants whose stores it observes.

## Product Purpose

This is the single operational console for running the whole platform. It is deliberately full-scope rather than a narrow dashboard: fleet health and incident response (store health, background jobs and the DLQ, webhook delivery, error logs, distributed traces), AI cost and usage governance (providers, models, per-store usage and spend, routing, quotas), platform configuration and catalog (modules, flows, connectors, data stores, templates, recipe editing, release gating), and revenue and merchant operations (plan tiers, subscriptions, MRR/ARPU, per-merchant accounts). Success is that an operator can observe any part of the platform and act on it from one place — spotting a failing surface, drilling from a symptom to its trace, and making the config or release change that fixes it, without leaving the shell or waiting on a developer.

## Brand Personality

Industrial and utilitarian with a warm polish. The voice is calm, precise, and operational — it states facts and current status plainly, and stays legible under heavy, dense, repeated use. It should feel trustworthy the way good instrumentation feels trustworthy: fast to read, honest about state, never decorative for its own sake. Three words: dependable, dense, unshowy.

## Anti-references

This should not look or feel like any of the following. Generic bright-blue SaaS: the default mid-blue-everywhere dashboard; the deeper primary (`#1F3A5F`) is a deliberate move away from it. Consumer-flashy and gradient-heavy: marketing-style gradients, hero-metric templates, and decorative flourishes belong on a landing page, not an operational tool. Sparse whitespace-luxe: airy, low-density layouts that look elegant but slow down scanning — operators need information density, not breathing room. Legacy enterprise admin: cramped, low-contrast, gray Bootstrap-era panels that read as dated and untrustworthy.

## Design Principles

Density with clarity. Pack real signal onto every screen, but keep it scannable — hierarchy, alignment, and tabular rhythm do the work so an operator reads rather than hunts.

Truth over decoration. Every figure is real backend data or an honest empty state; there is no placeholder or filler. The interface earns trust by never showing a number it can't stand behind.

One pane of glass. The whole platform is observable and operable from one shell. Favor drill-down (symptom → trace → fix) over context-switching to other tools.

Fast to understand, low-friction to operate. Minimize the distance from noticing a problem to acting on it — keyboard-first (⌘K), few clicks to the fix, status legible at a glance.

Safe by default. Mutating and destructive actions are gated, routed through a single ops path, and audited. The release gate and audit log are part of the design, not an afterthought.

## Accessibility & Inclusion

Commit to WCAG 2.2 AA. Body text meets 4.5:1 contrast (large/bold text 3:1), the console is fully keyboard-operable with a visible focus appearance, and interactive targets meet the 2.2 target-size guidance. Status is never conveyed by color alone — every state pairs color with an icon and text label, and charts carry a nearby table or textual summary. Honor `prefers-reduced-motion` for all transitions.
