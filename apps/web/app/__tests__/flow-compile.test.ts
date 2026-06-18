import { describe, it, expect } from 'vitest';
import { WorkflowSchema, validateWorkflow } from '@superapp/core';
import { flowAutomationToWorkflow } from '~/services/flows/flow-compile';

const meta = { id: 'mod_abc123', name: 'VIP tagging', tenantId: 'shop_1' };

describe('flowAutomationToWorkflow — unify legacy flows onto the engine', () => {
  it('compiles a legacy {trigger, steps} config into a schema-valid, runnable Workflow', () => {
    const wf = flowAutomationToWorkflow(
      {
        trigger: 'SHOPIFY_WEBHOOK_ORDER_CREATED',
        steps: [
          { kind: 'TAG_ORDER', tags: 'vip, priority' },
          { kind: 'ADD_ORDER_NOTE', note: 'Auto-tagged by flow' },
          { kind: 'WRITE_TO_STORE', storeKey: 'order', payloadMapping: { id: 'admin_graphql_api_id' } },
        ],
      },
      meta,
    );

    // Parses against the canonical schema and passes structural validation.
    expect(() => WorkflowSchema.parse(wf)).not.toThrow();
    expect(validateWorkflow(wf).valid).toBe(true);

    // Trigger mapped to a typed event.
    expect(wf.trigger).toMatchObject({ type: 'event', provider: 'shopify', event: 'order.created' });

    // Steps mapped to the right connector ops, in order, then an end node.
    const actions = wf.nodes.filter((n) => n.type === 'action').map((n) => `${n.action!.provider}.${n.action!.operation}`);
    expect(actions).toEqual(['shopify.order.addTags', 'shopify.order.addNote', 'superapp.datastore.createRecord']);
    expect(wf.nodes.some((n) => n.type === 'end')).toBe(true);
  });

  it('maps order routing + tag-customer + email steps', () => {
    const wf = flowAutomationToWorkflow(
      {
        trigger: 'SHOPIFY_WEBHOOK_ORDER_CREATED',
        steps: [
          { kind: 'ROUTE_ORDER', newLocationId: 'gid://shopify/Location/9' },
          { kind: 'TAG_CUSTOMER', tag: 'auto' },
          { kind: 'SEND_EMAIL_NOTIFICATION', to: 'ops@store.com', subject: 'Routed', body: 'x' },
        ],
      },
      meta,
    );
    const ops = wf.nodes.filter((n) => n.type === 'action').map((n) => n.action!.operation);
    expect(ops).toEqual(['order.routeToLocation', 'customer.addTags', 'send']);
    // order routing carries the destination location.
    const route = wf.nodes.find((n) => n.action?.operation === 'order.routeToLocation');
    expect(route!.action!.inputs.newLocationId).toBe('gid://shopify/Location/9');
  });

  it('tolerates an unknown trigger (falls back to manual) and skips unknown steps', () => {
    const wf = flowAutomationToWorkflow(
      { trigger: 'NOPE', steps: [{ kind: 'UNKNOWN_STEP' }, { kind: 'TAG_ORDER', tags: 'a' }] },
      meta,
    );
    expect(wf.trigger.type).toBe('manual');
    const actions = wf.nodes.filter((n) => n.type === 'action');
    expect(actions).toHaveLength(1); // unknown step skipped
    expect(validateWorkflow(wf).valid).toBe(true);
  });
});
