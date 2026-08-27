/**
 * Slack incoming-webhook sender for ops alerts (WS-G). New internal-admin-only
 * code — NOT a reuse of the merchant-facing Flow/messaging Slack connector
 * (`slack.connector.ts`), which is a different feature (per-shop, per-flow).
 */

const SLACK_TIMEOUT_MS = 10_000;

export async function sendSlackAlert(webhookUrl: string, text: string): Promise<{ sent: boolean; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SLACK_TIMEOUT_MS);
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    if (!res.ok) return { sent: false, error: `Slack webhook responded ${res.status}` };
    return { sent: true };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeout);
  }
}
