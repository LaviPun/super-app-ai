import { json, redirect } from '@remix-run/node';
import { Form, useLoaderData } from '@remix-run/react';
import { Page, Card, BlockStack, Text, Select, InlineStack, Button } from '@shopify/polaris';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
import { AiProviderService } from '~/services/internal/ai-provider.service';

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const prisma = getPrisma();
  const shops = await prisma.shop.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { modules: true, aiProviderOverride: true },
  });
  const providers = await new AiProviderService().list();
  return json({ shops, providers });
}

export async function action({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const form = await request.formData();
  const shopId = String(form.get('shopId') ?? '');
  const providerId = String(form.get('providerId') ?? '');

  if (!shopId) return json({ error: 'Missing shopId' }, { status: 400 });

  const prisma = getPrisma();
  await prisma.shop.update({
    where: { id: shopId },
    data: { aiProviderOverrideId: providerId ? providerId : null },
  });

  return redirect('/internal/stores');
}

export default function InternalStores() {
  const { shops, providers } = useLoaderData<typeof loader>();
  const options = [
    { label: 'Use global provider', value: '' },
    ...providers.map(p => ({ label: `${p.name} (${p.provider})${p.isActive ? ' [global]' : ''}`, value: p.id })),
  ];

  return (
    <Page title="Stores">
      <Card>
        <BlockStack gap="300">
          {shops.map(s => (
            <Card key={s.id}>
              <BlockStack gap="200">
                <Text as="p"><b>{s.shopDomain}</b> — plan:{s.planTier} — modules:{s.modules.length}</Text>
                <Form method="post">
                  <input type="hidden" name="shopId" value={s.id} />
                  <InlineStack gap="200" align="start">
                    <div style={{ minWidth: 340 }}>
                      <Select
                        label="AI provider override"
                        name="providerId"
                        options={options}
                        value={s.aiProviderOverrideId ?? ''}
                        onChange={() => {}}
                      />
                    </div>
                    <Button submit>Save</Button>
                  </InlineStack>
                </Form>
              </BlockStack>
            </Card>
          ))}
        </BlockStack>
      </Card>
    </Page>
  );
}
