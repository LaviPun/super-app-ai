import type { AdminApiContext } from '~/types/shopify';
import { getPrisma } from '~/db.server';

export type ThemeProfileResult = {
  themeId: string;
  detected: {
    cartDrawer: boolean;
    predictiveSearch: boolean;
    productForm: boolean;
    miniCart: boolean;
  };
  hints: {
    cartDrawerSelector?: string;
    addToCartFormSelector?: string;
    searchInputSelector?: string;
  };
  surfaces: Record<string, { mountStrategy: 'APP_BLOCK'|'THEME_PATCH'; notes?: string }>;
};

export class ThemeAnalyzerService {
  constructor(private readonly admin: AdminApiContext['admin']) {}

  async analyzeAndStore(shopId: string, themeId: string): Promise<ThemeProfileResult> {
    const assets = await this.fetchKeyAssets(themeId);
    const profile = this.analyzeAssets(themeId, assets);

    const prisma = getPrisma();
    await prisma.themeProfile.upsert({
      where: { shopId_themeId: { shopId, themeId } },
      create: { shopId, themeId, profileJson: JSON.stringify(profile) },
      update: { profileJson: JSON.stringify(profile) },
    });

    return profile;
  }

  private async fetchKeyAssets(themeId: string): Promise<Record<string, string>> {
    const keys = [
      'layout/theme.liquid',
      'sections/header.liquid',
      'sections/cart-drawer.liquid',
      'sections/main-product.liquid',
      'sections/predictive-search.liquid',
      'snippets/cart-drawer.liquid',
      'snippets/buy-buttons.liquid',
      'snippets/product-form.liquid',
      'assets/base.css',
    ];

    const out: Record<string, string> = {};
    for (const key of keys) {
      try {
        const res = await this.admin.rest.get({ path: `themes/${themeId}/assets.json`, query: { 'asset[key]': key } });
        // @ts-expect-error Shopify rest payload
        const value = res?.body?.asset?.value;
        if (typeof value === 'string') out[key] = value;
      } catch {
        // ignore missing keys
      }
    }
    return out;
  }

  private analyzeAssets(themeId: string, assets: Record<string, string>): ThemeProfileResult {
    const joined = Object.values(assets).join('\n');
    const cartDrawer = hasAny(joined, ['cart-drawer', 'CartDrawer', 'data-cart-drawer', 'cart__drawer']);
    const predictiveSearch = hasAny(joined, ['predictive-search', 'PredictiveSearch', 'data-predictive-search']);
    const productForm = hasAny(joined, ['product-form', 'ProductForm', 'product-form__submit', 'add-to-cart']);
    const miniCart = cartDrawer || hasAny(joined, ['mini-cart', 'minicart', 'cart-notification']);

    const hints: ThemeProfileResult['hints'] = {};
    if (cartDrawer) hints.cartDrawerSelector = '[data-cart-drawer], cart-drawer, .cart-drawer';
    if (productForm) hints.addToCartFormSelector = 'form[action*="/cart/add"], product-form form';
    if (predictiveSearch) hints.searchInputSelector = 'predictive-search input[type="search"], form[action*="/search"] input';

    const surfaces: ThemeProfileResult['surfaces'] = {
      product: { mountStrategy: 'APP_BLOCK', notes: 'Prefer app blocks near product form.' },
      collection: { mountStrategy: 'APP_BLOCK' },
      cart: { mountStrategy: cartDrawer ? 'APP_BLOCK' : 'THEME_PATCH', notes: cartDrawer ? 'Cart drawer detected.' : 'No cart drawer detected; patch carefully.' },
      header: { mountStrategy: 'APP_BLOCK', notes: 'Use theme app embed for header notifications.' },
      footer: { mountStrategy: 'APP_BLOCK' },
    };

    return { themeId, detected: { cartDrawer, predictiveSearch, productForm, miniCart }, hints, surfaces };
  }
}

function hasAny(haystack: string, needles: string[]) {
  const h = haystack.toLowerCase();
  return needles.some(n => h.includes(n.toLowerCase()));
}
