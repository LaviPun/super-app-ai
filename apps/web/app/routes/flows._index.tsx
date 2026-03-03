import { json, redirect, type ActionFunctionArgs } from '@remix-run/node';
import { useLoaderData, Form, useNavigation, useActionData } from '@remix-run/react';
import {
  Page, Card, BlockStack, Text, TextField, Button, DataTable, Badge,
  Banner, EmptyState, InlineStack, Modal, SkeletonBodyText,
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
  if (!shop) return json({ schedules: [] });

  const schedules = await new ScheduleService().list(shop.id);
  return json({ schedules });
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

    if (!name || !cronExpr) {
      return json({ error: 'Name and cron expression are required' }, { status: 400 });
    }

    try {
      const schedule = await service.create({ shopId: shop.id, name, cronExpr, eventJson });
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
  const { schedules } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const isSaving = nav.state !== 'idle';
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const handleDeleteClose = useCallback(() => setDeleteTarget(null), []);

  return (
    <Page title="Flow schedules" backAction={{ content: 'Home', url: '/' }}>
      <BlockStack gap="400">
        {actionData?.error ? (
          <Banner tone="critical" title="Error">
            <Text as="p">{actionData.error}</Text>
          </Banner>
        ) : null}

        <Banner tone="info">
          <Text as="p">
            Schedules trigger automation flows at regular intervals using standard 5-field cron syntax (UTC).
            Webhook triggers and manual triggers are handled automatically.
          </Text>
        </Banner>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Create schedule</Text>
            <Form method="post">
              <input type="hidden" name="intent" value="create" />
              <BlockStack gap="200">
                <TextField label="Schedule name" name="name" autoComplete="off" placeholder="Daily inventory sync" helpText="A descriptive name so you can identify this schedule later." />
                <TextField label="Cron expression (UTC)" name="cronExpr" autoComplete="off" placeholder="0 9 * * 1" helpText='5 fields: minute hour day-of-month month day-of-week. Example: "0 9 * * 1" runs Mondays at 09:00 UTC.' />
                <TextField label="Event JSON (optional)" name="eventJson" autoComplete="off" placeholder='{}' helpText="Extra payload forwarded to the flow step context." />
                <InlineStack align="start">
                  <Button submit variant="primary" loading={isSaving}>Create schedule</Button>
                </InlineStack>
              </BlockStack>
            </Form>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">Active schedules ({schedules.length})</Text>
            {isSaving ? (
              <SkeletonBodyText lines={3} />
            ) : schedules.length === 0 ? (
              <EmptyState heading="No schedules yet" image="" action={{ content: 'Create your first schedule', url: '#' }}>
                <p>Set up a cron schedule above to automate your workflows.</p>
              </EmptyState>
            ) : (
              <DataTable
                columnContentTypes={['text', 'text', 'text', 'text', 'text']}
                headings={['Name', 'Cron', 'Status', 'Last run', 'Actions']}
                rows={schedules.map(s => [
                  s.name,
                  s.cronExpr,
                  <Badge key={s.id} tone={s.isActive ? 'success' : 'attention'}>{s.isActive ? 'Active' : 'Paused'}</Badge>,
                  s.lastRunAt ? new Date(s.lastRunAt).toLocaleString() : '—',
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
          </BlockStack>
        </Card>
      </BlockStack>

      {deleteTarget && (
        <Modal
          open
          onClose={handleDeleteClose}
          title="Delete schedule"
          primaryAction={{
            content: 'Delete',
            destructive: true,
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
            <Text as="p">Are you sure you want to delete <strong>{deleteTarget.name}</strong>? This action cannot be undone.</Text>
          </Modal.Section>
        </Modal>
      )}
    </Page>
  );
}
