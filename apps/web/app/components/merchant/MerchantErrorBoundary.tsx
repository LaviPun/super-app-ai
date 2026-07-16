import { isRouteErrorResponse, useRouteError } from '@remix-run/react';
import { MerchantShell } from '~/components/merchant/MerchantShell';

/**
 * Route-level error boundary for the Polaris merchant surface. Exported as a
 * route's `ErrorBoundary` so an unhandled loader/action/render error renders
 * an in-app recovery page instead of the browser's crash screen.
 *
 * It renders a fresh `<MerchantShell polaris>` — the shell has no loader
 * dependency, so the subnav and ⌘K palette stay alive — and deliberately does
 * NOT call `useMerchantCtx` (the surrounding shell may not have mounted when the
 * error is thrown).
 */
export function MerchantErrorBoundary() {
  const error = useRouteError();

  let message =
    'An unexpected error interrupted this page. This is usually temporary — trying again often clears it.';

  if (isRouteErrorResponse(error)) {
    const statusText = error.statusText ? ` ${error.statusText}` : '';
    message = `The page couldn't load (${error.status}${statusText}). This is usually temporary — trying again often clears it.`;
  }

  return (
    <MerchantShell polaris>
      <s-page heading="Something went wrong" inlineSize="small">
        <s-section>
          <s-stack gap="base">
            <s-paragraph color="subdued">{message}</s-paragraph>
            <s-stack direction="inline" gap="small-100">
              <s-button variant="primary" onClick={() => window.location.reload()}>
                Try again
              </s-button>
              <s-button variant="tertiary" href="/">
                Back to dashboard
              </s-button>
            </s-stack>
          </s-stack>
        </s-section>
      </s-page>
    </MerchantShell>
  );
}
