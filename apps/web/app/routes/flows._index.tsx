import { json, redirect, type ActionFunctionArgs } from '@remix-run/node';
import { useLoaderData, Form, useNavigation, useActionData, Link } from '@remix-run/react';
import {
  Page, Card, BlockStack, Text, TextField, Button, DataTable, Badge,
  Banner, EmptyState, InlineStack, Modal, SkeletonBodyText, InlineGrid, Divider,
} from '@shopify/polaris';
import { useState, useCallback } from 'react';
import { shopify } from '~/shopify.server';
import { ScheduleService } from '~/services/flows/schedule.service';
import { getPrisma } from '~/db.server';
import { ActivityLogService } from '~/services/activity/activity.service';

export async function loader({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);
  const prisma = getPrisma();
  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) return json({ schedules: [], flowModules: [], stats: { total: 0, active: 0, paused: 0, flows: 0 } });

  const [schedules, flowModules] = await Promise.all([
    new ScheduleService().list(shop.id),
    prisma.module.findMany({
      where: { shopId: shop.id, type: 'flow.automation' },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    }),
  ]);
  const active = schedules.filter(s => s.isActive).length;

  return json({
    schedules,
    flowModules: flowModules.map(m => ({
      id: m.id,
      name: m.name,
      status: m.status,
      updatedAt: m.updatedAt.toISOString(),
    })),
    stats: { total: schedules.length, active, paused: schedules.length - active, flows: flowModules.length },
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await shopify.authenticate.admin(request);
  const prisma = getPrisma();
  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) throw new Error('Shop not found');

  const form = await request.formData();
  const intent = form.get('intent') as string;
  const service = new ScheduleService();
  const activity = new ActivityLogService();

  if (intent === 'create') {
    const name = String(form.get('name') ?? '').trim();
    const cronExpr = String(form.get('cronExpr') ?? '').trim();
    const eventJson = String(form.get('eventJson') ?? '{}').trim();
    if (!name || !cronExpr) return json({ error: 'Name and cron expression are required' }, { status: 400 });
    try {
      await service.create({ shopId: shop.id, name, cronExpr, eventJson });
      await activity.log({ actor: 'MERCHANT', action: 'SCHEDULE_CREATED', shopId: shop.id, details: { name, cronExpr } });
    } catch (err) {
      return json({ error: String(err) }, { status: 400 });
    }
    return redirect('/flows');
  }

  if (intent === 'delete') {
    const scheduleId = String(form.get('scheduleId') ?? '');
    await service.remove(scheduleId, shop.id);
    await activity.log({ actor: 'MERCHANT', action: 'SCHEDULE_DELETED', shopId: shop.id, resource: `schedule:${scheduleId}` });
    return redirect('/flows');
  }

  if (intent === 'toggle') {
    const scheduleId = String(form.get('scheduleId') ?? '');
    const isActive = form.get('isActive') === 'true';
    await service.toggle(scheduleId, shop.id, isActive);
    await activity.log({ actor: 'MERCHANT', action: 'SCHEDULE_TOGGLED', shopId: shop.id, resource: `schedule:${scheduleId}`, details: { isActive } });
    return redirect('/flows');
  }

  return redirect('/flows');
}

export default function FlowsIndex() {
  const { schedules, flowModules, stats } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const isSaving = nav.state !== 'idle';
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const handleDeleteClose = useCallback(() => setDeleteTarget(null), []);
  const [showSchedules, setShowSchedules] = useState(false);
  const [showCreateSchedule, setShowCreateSchedule] = useState(false);

  const hasWorkflows = flowModules.length > 0;

  return (
    <Page
      title="Workflows"
      backAction={{ content: 'Dashboard', url: '/' }}
      primaryAction={<Link to="/flows/build/new"><Button variant="primary">Create workflow</Button></Link>}
      secondaryActions={[
        { content: 'Browse templates', url: '/flows/templates' },
      ]}
    >
      <BlockStack gap="500">
        {actionData?.error && (
          <Banner tone="critical" title="Error">
            <Text as="p">{actionData.error}</Text>
          </Banner>
        )}

        {/* ─── Empty state (matches Shopify Flow) ─── */}
        {!hasWorkflows && (
          <Card>
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ marginBottom: 24 }}>
                <svg width="120" height="80" viewBox="0 0 120 80" fill="none">
                  <rect x="20" y="5" width="80" height="20" rx="6" fill="#e4e5e7" />
                  <rect x="10" y="35" width="40" height="16" rx="5" fill="#e4e5e7" />
                  <rect x="70" y="35" width="40" height="16" rx="5" fill="#e4e5e7" />
                  <circle cx="35" cy="43" r="3" fill="#8c9196" />
                  <circle cx="85" cy="43" r="3" fill="#d4a853" />
                  <line x1="50" y1="15" x2="30" y2="35" stroke="#b5b5b5" strokeWidth="1.5" />
                  <line x1="70" y1="15" x2="90" y2="35" stroke="#b5b5b5" strokeWidth="1.5" />
                  <polygon points="56,10 64,10 60,18" fill="#45a99b" />
                </svg>
              </div>
              <Text as="h2" variant="headingLg">Get more work done in less time</Text>
              <div style={{ marginTop: 8, marginBottom: 24 }}>
                <Text as="p" tone="subdued">
                  Turn your tasks into automated workflows so you can get back to business.
                </Text>
              </div>
              <InlineStack gap="300" align="center">
                <Link to="/flows/templates"><Button>Browse templates</Button></Link>
                <Link to="/flows/build/new"><Button variant="primary">Create workflow</Button></Link>
              </InlineStack>
            </div>
          </Card>
        )}

        {/* ─── Workflow list ─── */}
        {hasWorkflows && (
          <Card>
            <BlockStack gap="300">
              <DataTable
                columnContentTypes={['text', 'text', 'text', 'text']}
                headings={['Name', 'Status', 'Updated', '']}
                rows={flowModules.map(m => [
                  m.name,
                  <Badge key={`s-${m.id}`} tone={m.status === 'PUBLISHED' ? 'success' : 'attention'}>{m.status}</Badge>,
                  new Date(m.updatedAt).toLocaleDateString(),
                  <Link key={m.id} to={`/flows/build/${m.id}`}><Button size="slim">Edit</Button></Link>,
                ])}
              />
            </BlockStack>
          </Card>
        )}

        {/* ─── Schedules (collapsible) ─── */}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <InlineStack gap="200" blockAlign="center">
                <Text as="h2" variant="headingMd">Schedules</Text>
                <Badge>{String(stats.total)}</Badge>
              </InlineStack>
              <InlineStack gap="200">
                {!showSchedules && (
                  <Button size="slim" onClick={() => setShowSchedules(true)}>
                    Show schedules
                  </Button>
                )}
                {showSchedules && (
                  <>
                    <Button size="slim" onClick={() => setShowCreateSchedule(!showCreateSchedule)}>
                      {showCreateSchedule ? 'Cancel' : 'Create schedule'}
                    </Button>
                    <Button size="slim" onClick={() => setShowSchedules(false)}>Hide</Button>
                  </>
                )}
              </InlineStack>
            </InlineStack>

            {showSchedules && showCreateSchedule && (
              <>
                <Divider />
                <Form method="post">
                  <input type="hidden" name="intent" value="create" />
                  <BlockStack gap="200">
                    <InlineGrid columns={{ xs: 1, sm: 2 }} gap="200">
                      <TextField label="Schedule name" name="name" autoComplete="off" placeholder="Daily inventory sync" />
                      <TextField label="Cron expression (UTC)" name="cronExpr" autoComplete="off" placeholder="0 9 * * 1" helpText='e.g. "0 9 * * 1" = Mondays 09:00 UTC' />
                    </InlineGrid>
                    <TextField label="Event payload (JSON)" name="eventJson" autoComplete="off" placeholder='{"type": "sync"}' />
                    <InlineStack align="start">
                      <Button submit variant="primary" loading={isSaving}>Create schedule</Button>
                    </InlineStack>
                  </BlockStack>
                </Form>
              </>
            )}

            {showSchedules && !showCreateSchedule && (
              <>
                <Divider />
                {schedules.length === 0 ? (
                  <Text as="p" tone="subdued">No schedules yet. Create one to automate workflows on a timer.</Text>
                ) : (
                  <DataTable
                    columnContentTypes={['text', 'text', 'text', 'text', 'text']}
                    headings={['Name', 'Cron', 'Status', 'Last run', '']}
                    rows={schedules.map(s => [
                      s.name,
                      <Text key={`c-${s.id}`} as="span" variant="bodySm"><code>{s.cronExpr}</code></Text>,
                      <Badge key={s.id} tone={s.isActive ? 'success' : 'attention'}>{s.isActive ? 'Active' : 'Paused'}</Badge>,
                      s.lastRunAt ? new Date(s.lastRunAt).toLocaleString() : <Text key={`r-${s.id}`} as="span" tone="subdued">Never</Text>,
                      <InlineStack key={s.id} gap="200">
                        <Form method="post">
                          <input type="hidden" name="intent" value="toggle" />
                          <input type="hidden" name="scheduleId" value={s.id} />
                          <input type="hidden" name="isActive" value={s.isActive ? 'false' : 'true'} />
                          <Button submit size="slim">{s.isActive ? 'Pause' : 'Resume'}</Button>
                        </Form>
                        <Button size="slim" tone="critical" onClick={() => setDeleteTarget({ id: s.id, name: s.name })}>Delete</Button>
                      </InlineStack>,
                    ])}
                  />
                )}
              </>
            )}
          </BlockStack>
        </Card>
      </BlockStack>

      {deleteTarget && (
        <Modal
          open
          onClose={handleDeleteClose}
          title="Delete schedule"
          primaryAction={{
            content: 'Delete', destructive: true,
            onAction: () => {
              const form = document.createElement('form');
              form.method = 'post';
              form.innerHTML = `<input name="intent" value="delete" /><input name="scheduleId" value="${deleteTarget.id}" />`;
              document.body.appendChild(form);
              form.submit();
            },
          }}
          secondaryActions={[{ content: 'Cancel', onAction: handleDeleteClose }]}
        >
          <Modal.Section>
            <Text as="p">Are you sure you want to delete <strong>{deleteTarget.name}</strong>? This cannot be undone.</Text>
          </Modal.Section>
        </Modal>
      )}
    </Page>
  );
}
