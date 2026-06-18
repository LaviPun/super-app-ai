import { useState, useEffect } from 'preact/hooks';

/**
 * @typedef {Object} PosBlockConfig
 * @property {string} moduleId
 * @property {string} name
 * @property {string} target
 * @property {string} label
 * @property {('tile'|'modal'|'block'|'action')} [blockKind]
 */

/**
 * @typedef {{status:'loading'}
 *   | {status:'error', message:string}
 *   | {status:'ready', blocks:PosBlockConfig[]}} PosConfigState
 */

/**
 * Fetches this shop's PUBLISHED `pos.extension` module config from the app
 * backend (`/api/pos/config`).
 *
 * POS UI extensions cannot read Storefront-accessible metaobjects, so config is
 * read from the app via App Authentication: we attach a Shopify session token
 * (`shopify.session.getSessionToken()`) as a Bearer token. POS resolves the
 * relative URL against the app's `app_url` and automatically allows the
 * authenticated request to the app's own domain. The backend
 * (`authenticate.public.pos`) verifies the token, resolves the shop, and returns
 * the live config. No demo data — an unconfigured shop yields an empty list.
 *
 * @param {string} target - POS target this surface renders at; only blocks
 *   published to this target (or with no target pin) are returned.
 * @returns {{status:'loading'}|{status:'error',message:string}|{status:'ready',blocks:Array}}
 */
export function usePosConfig(target) {
  /** @type {[PosConfigState, (s: PosConfigState) => void]} */
  const [result, setResult] = useState(/** @type {PosConfigState} */ ({ status: 'loading' }));

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // App Authentication: session token authorizes the call to our backend.
        const token = await shopify.session.getSessionToken();
        const res = await fetch('/api/pos/config', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error(`Config request failed (${res.status})`);
        }
        const data = await res.json();
        if (cancelled) return;

        const all = Array.isArray(data?.blocks) ? data.blocks : [];
        // Render only the blocks published to this POS surface.
        const blocks = all.filter((b) => !b?.target || b.target === target);
        setResult({ status: 'ready', blocks });
      } catch (err) {
        if (!cancelled) {
          setResult({ status: 'error', message: String(err) });
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [target]);

  return result;
}
