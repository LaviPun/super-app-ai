import type { Connector } from '@superapp/core';
import { ShopifyConnector } from './shopify.connector';
import { HttpConnector } from './http.connector';
import { SlackConnector } from './slack.connector';
import { EmailConnector } from './email.connector';
import { StorageConnector } from './storage.connector';

const registry = new Map<string, Connector>();

registry.set('shopify', new ShopifyConnector());
registry.set('http', new HttpConnector());
registry.set('slack', new SlackConnector());
registry.set('email', new EmailConnector());
registry.set('storage', new StorageConnector());

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
