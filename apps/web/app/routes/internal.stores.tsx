import { Outlet } from '@remix-run/react';

/**
 * Layout for /internal/stores (index) and /internal/stores/:storeId (store settings).
 */
export default function InternalStoresLayout() {
  return <Outlet />;
}
