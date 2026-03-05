import { json, redirect } from '@remix-run/node';
import { Form, useLoaderData, useNavigation, useActionData } from '@remix-run/react';
import {
  Page, Card, BlockStack, TextField, Button, Text, InlineStack,
  Banner, Checkbox, Divider, InlineGrid, Avatar, Select,
} from '@shopify/polaris';
import { useState } from 'react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { SettingsService } from '~/services/settings/settings.service';
import { ActivityLogService } from '~/services/activity/activity.service';

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const settings = await new SettingsService().get();
  return json({ settings });
}

export async function action({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const form = await request.formData();
  const intent = String(form.get('intent') ?? 'save');
  const service = new SettingsService();
  const activity = new ActivityLogService();

  if (intent === 'appearance') {
    await service.update({
      appName: String(form.get('appName') ?? '').trim() || 'SuperApp AI',
      headerColor: String(form.get('headerColor') ?? '#000000').trim(),
      logoUrl: String(form.get('logoUrl') ?? '').trim() || null,
      faviconUrl: String(form.get('faviconUrl') ?? '').trim() || null,
    });
    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'STORE_SETTINGS_UPDATED', details: { section: 'appearance' } });
    return json({ toast: { message: 'Appearance settings saved' }, section: 'appearance' });
  }

  if (intent === 'profile') {
    await service.update({
      adminName: String(form.get('adminName') ?? '').trim() || 'Admin',
      adminEmail: String(form.get('adminEmail') ?? '').trim() || null,
      profilePicUrl: String(form.get('profilePicUrl') ?? '').trim() || null,
    });
    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'STORE_SETTINGS_UPDATED', details: { section: 'profile' } });
    return json({ toast: { message: 'Profile settings saved' }, section: 'profile' });
  }

  if (intent === 'contact') {
    await service.update({
      companyName: String(form.get('companyName') ?? '').trim() || null,
      supportEmail: String(form.get('supportEmail') ?? '').trim() || null,
      supportUrl: String(form.get('supportUrl') ?? '').trim() || null,
      privacyUrl: String(form.get('privacyUrl') ?? '').trim() || null,
      termsUrl: String(form.get('termsUrl') ?? '').trim() || null,
    });
    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'STORE_SETTINGS_UPDATED', details: { section: 'contact' } });
    return json({ toast: { message: 'Contact information saved' }, section: 'contact' });
  }

  if (intent === 'config') {
    await service.update({
      defaultTimezone: String(form.get('defaultTimezone') ?? 'UTC').trim(),
      dateFormat: String(form.get('dateFormat') ?? 'YYYY-MM-DD').trim(),
      enableEmailAlerts: form.get('enableEmailAlerts') === 'true',
      alertRecipients: String(form.get('alertRecipients') ?? '').trim() || null,
      maintenanceMode: form.get('maintenanceMode') === 'true',
      maintenanceMessage: String(form.get('maintenanceMessage') ?? '').trim() || null,
    });
    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'STORE_SETTINGS_UPDATED', details: { section: 'config' } });
    return json({ toast: { message: 'App configuration saved' }, section: 'config' });
  }

  return json({ error: 'Unknown intent' }, { status: 400 });
}

const TIMEZONE_OPTIONS = [
  { label: 'UTC', value: 'UTC' },
  { label: 'US/Eastern', value: 'US/Eastern' },
  { label: 'US/Central', value: 'US/Central' },
  { label: 'US/Mountain', value: 'US/Mountain' },
  { label: 'US/Pacific', value: 'US/Pacific' },
  { label: 'Europe/London', value: 'Europe/London' },
  { label: 'Europe/Berlin', value: 'Europe/Berlin' },
  { label: 'Europe/Paris', value: 'Europe/Paris' },
  { label: 'Asia/Tokyo', value: 'Asia/Tokyo' },
  { label: 'Asia/Shanghai', value: 'Asia/Shanghai' },
  { label: 'Asia/Kolkata', value: 'Asia/Kolkata' },
  { label: 'Australia/Sydney', value: 'Australia/Sydney' },
];

const DATE_FORMAT_OPTIONS = [
  { label: 'YYYY-MM-DD (2026-03-03)', value: 'YYYY-MM-DD' },
  { label: 'MM/DD/YYYY (03/03/2026)', value: 'MM/DD/YYYY' },
  { label: 'DD/MM/YYYY (03/03/2026)', value: 'DD/MM/YYYY' },
  { label: 'MMM DD, YYYY (Mar 03, 2026)', value: 'MMM DD, YYYY' },
];

export default function InternalSettings() {
  const { settings } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const isSaving = nav.state !== 'idle';

  const [appName, setAppName] = useState(settings.appName);
  const [headerColor, setHeaderColor] = useState(settings.headerColor);
  const [logoUrl, setLogoUrl] = useState(settings.logoUrl ?? '');
  const [faviconUrl, setFaviconUrl] = useState(settings.faviconUrl ?? '');

  const [adminName, setAdminName] = useState(settings.adminName);
  const [adminEmail, setAdminEmail] = useState(settings.adminEmail ?? '');
  const [profilePicUrl, setProfilePicUrl] = useState(settings.profilePicUrl ?? '');

  const [companyName, setCompanyName] = useState(settings.companyName ?? '');
  const [supportEmail, setSupportEmail] = useState(settings.supportEmail ?? '');
  const [supportUrl, setSupportUrl] = useState(settings.supportUrl ?? '');
  const [privacyUrl, setPrivacyUrl] = useState(settings.privacyUrl ?? '');
  const [termsUrl, setTermsUrl] = useState(settings.termsUrl ?? '');

  const [defaultTimezone, setDefaultTimezone] = useState(settings.defaultTimezone);
  const [dateFormat, setDateFormat] = useState(settings.dateFormat);
  const [enableEmailAlerts, setEnableEmailAlerts] = useState(settings.enableEmailAlerts);
  const [alertRecipients, setAlertRecipients] = useState(settings.alertRecipients ?? '');
  const [maintenanceMode, setMaintenanceMode] = useState(settings.maintenanceMode);
  const [maintenanceMessage, setMaintenanceMessage] = useState(settings.maintenanceMessage ?? '');

  const initials = adminName
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'SA';

  return (
    <Page title="Settings" subtitle="Appearance, profile, contact, and app configuration.">
      <BlockStack gap="500">
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Appearance</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Customize how the internal dashboard looks — app name, header color, and logo.
            </Text>
            <Form method="post">
              <input type="hidden" name="intent" value="appearance" />
              <BlockStack gap="300">
                <TextField
                  label="App name"
                  name="appName"
                  value={appName}
                  onChange={setAppName}
                  autoComplete="off"
                  helpText="Displayed in the sidebar logo and browser tab."
                />
                <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                  <div>
                    <TextField
                      label="Header / brand color"
                      name="headerColor"
                      value={headerColor}
                      onChange={setHeaderColor}
                      autoComplete="off"
                      helpText="Hex color for the top bar. Example: #1a1a2e"
                      connectedRight={
                        <div style={{ width: 40, height: 36, borderRadius: 4, backgroundColor: headerColor, border: '1px solid #ccc' }} />
                      }
                    />
                  </div>
                  <div>
                    <Text as="p" variant="bodySm" tone="subdued">Preview</Text>
                    <div style={{
                      height: 44,
                      borderRadius: 8,
                      background: headerColor,
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0 16px',
                      marginTop: 4,
                    }}>
                      <Text as="span" variant="headingSm">
                        <span style={{ color: '#fff' }}>{appName}</span>
                      </Text>
                    </div>
                  </div>
                </InlineGrid>
                <TextField
                  label="Logo URL"
                  name="logoUrl"
                  value={logoUrl}
                  onChange={setLogoUrl}
                  autoComplete="off"
                  helpText="URL to a square image (PNG/SVG, ~36x36px). Leave blank for the default text logo."
                  placeholder="https://example.com/logo.png"
                />
                {logoUrl && (
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="p" variant="bodySm" tone="subdued">Logo preview:</Text>
                    <img src={logoUrl} alt="Logo preview" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'contain' }} />
                  </InlineStack>
                )}
                <TextField
                  label="Favicon URL"
                  name="faviconUrl"
                  value={faviconUrl}
                  onChange={setFaviconUrl}
                  autoComplete="off"
                  helpText="URL to a favicon (.ico or .png). Displayed in the browser tab."
                  placeholder="https://example.com/favicon.ico"
                />
                <InlineStack align="start">
                  <Button submit variant="primary" loading={isSaving}>Save appearance</Button>
                </InlineStack>
              </BlockStack>
            </Form>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Profile</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Your identity in the dashboard — name, email, and profile picture.
            </Text>
            <Form method="post">
              <input type="hidden" name="intent" value="profile" />
              <BlockStack gap="300">
                <InlineStack gap="400" blockAlign="center">
                  {profilePicUrl ? (
                    <img
                      src={profilePicUrl}
                      alt="Profile"
                      style={{ width: 60, height: 60, borderRadius: '50%', objectFit: 'cover', border: '2px solid #e1e3e5' }}
                    />
                  ) : (
                    <div style={{
                      width: 60,
                      height: 60,
                      borderRadius: '50%',
                      backgroundColor: headerColor,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: 22,
                    }}>
                      {initials}
                    </div>
                  )}
                  <BlockStack gap="050">
                    <Text as="p" variant="headingSm">{adminName}</Text>
                    {adminEmail && <Text as="p" tone="subdued">{adminEmail}</Text>}
                  </BlockStack>
                </InlineStack>
                <TextField
                  label="Admin name"
                  name="adminName"
                  value={adminName}
                  onChange={setAdminName}
                  autoComplete="off"
                  helpText="Shown in the top-right user menu and activity logs."
                />
                <TextField
                  label="Email"
                  name="adminEmail"
                  type="email"
                  value={adminEmail}
                  onChange={setAdminEmail}
                  autoComplete="off"
                />
                <TextField
                  label="Profile picture URL"
                  name="profilePicUrl"
                  value={profilePicUrl}
                  onChange={setProfilePicUrl}
                  autoComplete="off"
                  helpText="URL to a square photo. Leave blank for initials avatar."
                  placeholder="https://example.com/avatar.jpg"
                />
                <InlineStack align="start">
                  <Button submit variant="primary" loading={isSaving}>Save profile</Button>
                </InlineStack>
              </BlockStack>
            </Form>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Contact & Legal</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Your company details, support channels, and legal links. These can be surfaced to merchants.
            </Text>
            <Form method="post">
              <input type="hidden" name="intent" value="contact" />
              <BlockStack gap="300">
                <TextField
                  label="Company name"
                  name="companyName"
                  value={companyName}
                  onChange={setCompanyName}
                  autoComplete="off"
                />
                <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                  <TextField
                    label="Support email"
                    name="supportEmail"
                    type="email"
                    value={supportEmail}
                    onChange={setSupportEmail}
                    autoComplete="off"
                    placeholder="support@yourapp.com"
                  />
                  <TextField
                    label="Support URL"
                    name="supportUrl"
                    value={supportUrl}
                    onChange={setSupportUrl}
                    autoComplete="off"
                    placeholder="https://help.yourapp.com"
                  />
                </InlineGrid>
                <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                  <TextField
                    label="Privacy policy URL"
                    name="privacyUrl"
                    value={privacyUrl}
                    onChange={setPrivacyUrl}
                    autoComplete="off"
                    placeholder="https://yourapp.com/privacy"
                  />
                  <TextField
                    label="Terms of service URL"
                    name="termsUrl"
                    value={termsUrl}
                    onChange={setTermsUrl}
                    autoComplete="off"
                    placeholder="https://yourapp.com/terms"
                  />
                </InlineGrid>
                <InlineStack align="start">
                  <Button submit variant="primary" loading={isSaving}>Save contact info</Button>
                </InlineStack>
              </BlockStack>
            </Form>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">App Configuration</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Global app behavior — timezone, date format, alerts, and maintenance mode.
            </Text>
            <Form method="post">
              <input type="hidden" name="intent" value="config" />
              <BlockStack gap="300">
                <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                  <Select
                    label="Default timezone"
                    name="defaultTimezone"
                    options={TIMEZONE_OPTIONS}
                    value={defaultTimezone}
                    onChange={setDefaultTimezone}
                    helpText="Used for displaying dates across the dashboard."
                  />
                  <Select
                    label="Date format"
                    name="dateFormat"
                    options={DATE_FORMAT_OPTIONS}
                    value={dateFormat}
                    onChange={setDateFormat}
                  />
                </InlineGrid>
                <Divider />
                <Text as="h3" variant="headingSm">Email alerts</Text>
                <Checkbox
                  label="Enable email alerts for errors and critical events"
                  checked={enableEmailAlerts}
                  onChange={setEnableEmailAlerts}
                />
                <input type="hidden" name="enableEmailAlerts" value={enableEmailAlerts ? 'true' : 'false'} />
                {enableEmailAlerts && (
                  <TextField
                    label="Alert recipients"
                    name="alertRecipients"
                    value={alertRecipients}
                    onChange={setAlertRecipients}
                    autoComplete="off"
                    helpText="Comma-separated email addresses."
                    placeholder="admin@yourapp.com, dev@yourapp.com"
                  />
                )}
                <Divider />
                <Text as="h3" variant="headingSm">Maintenance mode</Text>
                <Checkbox
                  label="Enable maintenance mode"
                  checked={maintenanceMode}
                  onChange={setMaintenanceMode}
                />
                <input type="hidden" name="maintenanceMode" value={maintenanceMode ? 'true' : 'false'} />
                {maintenanceMode && (
                  <Banner tone="warning" title="Maintenance mode is ON">
                    <Text as="p">The app will show a maintenance message to merchants.</Text>
                  </Banner>
                )}
                {maintenanceMode && (
                  <TextField
                    label="Maintenance message"
                    name="maintenanceMessage"
                    value={maintenanceMessage}
                    onChange={setMaintenanceMessage}
                    autoComplete="off"
                    multiline={3}
                    helpText="Message displayed to merchants while maintenance mode is active."
                    placeholder="We're performing scheduled maintenance. We'll be back shortly."
                  />
                )}
                <InlineStack align="start">
                  <Button submit variant="primary" loading={isSaving}>Save configuration</Button>
                </InlineStack>
              </BlockStack>
            </Form>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Password management</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              The internal admin password is set via <code>INTERNAL_ADMIN_PASSWORD</code> in your environment. To change it, update <code>.env</code> (or your deployment config) and restart the app. SSO (OIDC) can be used instead — see <code>INTERNAL_SSO_*</code> in docs.
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Send invite: configure your identity provider (e.g. Google Workspace) with the app&apos;s OIDC callback to allow team members to sign in.
            </Text>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Environment variables</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Sensitive config (API keys, secrets, database URL) is read from the environment. For a list of required and optional variables, see <code>.env.example</code> in the project root. Do not expose env values in the UI.
            </Text>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Advanced</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Store and plan control, feature flags, and danger-zone actions.
            </Text>
            <BlockStack gap="300">
              <Text as="h3" variant="headingSm">Store & plan control</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Change a store&apos;s billing plan (FREE, STARTER, GROWTH, PRO, ENTERPRISE) without going through Shopify billing.
              </Text>
              <Button url="/internal/stores">Go to Stores</Button>
              <Divider />
              <Text as="h3" variant="headingSm">Other controls</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Additional feature flags and danger-zone actions can be added here later.
              </Text>
            </BlockStack>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
