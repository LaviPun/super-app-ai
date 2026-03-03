import { json, redirect, type ActionFunctionArgs } from '@remix-run/node';
import { useLoaderData, Form } from '@remix-run/react';
import { Page, Card, BlockStack, Text, TextField, Button, DataTable, Badge, Banner } from '@shopify/polaris';
import { shopify } from '~/shopify.server';
import { ScheduleService } from '~/services/flows/schedule.service';
import { getPrisma } from '~/db.server';

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

  if (intent === 'create') {
    const name = String(form.get('name') ?? '').trim();
    const cronExpr = String(form.get('cronExpr') ?? '').trim();
    const eventJson = String(form.get('eventJson') ?? '{}').trim();

    if (!name || !cronExpr) {
      return json({ error: 'Name and cron expression are required' }, { status: 400 });
    }

    try {
      await service.create({ shopId: shop.id, name, cronExpr, eventJson });
    } catch (err) {
      return json({ error: String(err) }, { status: 400 });
    }
    return redirect('/flows');
  }

  if (intent === 'delete') {
    const scheduleId = String(form.get('scheduleId') ?? '');
    await service.remove(scheduleId, shop.id);
    return redirect('/flows');
  }

  if (intent === 'toggle') {
    const scheduleId = String(form.get('scheduleId') ?? '');
    const isActive = form.get('isActive') === 'true';
    await service.toggle(scheduleId, shop.id, isActive);
    return redirect('/flows');
  }

  return redirect('/flows');
}

export default function FlowsIndex() {
  const { schedules } = useLoaderData<typeof loader>();

  return (
    <Page title="Flow Schedules">
      <BlockStack gap="400">
        <Banner tone="info">
          <Text as="p">
            Schedules trigger automation flows at regular intervals using standard 5-field cron syntax (UTC).
            Webhook triggers (order created, product updated) and manual triggers are handled automatically.
          </Text>
        </Banner>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Add Schedule</Text>
            <Form method="post">
              <input type="hidden" name="intent" value="create" />
              <BlockStack gap="200">
                <TextField label="Schedule name" name="name" autoComplete="off" placeholder="Daily inventory sync" />
                <TextField
                  label="Cron expression (UTC)"
                  name="cronExpr"
                  autoComplete="off"
                  placeholder="0 9 * * 1"
                  helpText='5 fields: minute hour day-of-month month day-of-week. "0 9 * * 1" = Mondays 09:00 UTC'
                />
                <TextField
                  label="Event JSON (optional)"
                  name="eventJson"
                  autoComplete="off"
                  placeholder='{}'
                  helpText="Extra payload forwarded to the flow step context"
                />
                <Button submit variant="primary">Create Schedule</Button>
              </BlockStack>
            </Form>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">Active Schedules ({schedules.length})</Text>
            {schedules.length === 0 ? (
              <Text as="p" tone="subdued">No schedules yet.</Text>
            ) : (
              <DataTable
                columnContentTypes={['text', 'text', 'text', 'text', 'text']}
                headings={['Name', 'Cron', 'Status', 'Last run', 'Actions']}
                rows={schedules.map(s => [
                  s.name,
                  s.cronExpr,
                  <Badge key={s.id} tone={s.isActive ? 'success' : 'attention'}>
                    {s.isActive ? 'Active' : 'Paused'}
                  </Badge>,
                  s.lastRunAt ? new Date(s.lastRunAt).toLocaleString() : '—',
                  <BlockStack key={s.id + 'acts'} gap="100">
                    <Form method="post" style={{ display: 'inline' }}>
                      <input type="hidden" name="intent" value="toggle" />
                      <input type="hidden" name="scheduleId" value={s.id} />
                      <input type="hidden" name="isActive" value={s.isActive ? 'false' : 'true'} />
                      <Button submit size="slim">{s.isActive ? 'Pause' : 'Resume'}</Button>
                    </Form>
                    <Form method="post" style={{ display: 'inline' }}>
                      <input type="hidden" name="intent" value="delete" />
                      <input type="hidden" name="scheduleId" value={s.id} />
                      <Button submit size="slim" tone="critical">Delete</Button>
                    </Form>
                  </BlockStack>,
                ])}
              />
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
