import { Outlet, useOutletContext } from '@remix-run/react';

/**
 * Layout for /internal/stores (index) and /internal/stores/:storeId (store settings).
 * Forwards the internal layout's outlet context (e.g. `showToast`) to the nested
 * routes — without this, `useAdminCtx()` in the children receives `undefined` and
 * crashes (the design shell then never renders).
 */
export default function InternalStoresLayout() {
  const ctx = useOutletContext();
  return <Outlet context={ctx} />;
}
