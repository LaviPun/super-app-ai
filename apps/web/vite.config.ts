import { vitePlugin as remix } from '@remix-run/dev';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The Shopify CLI sets HOST to the tunnel URL. Map it to SHOPIFY_APP_URL
// so that shopify.server.ts and the rest of the app see the correct origin.
// See: https://github.com/Shopify/shopify-app-template-react-router/blob/main/vite.config.ts
//
// `isCliTunnel` is captured from the *original* presence of HOST, before the
// remap below. That's the only reliable signal that we're actually running
// behind the Shopify CLI's tunnel: SHOPIFY_APP_URL alone is not enough,
// because CI (and any other environment that just needs a non-empty appUrl
// for other services) sets it to a placeholder domain with nothing listening
// there. Deriving the wss/tunnel HMR branch from `host !== 'localhost'`
// instead of this flag made the dev server try to open a websocket to that
// placeholder host on every boot, which the browser logs as a console error
// on every single page — failing the e2e suite's "no console errors" checks.
const isCliTunnel = Boolean(process.env.HOST);
if (
  isCliTunnel &&
  (!process.env.SHOPIFY_APP_URL ||
    process.env.SHOPIFY_APP_URL === process.env.HOST)
) {
  process.env.SHOPIFY_APP_URL = process.env.HOST;
  delete process.env.HOST;
}

const host = new URL(process.env.SHOPIFY_APP_URL || 'http://localhost')
  .hostname;

let hmrConfig;
if (!isCliTunnel) {
  hmrConfig = {
    protocol: 'ws' as const,
    host: 'localhost',
    port: 64999,
    clientPort: 64999,
  };
} else {
  hmrConfig = {
    protocol: 'wss' as const,
    host: host,
    port: parseInt(process.env.FRONTEND_PORT!) || 8002,
    clientPort: 443,
  };
}

export default defineConfig({
  plugins: [
    remix({
      ignoredRouteFiles: ['**/*.test.*', '**/__tests__/**'],
      future: {
        v3_fetcherPersist: true,
        v3_lazyRouteDiscovery: true,
        v3_relativeSplatPath: true,
        v3_singleFetch: true,
        v3_throwAbortReason: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '~': path.resolve(__dirname, 'app'),
    },
  },
  server: {
    port: Number(process.env.PORT || 3000),
    strictPort: true,
    allowedHosts: [host],
    hmr: hmrConfig,
    watch: {
      ignored: ['**/.data/**'],
    },
    fs: {
      allow: ['app', 'node_modules'],
    },
  },
});
