/**
 * Zod schema for the hydrate step response envelope.
 * Used to validate LLM output before persisting to ModuleVersion.
 */
import { z } from 'zod';

const ValidationCheckSchema = z.object({
  id: z.string(),
  severity: z.enum(['blocker', 'high', 'medium', 'low']),
  status: z.enum(['PASS', 'WARN', 'FAIL']),
  description: z.string(),
  howToFix: z.string().optional(),
});

export const ValidationReportSchema = z.object({
  overall: z.enum(['PASS', 'WARN']),
  checks: z.array(ValidationCheckSchema),
  notes: z.array(z.string()).optional(),
});

const ThemeEditorFieldSchema = z.object({
  id: z.string(),
  type: z.string(),
  label: z.string(),
  default: z.unknown().optional(),
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  notes: z.string().optional(),
});

export const ThemeEditorSettingsSchema = z.object({
  fields: z.array(ThemeEditorFieldSchema),
  limitsNotes: z.array(z.string()).optional(),
});

const UiTokenItemSchema = z.object({
  token: z.string(),
  default: z.union([z.string(), z.number()]),
  themeAware: z.boolean().optional(),
});

export const UiTokensSchema = z.object({
  colors: z.array(UiTokenItemSchema).optional(),
  typography: z.array(UiTokenItemSchema).optional(),
  spacing: z.array(UiTokenItemSchema).optional(),
  radius: z.array(UiTokenItemSchema).optional(),
  shadow: z.array(UiTokenItemSchema).optional(),
});

export const AdminConfigSchemaSchema = z.object({
  schemaVersion: z.string(),
  jsonSchema: z.record(z.unknown()),
  uiSchema: z.record(z.unknown()).optional(),
  defaults: z.record(z.unknown()),
});

export const HydrateEnvelopeSchema = z.object({
  version: z.literal('2.0'),
  adminConfigSchema: AdminConfigSchemaSchema,
  themeEditorSettings: ThemeEditorSettingsSchema,
  uiTokens: UiTokensSchema.optional(),
  validationReport: ValidationReportSchema,
  implementationPlan: z
    .object({
      fileByFile: z.array(z.object({ path: z.string(), changeType: z.string(), details: z.string() })).optional(),
      runtimeHooks: z.array(z.record(z.unknown())).optional(),
    })
    .optional(),
  surfacePlan: z.record(z.unknown()).optional(),
  analytics: z.record(z.unknown()).optional(),
});

export type HydrateEnvelope = z.infer<typeof HydrateEnvelopeSchema>;
export type ValidationReport = z.infer<typeof ValidationReportSchema>;
export type ThemeEditorSettings = z.infer<typeof ThemeEditorSettingsSchema>;
export type UiTokens = z.infer<typeof UiTokensSchema>;
export type AdminConfigSchema = z.infer<typeof AdminConfigSchemaSchema>;
