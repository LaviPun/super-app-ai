import { json, redirect } from '@remix-run/node';
import { Form, useLoaderData, useActionData } from '@remix-run/react';
import { Page, Card, BlockStack, TextField, Button, Text, InlineStack, Select } from '@shopify/polaris';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { AiProviderService } from '~/services/internal/ai-provider.service';
import { getPrisma } from '~/db.server';

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const service = new AiProviderService();
  const providers = await service.list();
  const prisma = getPrisma();
  const prices = await prisma.aiModelPrice.findMany({ where: { isActive: true }, include: { provider: true }, orderBy: { createdAt: 'desc' }, take: 200 });
  return json({ providers, prices });
}

export async function action({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const form = await request.formData();
  const intent = String(form.get('intent') ?? 'create');
  const service = new AiProviderService();
  const prisma = getPrisma();

  if (intent === 'activate') {
    const id = String(form.get('id') ?? '');
    if (!id) return json({ error: 'Missing id' }, { status: 400 });
    await service.setActive(id);
    return redirect('/internal/ai-providers');
  }

  if (intent === 'addPrice') {
    const providerId = String(form.get('providerId') ?? '');
    const model = String(form.get('model') ?? '').trim();
    const input = Number(form.get('inputCents') ?? '0');
    const output = Number(form.get('outputCents') ?? '0');
    const cached = String(form.get('cachedCents') ?? '').trim();
    if (!providerId || !model || !input || !output) return json({ error: 'providerId, model, input/output cents required' }, { status: 400 });

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
    return redirect('/internal/ai-providers');
  }

  const name = String(form.get('name') ?? '').trim();
  const provider = String(form.get('provider') ?? 'OPENAI');
  const apiKey = String(form.get('apiKey') ?? '').trim();
  const model = String(form.get('defaultModel') ?? '').trim();
  const baseUrl = String(form.get('baseUrl') ?? '').trim();

  if (!name || !apiKey) return json({ error: 'Name and API key are required' }, { status: 400 });

  await service.create({
    name,
    provider: provider as any,
    apiKey,
    model: model || undefined,
    baseUrl: baseUrl || undefined,
    isActive: true,
  });

  return redirect('/internal/ai-providers');
}

export default function InternalAiProviders() {
  const { providers, prices } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();

  const providerOptions = providers.map(p => ({ label: `${p.name} (${p.provider})`, value: p.id }));

  return (
    <Page title="AI Providers">
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Add provider</Text>
            {data?.error ? <Text tone="critical">{data.error}</Text> : null}
            <Form method="post">
              <BlockStack gap="200">
                <TextField label="Name" name="name" autoComplete="off" />
                <TextField label="Provider (OPENAI/ANTHROPIC/AZURE_OPENAI/CUSTOM)" name="provider" autoComplete="off" />
                <TextField label="Default model (optional)" name="defaultModel" autoComplete="off" />
                <TextField label="Base URL (optional)" name="baseUrl" autoComplete="off" />
                <TextField label="API key" name="apiKey" type="password" autoComplete="off" />
                <Button submit variant="primary">Save & set active</Button>
              </BlockStack>
            </Form>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Configured providers</Text>
            {providers.length === 0 ? <Text as="p">No providers configured.</Text> : null}
            {providers.map(p => (
              <Card key={p.id}>
                <BlockStack gap="200">
                  <Text as="p"><b>{p.name}</b> — {p.provider} {p.isActive ? '(global active)' : ''}</Text>
                  <InlineStack gap="200">
                    <Form method="post">
                      <input type="hidden" name="intent" value="activate" />
                      <input type="hidden" name="id" value={p.id} />
                      <Button submit disabled={p.isActive}>Set global active</Button>
                    </Form>
                  </InlineStack>
                </BlockStack>
              </Card>
            ))}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Model pricing (cents per 1M tokens)</Text>
            <Text as="p">Add pricing per model so costs are computed accurately.</Text>
            <Form method="post">
              <input type="hidden" name="intent" value="addPrice" />
              <BlockStack gap="200">
                <Select label="Provider" name="providerId" options={providerOptions} onChange={() => {}} />
                <TextField label="Model" name="model" autoComplete="off" />
                <TextField label="Input (cents / 1M)" name="inputCents" type="number" autoComplete="off" />
                <TextField label="Output (cents / 1M)" name="outputCents" type="number" autoComplete="off" />
                <TextField label="Cached input (cents / 1M) optional" name="cachedCents" type="number" autoComplete="off" />
                <Button submit>Save model pricing</Button>
              </BlockStack>
            </Form>

            <BlockStack gap="200">
              {prices.map(pr => (
                <Text as="p" key={pr.id}>
                  {pr.provider.name} — {pr.model} — in:{pr.inputPer1MTokensCents} out:{pr.outputPer1MTokensCents} cached:{pr.cachedInputPer1MTokensCents ?? '-'}
                </Text>
              ))}
            </BlockStack>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
