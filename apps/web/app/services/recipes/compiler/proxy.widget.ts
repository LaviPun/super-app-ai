import type { CompileResult } from './types';
import type { RecipeSpec } from '@superapp/core';
import { compileStyleVars, compileStyleCss, compileCustomCss, normalizeStyle } from './style-compiler';

export function compileProxyWidget(spec: Extract<RecipeSpec, { type: 'proxy.widget' }>): CompileResult {
  const namespace = 'superapp.proxy';
  const key = spec.config.widgetId;
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
      {
        kind: 'SHOP_METAFIELD_SET',
        namespace,
        key,
        type: 'json',
        value: JSON.stringify({ ...spec.config, _styleCss: inlineCss }),
      },
      { kind: 'AUDIT', action: 'compile.proxy.widget', details: JSON.stringify({ namespace, key }) },
    ],
    compiledJson: JSON.stringify({ namespace, key }),
  };
}
