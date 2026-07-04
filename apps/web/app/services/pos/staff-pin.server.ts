/**
 * POS staff-PIN verification (build #16/#22 — makes the POS `requireStaffPin` gate REAL).
 *
 * The POS PinPad API COLLECTS a PIN but has NO built-in verification, so a
 * client-only "verified" check would be security theatre (see posBehavior.js
 * requireStaffPin). This module is the SERVER side: it validates a collected PIN
 * against the store's app-owned staff/role config and returns a boolean verdict.
 *
 * The config is a first-party `DataStore` (key `staff_pins`): one record per staff
 * PIN, payload `{ pin, role? , label? }`. This is the MINIMAL real store — Shopify
 * does NOT expose POS staff PINs to apps, so there is no external source to read; the
 * merchant provisions PINs in the app. Until they do, verification FAILS CLOSED
 * (`verified:false`) — never a fabricated approval.
 *
 * A `role` on the gate narrows the match: a PIN record must carry that role to
 * satisfy a role-scoped gate. A gate with no role matches any configured PIN.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { DataStoreService } from '~/services/data/data-store.service';

/** The canonical store key staff PINs live in (shop-scoped). */
export const STAFF_PIN_STORE_KEY = 'staff_pins';

export type StaffPinRecord = {
  /** The PIN, stored as a sha256 hex digest (`hash`) OR — legacy — a plaintext `pin`. */
  pin?: string;
  /** sha256 hex of the PIN (preferred; the route hashes on write). */
  hash?: string;
  /** Optional role this PIN satisfies (cashier / manager / …). Absent ⇒ any role. */
  role?: string;
  label?: string;
};

export type PinVerifyResult = {
  verified: boolean;
  /** Why a non-verified result happened — for honest client messaging, never leaks the PIN. */
  reason?: 'no_config' | 'no_match' | 'empty';
};

/** sha256 hex of a PIN string (constant-length so comparison is timing-safe). */
export function hashPin(pin: string): string {
  return createHash('sha256').update(pin, 'utf8').digest('hex');
}

/** Timing-safe equality over two equal-length hex digests. */
function digestsEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Verify a collected PIN against the shop's app-owned staff-PIN store. Fails CLOSED:
 *  - no store / no records → `{ verified:false, reason:'no_config' }`.
 *  - empty PIN            → `{ verified:false, reason:'empty' }`.
 *  - no matching record   → `{ verified:false, reason:'no_match' }`.
 * NEVER returns verified:true without a real matching record.
 */
export async function verifyStaffPin(
  shopId: string,
  pin: string,
  role: string | undefined,
  deps: { service?: DataStoreService } = {},
): Promise<PinVerifyResult> {
  const clean = (pin ?? '').trim();
  if (!clean) return { verified: false, reason: 'empty' };

  const service = deps.service ?? new DataStoreService();
  const store = await service.getStoreByKey(shopId, STAFF_PIN_STORE_KEY);
  if (!store) return { verified: false, reason: 'no_config' };

  const listing = await service.listRecords(shopId, STAFF_PIN_STORE_KEY, { limit: 200 });
  const rows = listing?.records ?? [];
  if (rows.length === 0) return { verified: false, reason: 'no_config' };

  const candidateHash = hashPin(clean);
  const wantRole = role?.trim().toLowerCase();

  for (const row of rows) {
    const rec = row.payload as StaffPinRecord | null;
    if (!rec || typeof rec !== 'object') continue;
    // Role gate: a role-scoped gate only matches a record carrying that role.
    if (wantRole) {
      const recRole = typeof rec.role === 'string' ? rec.role.trim().toLowerCase() : undefined;
      if (recRole !== wantRole) continue;
    }
    const stored =
      typeof rec.hash === 'string' && rec.hash
        ? rec.hash
        : typeof rec.pin === 'string' && rec.pin
          ? hashPin(rec.pin.trim())
          : undefined;
    if (stored && digestsEqual(stored, candidateHash)) {
      return { verified: true };
    }
  }
  return { verified: false, reason: 'no_match' };
}
