import type { Connector } from '@superapp/core';
import { ShopifyConnector } from './shopify.connector';
import { HttpConnector } from './http.connector';
import { SlackConnector } from './slack.connector';
import { EmailConnector } from './email.connector';
import { SmsConnector } from './sms.connector';
import { WebPushConnector } from './webpush.connector';
import { StorageConnector } from './storage.connector';
import { MessagingConnector } from './messaging.connector';

const registry = new Map<string, Connector>();

registry.set('shopify', new ShopifyConnector());
registry.set('http', new HttpConnector());
registry.set('slack', new SlackConnector());
registry.set('email', new EmailConnector());
// build #7b — SMS (Twilio-style) + web-push (VAPID) delivery connectors. Consent /
// subscription is enforced by the runner; these connectors refuse to send when their
// provider credentials are absent (honest needs_runtime, never a fake send).
registry.set('sms', new SmsConnector());
registry.set('webpush', new WebPushConnector());
registry.set('storage', new StorageConnector());
// R3.4 cross-run paging resume seam — the durable scheduler fires
// `messaging.sendPage` to send the next page of a paged campaign fan-out.
registry.set('messaging', new MessagingConnector());

export function getConnectorRegistry(): Map<string, Connector> {
  return registry;
}

export function registerConnector(provider: string, connector: Connector): void {
  registry.set(provider, connector);
}

export function getConnector(provider: string): Connector | undefined {
  return registry.get(provider);
}

export function listConnectors(): Array<{ provider: string; manifest: ReturnType<Connector['manifest']> }> {
  return Array.from(registry.entries()).map(([provider, connector]) => ({
    provider,
    manifest: connector.manifest(),
  }));
}
