import { json, redirect } from '@remix-run/node';
import { Form, useActionData, useSearchParams } from '@remix-run/react';
import { Page, Card, Button, BlockStack, Text, TextField } from '@shopify/polaris';
import { internalSessionStorage, commitInternal } from '~/internal-admin/session.server';

export async function action({ request }: { request: Request }) {
  const form = await request.formData();
  const password = String(form.get('password') ?? '');
  const to = String(form.get('to') ?? '/internal');

  const expected = process.env.INTERNAL_ADMIN_PASSWORD;
  if (!expected) return json({ error: 'Internal admin not configured' }, { status: 500 });

  if (password !== expected) return json({ error: 'Invalid password' }, { status: 401 });

  const session = await internalSessionStorage.getSession(request.headers.get('cookie'));
  session.set('internal_admin', true);
  return redirect(to, { headers: { 'Set-Cookie': await commitInternal(session) } });
}

export default function InternalLogin() {
  const data = useActionData<typeof action>();
  const [params] = useSearchParams();
  const to = params.get('to') ?? '/internal';

  return (
    <Page title="Internal Admin Login">
      <Card>
        <BlockStack gap="400">
          <Text as="p" variant="bodyMd" tone="subdued">This area is for the app owner and developers. Sign in to access the internal dashboard.</Text>
          {data?.error ? (
            <Text as="p" tone="critical" variant="bodySm">{data.error}</Text>
          ) : null}
          <Form method="post">
            <input type="hidden" name="to" value={to} />
            <BlockStack gap="300">
              <TextField
                label="Password"
                name="password"
                type="password"
                autoComplete="off"
                placeholder="Enter internal admin password"
              />
              <BlockStack gap="200">
                <Button submit variant="primary">Sign in</Button>
                <Text as="p" variant="bodySm" tone="subdued">
                  <a href="/internal/sso/start">Continue with SSO</a>
                </Text>
              </BlockStack>
            </BlockStack>
          </Form>
        </BlockStack>
      </Card>
    </Page>
  );
}
