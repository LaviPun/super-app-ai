/** Builds the fetcher submit args for "Use template" — single source of truth
 *  so the button and its test agree on the real endpoint contract.
 *  Named without a `use*` prefix on purpose: it is a plain function, not a
 *  hook, and `use*` naming trips `react-hooks/rules-of-hooks` when called
 *  from inside an event handler. */
export function buildTemplateSubmission(templateId: string): { action: string; body: { templateId: string } } {
  return { action: '/api/modules/from-template', body: { templateId } };
}
