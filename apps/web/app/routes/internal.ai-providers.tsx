import { json, redirect } from '@remix-run/node';
import { Form, useLoaderData, useActionData, useNavigation } from '@remix-run/react';
import {
  Page, Card, BlockStack, TextField, Button, Text, InlineStack, Select,
  Badge, DataTable, Banner,
} from '@shopify/polaris';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { AiProviderService } from '~/services/internal/ai-provider.service';
import { ActivityLogService } from '~/services/activity/activity.service';
import { getPrisma } from '~/db.server';

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const service = new AiProviderService();
  const providers = await service.list();
  const prisma = getPrisma();
  const prices = await prisma.aiModelPrice.findMany({
    where: { isActive: true },
    include: { provider: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return json({ providers, prices });
}

export async function action({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const form = await request.formData();
  const intent = String(form.get('intent') ?? 'create');
  const service = new AiProviderService();
  const prisma = getPrisma();
  const activity = new ActivityLogService();

  if (intent === 'activate') {
    const id = String(form.get('id') ?? '');
    if (!id) return json({ error: 'Missing id' }, { status: 400 });
    await service.setActive(id);
    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'PROVIDER_ACTIVATED', resource: `provider:${id}` });
    return redirect('/internal/ai-providers');
  }

  if (intent === 'addPrice') {
    const providerId = String(form.get('providerId') ?? '');
    const model = String(form.get('model') ?? '').trim();
    const input = Number(form.get('inputCents') ?? '0');
    const output = Number(form.get('outputCents') ?? '0');
    const cached = String(form.get('cachedCents') ?? '').trim();
    if (!providerId || !model || !input || !output) {
      return json({ error: 'Provider, model, and input/output cents are required.' }, { status: 400 });
    }

    await prisma.aiModelPrice.create({
      data: {
        providerId,
        model,
        inputPer1MTokensCents: input,
        outputPer1MTokensCents: output,
        cachedInputPer1MTokensCents: cached ? Number(cached) : null,
        isActive: true,
      },
    });
    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'PRICE_ADDED', resource: `model:${model}`, details: { providerId, input, output } });
    return redirect('/internal/ai-providers');
  }

  const name = String(form.get('name') ?? '').trim();
  const provider = String(form.get('provider') ?? 'OPENAI');
  const apiKey = String(form.get('apiKey') ?? '').trim();
  const model = String(form.get('defaultModel') ?? '').trim();
  const baseUrl = String(form.get('baseUrl') ?? '').trim();

  if (!name || !apiKey) return json({ error: 'Name and API key are required.' }, { status: 400 });

  const created = await service.create({
    name,
    provider: provider as any,
    apiKey,
    model: model || undefined,
    baseUrl: baseUrl || undefined,
    isActive: true,
  });

  await activity.log({ actor: 'INTERNAL_ADMIN', action: 'PROVIDER_CREATED', resource: `provider:${name}`, details: { provider } });
  return redirect('/internal/ai-providers');
}

export default function InternalAiProviders() {
  const { providers, prices } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const isSaving = nav.state !== 'idle';

  const providerOptions = providers.map(p => ({ label: `${p.name} (${p.provider})`, value: p.id }));

  return (
    <Page title="AI Providers">
      <BlockStack gap="400">
        {data?.error ? (
          <Banner tone="critical" title="Error">
            <Text as="p">{data.error}</Text>
          </Banner>
        ) : null}

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Add provider</Text>
            <Form method="post">
              <BlockStack gap="200">
                <TextField label="Name" name="name" autoComplete="off" helpText="A friendly label for this provider." />
                <TextField label="Provider type" name="provider" autoComplete="off" helpText="OPENAI, ANTHROPIC, AZURE_OPENAI, or CUSTOM" placeholder="OPENAI" />
                <TextField label="Default model (optional)" name="defaultModel" autoComplete="off" />
                <TextField label="Base URL (optional)" name="baseUrl" autoComplete="off" />
                <TextField label="API key" name="apiKey" type="password" autoComplete="off" />
                <InlineStack align="start">
                  <Button submit variant="primary" loading={isSaving}>Save & set active</Button>
                </InlineStack>
              </BlockStack>
            </Form>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Configured providers ({providers.length})</Text>
            {providers.length === 0 ? (
              <Text as="p" tone="subdued">No providers configured yet. Add one above.</Text>
            ) : (
              providers.map(p => (
                <Card key={p.id}>
                  <InlineStack gap="200" align="space-between" blockAlign="center">
                    <InlineStack gap="200" blockAlign="center">
                      <Text as="p" variant="headingSm">{p.name}</Text>
                      <Badge>{p.provider}</Badge>
                      {p.isActive ? <Badge tone="success">Global active</Badge> : null}
                    </InlineStack>
                    <Form method="post">
                      <input type="hidden" name="intent" value="activate" />
                      <input type="hidden" name="id" value={p.id} />
                      <Button submit disabled={p.isActive} size="slim">{p.isActive ? 'Active' : 'Set global active'}</Button>
                    </Form>
                  </InlineStack>
                </Card>
              ))
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Model pricing (cents per 1M tokens)</Text>
            <Text as="p" tone="subdued">Add pricing per model so costs are computed accurately.</Text>
            <Form method="post">
              <input type="hidden" name="intent" value="addPrice" />
              <BlockStack gap="200">
                {providerOptions.length > 0 ? (
                  <Select label="Provider" name="providerId" options={providerOptions} onChange={() => {}} />
                ) : (
                  <Text as="p" tone="subdued">Add a provider first.</Text>
                )}
                <TextField label="Model" name="model" autoComplete="off" placeholder="gpt-4o" />
                <TextField label="Input (cents / 1M)" name="inputCents" type="number" autoComplete="off" />
                <TextField label="Output (cents / 1M)" name="outputCents" type="number" autoComplete="off" />
                <TextField label="Cached input (cents / 1M, optional)" name="cachedCents" type="number" autoComplete="off" />
                <InlineStack align="start">
                  <Button submit loading={isSaving}>Save model pricing</Button>
                </InlineStack>
              </BlockStack>
            </Form>

            {prices.length > 0 ? (
              <DataTable
                columnContentTypes={['text', 'text', 'numeric', 'numeric', 'numeric']}
                headings={['Provider', 'Model', 'Input', 'Output', 'Cached']}
                rows={prices.map(pr => [
                  pr.provider.name,
                  pr.model,
                  pr.inputPer1MTokensCents,
                  pr.outputPer1MTokensCents,
                  pr.cachedInputPer1MTokensCents ?? '—',
                ])}
              />
            ) : null}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
