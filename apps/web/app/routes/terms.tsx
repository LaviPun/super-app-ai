/**
 * Public Terms of Service — optional, added alongside /privacy and /contact
 * since it's a cheap static page and rounds out the listing's legal
 * footprint. Not itself a hard Shopify listing requirement.
 *
 * PUBLIC, UNAUTHENTICATED, GET-only: no `shopify.authenticate.*` call, no
 * session read, static content only. See `~/security-headers.server.ts` and
 * `root.tsx`'s `isPublic` branch for how this stays off the embedded-app CSP
 * and merchant/internal app shell.
 */
import type { LinksFunction, MetaFunction } from '@remix-run/node';
import { json } from '@remix-run/node';
import publicPagesCss from '~/styles/public-pages.css?url';

export const links: LinksFunction = () => [{ rel: 'stylesheet', href: publicPagesCss }];

export const meta: MetaFunction = () => [
  { title: 'Terms of Service — Super App AI' },
  { name: 'robots', content: 'index, follow' },
];

const EFFECTIVE_DATE = 'August 27, 2026';

export async function loader() {
  return json({ effectiveDate: EFFECTIVE_DATE });
}

export default function Terms() {
  return (
    <main className="sa-public-page">
      <div className="sa-public-page__inner">
        <a className="sa-public-page__brand" href="/">
          <span className="sa-public-page__brand-mark">S</span>
          Super App AI
        </a>

        <h1>Terms of Service</h1>
        <p className="sa-public-page__meta">Effective date: {EFFECTIVE_DATE}</p>

        <p>
          These terms govern your use of Super App AI (&ldquo;the
          app&rdquo;) as installed on a Shopify store. By installing or using
          the app, you agree to these terms.
        </p>

        <h2>The app</h2>
        <p>
          Super App AI helps merchants generate storefront modules,
          discounts, and other commerce functionality with AI assistance,
          inside the Shopify admin. Your use of Shopify itself remains
          governed by Shopify&rsquo;s own Merchant Terms of Service.
        </p>

        <h2>Your responsibilities</h2>
        <ul>
          <li>You&rsquo;re responsible for the content you generate, publish,
            or configure through the app, and for making sure it complies
            with applicable law and Shopify&rsquo;s policies.</li>
          <li>You&rsquo;re responsible for keeping your Shopify account and
            store secure.</li>
          <li>You won&rsquo;t use the app to generate or publish content that
            is illegal, infringing, or abusive.</li>
        </ul>

        <h2>AI-generated content</h2>
        <p>
          Modules and other content the app generates are produced with
          assistance from third-party AI providers (see our{' '}
          <a href="/privacy">Privacy Policy</a> for which ones). AI output
          can be wrong or need editing — review generated content before
          publishing it to your storefront.
        </p>

        <h2>Availability</h2>
        <p>
          We aim to keep the app available and reliable but don&rsquo;t
          guarantee uninterrupted service. We may update, change, or
          discontinue features as the app evolves.
        </p>

        <h2>Disclaimer and limitation of liability</h2>
        <p>
          The app is provided &ldquo;as is&rdquo;, without warranties of any
          kind. To the extent permitted by law, we are not liable for
          indirect, incidental, or consequential damages arising from your
          use of the app.
        </p>

        <h2>Termination</h2>
        <p>
          You may uninstall the app at any time from your Shopify admin. On
          uninstall, we handle your data as described in our{' '}
          <a href="/privacy">Privacy Policy</a>.
        </p>

        <h2>Changes to these terms</h2>
        <p>
          If we materially change these terms, we&rsquo;ll update this page
          and change the effective date above.
        </p>

        <h2>Contact us</h2>
        <div className="sa-public-page__card">
          <p>
            Questions about these terms? Email us at{' '}
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
