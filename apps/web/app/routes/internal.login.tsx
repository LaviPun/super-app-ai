import { json, redirect } from '@remix-run/node';
import { Form, useActionData, useSearchParams } from '@remix-run/react';
import { Page, Card, TextField, Button, BlockStack, Text } from '@shopify/polaris';
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
        <BlockStack gap="300">
          <Text as="p">This area is for the app owner / developers.</Text>
          {data?.error ? <Text as="p" tone="critical">{data.error}</Text> : null}
          <Form method="post">
            <input type="hidden" name="to" value={to} />
            <TextField label="Password" name="password" type="password" autoComplete="off" />
            <Button submit variant="primary">Sign in</Button>
              <div style={{ height: 12 }} />
              <a href="/internal/sso/start">Continue with SSO</a>
          </Form>
        </BlockStack>
      </Card>
    </Page>
  );
}
