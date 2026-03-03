import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { Page, Card, BlockStack, Text, InlineStack, Button, InlineGrid } from '@shopify/polaris';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { MODULE_TEMPLATES } from '@superapp/core';
import { getPrisma } from '~/db.server';

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const prisma = getPrisma();
  const workflowCount = await prisma.workflowDef.count();

  return json({
    moduleTemplates: MODULE_TEMPLATES.map(t => ({
      id: t.id,
      name: t.name,
      category: t.category,
      type: t.type,
    })),
    workflowCount,
  });
}

export default function InternalTemplates() {
  const { moduleTemplates, workflowCount } = useLoaderData<typeof loader>();

  return (
    <Page title="Templates" subtitle="Manage module and flow templates shown to merchants.">
      <BlockStack gap="500">
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Module templates</Text>
            <Text as="p" tone="subdued">
              Default recipe templates for AI modules. Edit specs in Recipe edit (All recipes). Changes are stored as overrides and used when merchants create from template.
            </Text>
            <Button url="/internal/recipe-edit?shopId=__templates__">
              Edit module templates
            </Button>
            <Text as="p" variant="bodySm" tone="subdued">
              {moduleTemplates.length} templates: {moduleTemplates.map(t => t.name).join(', ')}
            </Text>
            <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="200">
              {moduleTemplates.slice(0, 12).map(t => (
                <Card key={t.id}>
                  <BlockStack gap="100">
                    <Text as="p" variant="headingSm">{t.name}</Text>
                    <Text as="p" variant="bodySm" tone="subdued">{t.type} · {t.category}</Text>
                  </BlockStack>
                </Card>
              ))}
            </InlineGrid>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Flow templates</Text>
            <Text as="p" tone="subdued">
              Workflow and flow templates. Edit via the flow builder (JSON or interactive). Store-defined workflows: {workflowCount}.
            </Text>
            <InlineStack gap="200">
              <Button url="/flows">Flow builder (merchant)</Button>
            </InlineStack>
            <Text as="p" variant="bodySm" tone="subdued">
              Interactive flow creator and flow template editor can be added here to manage default flow templates from the admin dashboard.
            </Text>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
