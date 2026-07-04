/**
 * Web-push service-worker route (build #17b) — serves the SW script the browser
 * registers to receive push notifications.
 *
 * `webPushClientRegistration()` registers this URL (`/webpush/sw.js` by default) and
 * `pushManager.subscribe`s against the app's VAPID public key; the SW then displays
 * the notifications the `WebPushConnector` sends. The script is the pure string
 * `webPushServiceWorker()` returns — no per-shop state — served with the JS
 * content-type + a `Service-Worker-Allowed` header so the SW can claim a broad scope.
 */
import { webPushServiceWorker } from '~/services/workflows/connectors/webpush.connector';

export async function loader() {
  return new Response(webPushServiceWorker(), {
    status: 200,
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      // Allow the SW to control the whole origin (it is registered from /webpush/).
      'Service-Worker-Allowed': '/',
      // The SW rarely changes; let the browser cache it briefly but revalidate.
      'cache-control': 'public, max-age=600, must-revalidate',
    },
  });
}
