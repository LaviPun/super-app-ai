/**
 * Public support/contact page — Shopify App Store listing requirement.
 *
 * NOTE on the path: the app already has an authenticated merchant route at
 * `/support` (routes/support._index.tsx — the in-admin support-ticket list,
 * linked from root.tsx's <s-app-nav>). This public, unauthenticated contact
 * page therefore lives at `/contact` instead, to avoid colliding with that
 * existing route. `docs/launch/app-store-listing-draft.md`'s "Contact &
 * Legal" section only has a support-EMAIL field (support@lavipun.com,
 * already decided), not a support-URL field, so nothing there needs to point
 * at this path — it exists for merchants/shoppers who land on the app's own
 * domain looking for a way to reach us.
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
  { title: 'Support & Contact — Super App AI' },
  { name: 'robots', content: 'index, follow' },
];

export async function loader() {
  return json({ ok: true });
}

export default function Contact() {
  return (
    <main className="sa-public-page">
      <div className="sa-public-page__inner">
        <a className="sa-public-page__brand" href="/">
          <span className="sa-public-page__brand-mark">S</span>
          Super App AI
        </a>

        <h1>Support &amp; Contact</h1>
        <p className="sa-public-page__meta">We&rsquo;re happy to help.</p>

        <div className="sa-public-page__card">
          <p>
            Email us at{' '}
            <a href="mailto:support@lavipun.com">support@lavipun.com</a> and
            we&rsquo;ll get back to you as soon as we can.
          </p>
        </div>

        <h2>Merchants</h2>
        <p>
          If you have the app installed, the fastest way to reach us is the{' '}
          <strong>Support</strong> tab inside the app (Shopify admin
          sidebar), which routes your message straight into our ticket
          queue. You&rsquo;re also welcome to email{' '}
          <a href="mailto:support@lavipun.com">support@lavipun.com</a> directly
          — mention your shop domain so we can look up your account quickly.
        </p>

        <h2>Shoppers</h2>
        <p>
          If you&rsquo;re a shopper with a question about an order, a return,
          or something you submitted through a form on a store&rsquo;s
          website, please contact that store directly first — they are best
          placed to help, and any purchase, order, or shipping details live
          with them. If your question is about how a store is using Super
          App AI itself, you can also reach us at{' '}
          <a href="mailto:support@lavipun.com">support@lavipun.com</a>.
        </p>

        <h2>Privacy or data requests</h2>
        <p>
          For privacy questions or a data access/deletion request, see our{' '}
          <a href="/privacy">Privacy Policy</a> or email{' '}
          <a href="mailto:support@lavipun.com">support@lavipun.com</a>.
        </p>

        <footer className="sa-public-page__footer">
          <a href="/privacy">Privacy Policy</a>
          <a href="/terms">Terms of Service</a>
          <a href="/contact">Contact &amp; Support</a>
        </footer>
      </div>
    </main>
  );
}
