import type { CompileResult } from './types';
import type { RecipeSpec } from '@superapp/core';
import { compileStyleVars, compileStyleCss, compileCustomCss, normalizeStyle } from './style-compiler';

export function compileProxyWidget(spec: Extract<RecipeSpec, { type: 'proxy.widget' }>): CompileResult {
  const { widgetId } = spec.config;
  // Render surface (034 build #6). Lives in config_json (stored verbatim), so the proxy
  // route at /apps/superapp/<widgetId> reads it at request time to pick embed vs full_page;
  // surfaced in the AUDIT op for traceability. Absent = embed (back-compat).
  const surface = spec.config.surface ?? 'embed';
  const style = normalizeStyle(spec.style);
  const styleVars = compileStyleVars(style);
  const styleCss = compileStyleCss(style, '.superapp-widget');
  const customCss = compileCustomCss(style, '.superapp-widget');

  const inlineCss = [
    `.superapp-widget{ ${styleVars.split('\n').map((l) => l.trim()).join(' ')} }`,
    styleCss,
    customCss,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    ops: [
      { kind: 'AUDIT', action: 'compile.proxy.widget', details: JSON.stringify({ widgetId, surface }) },
    ],
    compiledJson: JSON.stringify({ metaobjectHandle: `superapp-proxy-${widgetId}` }),
    proxyWidgetPayload: {
      widgetId,
      name: spec.name,
      config: spec.config as Record<string, unknown>,
      styleCss: inlineCss,
    },
  };
}
