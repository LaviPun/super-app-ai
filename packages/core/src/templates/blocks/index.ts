/**
 * Barrel for the theme.section APP-BLOCK template library.
 *
 * Aggregates every unit file's canonical templates array into `BLOCK_TEMPLATES`.
 * These are OS-2.0 Theme App Extension app blocks / app embeds and app-proxy
 * widgets — `theme.section` recipes whose `config.activation` is a block/embed/
 * overlay mode placed ON an existing theme template (PDP/cart/collection/index/
 * page surfaces, header/footer groups, head + body app-embeds). Full-page native
 * sections (activation: 'section') live under `../sections`.
 */
import type { TemplateEntry } from '../types.js';

import { EMB_BODY_TEMPLATES } from './appembed-body-overlay.js';
import { APPEMBED_HEAD_INJECTION_TEMPLATES } from './appembed-head-injection.js';
import { templates as PROXYWIDGET_EMBEDDED_STOREFRONT_TEMPLATES } from './proxywidget-embedded-storefront.js';
import { templates as THEMEBLOCK_CART_SURFACE_TEMPLATES } from './themeblock-cart-surface.js';
import { CONVERSION_CORE_TEMPLATES } from './themeblock-conversion-core.js';
import { templates as THEMEBLOCK_COLLECTION_SURFACE_TEMPLATES } from './themeblock-collection-surface.js';
import { TBLK_PAGE_TEMPLATES } from './themeblock-content-page-fullsection.js';
import { TEMPLATES as THEMEBLOCK_HEADER_FOOTER_GROUP_TEMPLATES } from './themeblock-header-footer-group.js';
import { TBLK_IDX_TEMPLATES } from './themeblock-index-fullsection.js';
import { templates as THEMEBLOCK_PDP_SURFACE_TEMPLATES } from './themeblock-pdp-surface.js';
import { SIZE_CHART_TEMPLATES } from './themeblock-size-chart.js';
import { VB_BEHAVIOR_TEMPLATES } from './themeblock-vb-behavior.js';

export const BLOCK_TEMPLATES: TemplateEntry[] = [
  ...EMB_BODY_TEMPLATES,
  ...APPEMBED_HEAD_INJECTION_TEMPLATES,
  ...PROXYWIDGET_EMBEDDED_STOREFRONT_TEMPLATES,
  ...THEMEBLOCK_CART_SURFACE_TEMPLATES,
  ...CONVERSION_CORE_TEMPLATES,
  ...THEMEBLOCK_COLLECTION_SURFACE_TEMPLATES,
  ...TBLK_PAGE_TEMPLATES,
  ...THEMEBLOCK_HEADER_FOOTER_GROUP_TEMPLATES,
  ...TBLK_IDX_TEMPLATES,
  ...THEMEBLOCK_PDP_SURFACE_TEMPLATES,
  ...SIZE_CHART_TEMPLATES,
  ...VB_BEHAVIOR_TEMPLATES,
];
