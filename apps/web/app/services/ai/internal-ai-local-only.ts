/** True when INTERNAL_AI_LOCAL_ONLY forces assistant traffic to localMachine only. */
export function isInternalAiLocalOnlyEnabledFromEnv(): boolean {
  const value = process.env.INTERNAL_AI_LOCAL_ONLY?.trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}
