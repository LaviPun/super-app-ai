import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from '@remix-run/react';
import {
  CommandPalette,
  MerchantSubnav,
  Toast,
  superappRoute,
} from '~/components/superapp';

 

// Mirrors the prototype's `ctx` object that every merchant page receives.
// `go` maps the design's hash routes ("#/app/x") to real Remix paths.
// `toast` shows the design's bottom-center toast.
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

/**
 * In-app merchant chrome. The top-level nav (Dashboard / Build / Insights /
 * Settings / Billing) lives in the Shopify App Bridge `<s-app-nav>` (root.tsx),
 * OUTSIDE the embedded app. This component renders the design's `.m-content`
 * scaffolding INSIDE the app: the `.m-subnav` sub-tabs (self-hidden on
 * non-Build/Insights routes and on /generate), a ⌘K command palette, and the
 * bottom toast. Every merchant page renders its body inside <MerchantShell>.
 */
export function MerchantShell({
  children,
  fullBleed,
}: {
  children: ReactNode;
  fullBleed?: boolean;
}) {
  const navigate = useNavigate();
  const [cmdkOpen, setCmdkOpen] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const go = useCallback(
    (hash: string) => navigate(superappRoute(hash)),
    [navigate],
  );

  const showToast = useCallback((message: string, opts?: { error?: boolean }) => {
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

  return (
    <Ctx.Provider value={ctx}>
      <MerchantSubnav />
      <div className={fullBleed ? '' : 'm-content'}>{children}</div>
      {cmdkOpen && <CommandPalette mode="merchant" onClose={() => setCmdkOpen(false)} />}
      <Toast toast={toast} />
    </Ctx.Provider>
  );
}
