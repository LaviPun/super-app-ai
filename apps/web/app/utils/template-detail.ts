/** Builds the fetcher submit args for "Use template" — single source of truth
 *  so the button and its test agree on the real endpoint contract. */
export function useTemplateSubmission(templateId: string): { action: string; body: { templateId: string } } {
  return { action: '/api/modules/from-template', body: { templateId } };
}
