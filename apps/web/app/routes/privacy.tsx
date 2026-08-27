/**
 * Public privacy policy — Shopify App Store listing requirement (App Store
 * review 4.5.2 / GDPR §2.4). Self-hosted per the owner's decision so the
 * listing never points at a third-party doc host.
 *
 * PUBLIC, UNAUTHENTICATED, GET-only: no `shopify.authenticate.*` call, no
 * session read, static content only (no DB query). See
 * `~/security-headers.server.ts` (PUBLIC_STANDALONE_PATHS /
 * isPublicStandalonePath) for how this route is kept off the embedded-app
 * CSP, and `root.tsx`'s `isPublic` branch for why it renders without the
 * merchant/internal app shell.
 *
 * Content is scoped to what this codebase actually does — verified against
 * the GDPR webhook handlers (webhooks.customers.data_request.tsx,
 * webhooks.customers.redact.tsx, webhooks.shop.redact.tsx), the Prisma
 * schema (DataCapture, SupportTicket, AiUsage models), and
 * docs/ai-providers.md (OpenAI / Anthropic / Google Gemini as the merchant
 * module-generation processors) rather than boilerplate claims.
 */
import type { LinksFunction, MetaFunction } from '@remix-run/node';
import { json } from '@remix-run/node';
import publicPagesCss from '~/styles/public-pages.css?url';

export const links: LinksFunction = () => [{ rel: 'stylesheet', href: publicPagesCss }];

export const meta: MetaFunction = () => [
  { title: 'Privacy Policy — Super App AI' },
  { name: 'robots', content: 'index, follow' },
];

const EFFECTIVE_DATE = 'August 27, 2026';

export async function loader() {
  return json({ effectiveDate: EFFECTIVE_DATE });
}

export default function PrivacyPolicy() {
  return (
    <main className="sa-public-page">
      <div className="sa-public-page__inner">
        <a className="sa-public-page__brand" href="/">
          <span className="sa-public-page__brand-mark">S</span>
          Super App AI
        </a>

        <h1>Privacy Policy</h1>
        <p className="sa-public-page__meta">Effective date: {EFFECTIVE_DATE}</p>

        <p>
          Super App AI (&ldquo;the app&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) is a Shopify app that lets
          merchants generate storefront modules, discounts, and other commerce
          functionality with AI assistance. This policy explains what data
          the app collects when a merchant installs it, why, who it is shared
          with, and how a merchant or their customers can request access to
          or deletion of that data.
        </p>
        <p>
          This policy covers the app itself. It does not cover Shopify&rsquo;s
          own handling of your store&rsquo;s data, which is governed by
          Shopify&rsquo;s own{' '}
          <a href="https://www.shopify.com/legal/privacy" target="_blank" rel="noreferrer">
            privacy policy
          </a>
          .
        </p>

        <h2>Information we collect</h2>
        <p>When a shop installs the app, we collect and store:</p>
        <ul>
          <li>
            <strong>Shop information</strong> — your shop domain, an encrypted
            Shopify API access token, and plan/subscription details needed to
            operate the app and bill for it.
          </li>
          <li>
            <strong>Module and configuration data</strong> — the storefront
            modules, discount/checkout functions, and settings you create or
            configure through the app (e.g. module type, layout, copy,
            pricing rules).
          </li>
          <li>
            <strong>AI generation inputs and outputs</strong> — the prompts
            and store context you or the app send to an AI provider when
            generating a module, and the content that provider returns.
          </li>
          <li>
            <strong>Support tickets</strong> — the subject, description, and
            message thread of any support ticket you open with us. If one of
            your customers (a shopper) submits a ticket through a module on
            your storefront, we also store the shopper&rsquo;s email address
            so we (or you) can follow up.
          </li>
          <li>
            <strong>Storefront data-capture records</strong> — when a
            merchant-configured module on your storefront collects
            information from a shopper (for example a survey response, a
            return request, or a stated preference), we store that submission
            together with the module it came from and, where the shopper is
            identified, their Shopify customer ID.
          </li>
          <li>
            <strong>Usage and billing metadata</strong> — counts and costs of
            AI generation calls, API request logs, and subscription/plan
            metadata used for billing and abuse prevention. This does not
            include your customers&rsquo; payment details, which Shopify
            processes directly and we never see.
          </li>
        </ul>

        <h2>How we use this information</h2>
        <ul>
          <li>To operate the app: generate, save, and publish the modules and
            functions you build.</li>
          <li>To provide support: triage and respond to tickets you or your
            shoppers submit.</li>
          <li>To bill correctly: track AI usage and plan status.</li>
          <li>To keep the app reliable and secure: error and audit logging,
            abuse prevention.</li>
        </ul>
        <p>We do not sell shop or shopper data, and we do not use it for advertising.</p>

        <h2>Third parties we share data with</h2>
        <p>
          We use a small set of processors to run the app. We share only what
          each one needs to do its job:
        </p>
        <ul>
          <li>
            <strong>AI providers</strong> — Anthropic (Claude), OpenAI, and
            Google (Gemini). When you generate a module, the relevant prompt
            and store context is sent to whichever of these providers is
            configured as active for AI generation, so it can return the
            generated module content. See{' '}
            <code>docs/ai-providers.md</code> in the app&rsquo;s source for the
            technical detail on how this routing works.
          </li>
          <li>
            <strong>Railway</strong> — our hosting provider. The app, its
            database, and background job infrastructure run on Railway&rsquo;s
            infrastructure.
          </li>
          <li>
            <strong>Shopify</strong> — the platform the app is built on and
            distributed through (Admin API, billing/App Pricing, and
            webhooks).
          </li>
        </ul>
        <p>
          We do not otherwise sell, rent, or share shop or shopper data with
          third parties.
        </p>

        <h2>Data retention</h2>
        <p>
          We retain shop data for as long as the app is installed. Some
          categories (AI usage logs, API logs, error logs) have their own
          configurable retention windows, defaulting to 30 days. When a
          merchant uninstalls the app, Shopify sends us a mandatory{' '}
          <code>shop/redact</code> compliance webhook (on Shopify&rsquo;s own
          schedule after uninstall), and we delete that shop&rsquo;s stored
          data in response — see &ldquo;GDPR compliance&rdquo; below.
        </p>

        <h2>GDPR compliance</h2>
        <p>
          The app implements Shopify&rsquo;s three mandatory GDPR compliance
          webhooks:
        </p>
        <ul>
          <li>
            <strong>customers/data_request</strong> — when a shopper requests
            their data, we compile what we hold about that customer and
            deliver it to the store owner, who can then fulfill the
            shopper&rsquo;s request.
          </li>
          <li>
            <strong>customers/redact</strong> — when a shopper&rsquo;s data
            must be deleted, we delete or anonymize the records we hold that
            are tied to that customer (data-capture submissions and related
            module event data).
          </li>
          <li>
            <strong>shop/redact</strong> — when a shop uninstalls the app (or
            after Shopify&rsquo;s mandatory post-uninstall window elapses), we
            delete that shop&rsquo;s data across the app&rsquo;s database.
          </li>
        </ul>
        <p>
          If you are a shopper and want to exercise a data access or deletion
          request directly, contact the store you purchased from — they are
          the data controller — or write to us at{' '}
          <a href="mailto:support@lavipun.com">support@lavipun.com</a> and
          we&rsquo;ll help route it.
        </p>

        <h2>Data security</h2>
        <p>
          Shopify API access tokens are stored encrypted at rest. Access to
          production data is restricted to the app&rsquo;s operator. We do not
          claim any third-party security certification (e.g. SOC 2, ISO
          27001) — if that matters for your evaluation, please ask us
          directly before installing.
        </p>

        <h2>Children&rsquo;s privacy</h2>
        <p>
          The app is a business tool for Shopify merchants and is not
          directed at children. We do not knowingly collect data from
          children.
        </p>

        <h2>Changes to this policy</h2>
        <p>
          If we materially change how we collect or use data, we&rsquo;ll
          update this page and change the effective date above.
        </p>

        <h2>Contact us</h2>
        <div className="sa-public-page__card">
          <p>
            Questions about this policy, or a data access/deletion request?
            Email us at{' '}
            <a href="mailto:support@lavipun.com">support@lavipun.com</a>.
          </p>
        </div>

        <footer className="sa-public-page__footer">
          <a href="/privacy">Privacy Policy</a>
          <a href="/terms">Terms of Service</a>
          <a href="/contact">Contact &amp; Support</a>
        </footer>
      </div>
    </main>
  );
}
