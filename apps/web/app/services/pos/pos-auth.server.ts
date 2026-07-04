/**
 * Shared POS App-Authentication helper for the POS app-proxy endpoints
 * (`/api/pos/loyalty`, `/api/pos/loyalty/verify-pin`, `/api/pos/observe`).
 *
 * POS UI extensions authenticate to THIS app's backend with a Shopify session
 * token (App Authentication, POS 10.6.0+ / api_version 2025-07+) — the SAME
 * mechanism `/api/pos/config` uses. This helper verifies the token via
 * `authenticate.public.pos`, resolves the shop row from the token `dest`, and
 * returns the CORS helper POS requires on the response.
 *
 * The token is the trust boundary: the shop is taken from the VERIFIED token, never
 * from a request-body/param a caller could spoof.
 */
import type { PrismaClient } from '@prisma/client';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';

/** Normalize a session-token `dest` (e.g. `https://shop.myshopify.com`) to a bare shop domain. */
export function shopDomainFromDest(dest: string): string {
  try {
    return new URL(dest).host;
  } catch {
    return dest.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  }
}

/** The CORS wrapper POS requires on every response (from `authenticate.public.pos`). */
type PosCors = Awaited<ReturnType<typeof shopify.authenticate.public.pos>>['cors'];

export type PosAuthContext = {
  shopDomain: string;
  /** The resolved Shop row id, or null when the shop is unknown to the app. */
  shopId: string | null;
  /** CORS wrapper POS requires on every response. */
  cors: PosCors;
};

/**
 * Verify the POS session token and resolve the shop. Callers get a `cors` helper
 * they MUST wrap their JSON response in (POS enforces the CORS headers).
 */
export async function authenticatePos(
  request: Request,
  prisma: PrismaClient = getPrisma(),
): Promise<PosAuthContext> {
  const { sessionToken, cors } = await shopify.authenticate.public.pos(request);
  const shopDomain = shopDomainFromDest(String(sessionToken.dest ?? ''));
  const shop = shopDomain
    ? await prisma.shop.findUnique({ where: { shopDomain }, select: { id: true } })
    : null;
  return { shopDomain, shopId: shop?.id ?? null, cors };
}
