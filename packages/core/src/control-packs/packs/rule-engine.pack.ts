/**
 * `rule-engine` control pack (advanced) — R2.1 flagship: the merchant-authored
 * condition primitive. An ordered list of `{object, attribute, operator, value}`
 * rows combined AND/OR, evaluated top-to-bottom, that gates whether a storefront
 * module shows.
 *
 * Constrained + safe by construction: `object`/`attribute`/`operator` are ENUMS
 * (no `eval`, no arbitrary code, no user-supplied RegExp). The `(object, attribute)`
 * pair is validated against `RULE_ATTRIBUTES` — which is ALSO the runtime resolver
 * dispatch table — so a row the evaluator can't answer is a schema error, not a
 * silent no-op.
 *
 * Flat-pin path (post R2.4 prune): the pack `schema` is pinned as an `.optional()`
 * `ruleEngine` key onto `theme.section.config` and `proxy.widget.config` (see
 * recipe.ts). `enabled` defaults to `false` so a recipe without / with a disabled
 * pack always shows — the additive, back-compat-safe default.
 */
import { z } from 'zod';
import {
  RULE_OBJECTS,
  RULE_ATTRIBUTES,
  RULE_MATCH_ACTIONS,
  RULE_LIMITS,
  CONDITION_OPERATORS,
} from '../../allowed-values.js';
import type { ControlPack } from '../types.js';

/** One condition row: {object, attribute, operator, value}. */
export const RuleConditionSchema = z
  .object({
    object: z.enum(RULE_OBJECTS),
    attribute: z.string().min(1).max(60),
    operator: z.enum(CONDITION_OPERATORS),
    /** Value is a string OR string[] (for list/membership attributes) OR a
     *  number/boolean. Runtime coerces per RULE_ATTRIBUTE_VALUE_TYPES. `is_set` /
     *  `is_not_set` take no value (superRefine allows the empty default). */
    value: z
      .union([
        z.string().max(RULE_LIMITS.maxValueLen),
        z.array(z.string().max(RULE_LIMITS.maxValueLen)).max(RULE_LIMITS.maxValueListLen),
        z.number(),
        z.boolean(),
      ])
      .default(''),
  })
  .superRefine((row, ctx) => {
    // (object, attribute) must be a known pair — this is the anti-drift guard that
    // keeps the schema and the resolver dispatch table in lockstep.
    const attrs = RULE_ATTRIBUTES[row.object] as readonly string[];
    if (!attrs.includes(row.attribute)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unknown attribute "${row.attribute}" for object "${row.object}"`,
        path: ['attribute'],
      });
    }
    // is_set / is_not_set take no value; every other operator requires one.
    const valueless = row.operator === 'is_set' || row.operator === 'is_not_set';
    const empty = row.value === '' || (Array.isArray(row.value) && row.value.length === 0);
    if (!valueless && empty) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Operator "${row.operator}" requires a value`,
        path: ['value'],
      });
    }
  });
export type RuleCondition = z.infer<typeof RuleConditionSchema>;

/** A group of rows combined by an inner logic. Groups are combined by outer logic. */
export const RuleGroupSchema = z.object({
  logic: z.enum(['AND', 'OR']).default('AND'),
  conditions: z.array(RuleConditionSchema).min(1).max(RULE_LIMITS.maxRowsPerGroup),
});
export type RuleGroup = z.infer<typeof RuleGroupSchema>;

export const RuleEnginePackSchema = z.object({
  /** Master switch. When false (or the pack absent) the module always shows —
   *  this is what makes the pack purely additive and back-compat-safe. */
  enabled: z.boolean().default(false),
  /** Outer combinator across groups. */
  logic: z.enum(['AND', 'OR']).default('AND'),
  /** Ordered groups, evaluated top-to-bottom (Rebuy/Justuno semantics). */
  groups: z.array(RuleGroupSchema).max(RULE_LIMITS.maxGroups).default([]),
  /** What a MATCH means: SHOW the module when rules pass (default) or HIDE it. */
  matchAction: z.enum(RULE_MATCH_ACTIONS).default('SHOW'),
  /** Behavior when a client-only object (behavioral) can't be resolved server-side:
   *  'defer' → render hidden, let JS decide; 'ignore' → treat that row as neutral. */
  onUnresolved: z.enum(['defer', 'ignore']).default('defer'),
});
export type RuleEnginePack = z.infer<typeof RuleEnginePackSchema>;

export const ruleEnginePack: ControlPack<typeof RuleEnginePackSchema> = {
  id: 'rule-engine',
  namespace: 'ruleEngine',
  label: 'Display Rules',
  tier: 'advanced',
  schema: RuleEnginePackSchema,
  uiSchema: {
    groupLabel: 'Display rules',
    order: ['enabled', 'logic', 'groups', 'matchAction', 'onUnresolved'],
    fields: {
      groups: { widget: 'rule-builder', help: 'Conditions that decide when this module appears.' },
      logic: {
        showWhen: { field: 'enabled', equals: true },
        help: 'Combine groups: match ALL (AND) or ANY (OR).',
      },
      matchAction: { tier: 'advanced', showWhen: { field: 'enabled', equals: true } },
      onUnresolved: { tier: 'advanced', hidden: true }, // system-tuned default; not merchant-facing initially
    },
  },
};
