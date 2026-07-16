import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useNavigation } from '@remix-run/react';
import {
  CommandPalette,
  MerchantSubnav,
  Toast,
  superappRoute,
} from '~/components/superapp';
import { SubnavTabs } from './polaris';

// Mirrors the prototype's `ctx` object that every merchant page receives.
// `go` maps the design's hash routes ("#/app/x") to real Remix paths.
// `toast` shows an App Bridge (admin-native) toast, falling back to the
// legacy bottom-center toast when App Bridge isn't available (bare dev tab).
export interface MerchantCtx {
  go: (hash: string) => void;
  toast: (message: string, opts?: { error?: boolean }) => void;
}

const Ctx = createContext<MerchantCtx | null>(null);

export function useMerchantCtx(): MerchantCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useMerchantCtx must be used inside <MerchantShell>');
  return ctx;
}

type ToastState = { message: string; error?: boolean } | null;

type AppBridgeToast = { toast?: { show: (message: string, opts?: { isError?: boolean; duration?: number }) => void } };

/**
 * In-app merchant chrome. The top-level nav (Dashboard / Build / Insights /
 * Support / Settings / Billing) lives in the Shopify App Bridge `<s-app-nav>`
 * (root.tsx), OUTSIDE the embedded app.
 *
 * Polaris web-components migration (transitional): pages that have been
 * migrated pass `polaris` and render bare `s-page` content under the new
 * `SubnavTabs`; unmigrated pages keep the legacy `.m-content` scaffolding and
 * vendored `MerchantSubnav`. The legacy branch is deleted once the last page
 * migrates. Both branches share the ⌘K palette and the `MerchantCtx` API, so
 * page call-sites never change.
 */
export function MerchantShell({
  children,
  fullBleed,
  polaris,
}: {
  children: ReactNode;
  fullBleed?: boolean;
  polaris?: boolean;
}) {
  const navigate = useNavigate();
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle';
  const [cmdkOpen, setCmdkOpen] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const go = useCallback(
    (hash: string) => navigate(superappRoute(hash)),
    [navigate],
  );

  const showToast = useCallback((message: string, opts?: { error?: boolean }) => {
    const bridge = (window as { shopify?: AppBridgeToast }).shopify;
    if (bridge?.toast?.show) {
      bridge.toast.show(message, { isError: opts?.error, duration: 4000 });
      return;
    }
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, error: opts?.error });
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const ctx = useMemo<MerchantCtx>(() => ({ go, toast: showToast }), [go, showToast]);

  // ⌘K / Ctrl+K toggles the command palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setCmdkOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  // Drive the admin-native App Bridge loading indicator during route
  // transitions, and clear it on cleanup so the true/false calls always pair.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const bridge = (window as { shopify?: { loading?: (v: boolean) => void } }).shopify;
    if (!bridge?.loading) return;
    if (busy) {
      bridge.loading(true);
      return () => bridge.loading?.(false);
    }
    return undefined;
  }, [busy]);

  return (
    <Ctx.Provider value={ctx}>
      {polaris ? (
        <div className="sa-merchant">
          {busy && (
            <>
              <style>{`
.sa-m-navbar-progress {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 2147483647;
  height: 2px;
  overflow: hidden;
  pointer-events: none;
  background: transparent;
}
.sa-m-navbar-progress::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: 40%;
  background: #2F80ED;
  transform: translateX(-100%);
  animation: sa-m-navbar-progress-slide 1.1s ease-in-out infinite;
}
@keyframes sa-m-navbar-progress-slide {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(350%); }
}
@media (prefers-reduced-motion: reduce) {
  .sa-m-navbar-progress::before {
    width: 100%;
    transform: none;
    animation: none;
    opacity: 0.7;
  }
}
`}</style>
              <div className="sa-m-navbar-progress" aria-hidden="true" />
            </>
          )}
          <SubnavTabs />
          {children}
        </div>
      ) : (
        <>
          <MerchantSubnav />
          <div className={fullBleed ? '' : 'm-content'}>{children}</div>
        </>
      )}
      {cmdkOpen && <CommandPalette mode="merchant" onClose={() => setCmdkOpen(false)} />}
      <Toast toast={toast} />
    </Ctx.Provider>
  );
}
