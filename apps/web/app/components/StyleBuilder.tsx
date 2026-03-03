import { useState, useCallback } from 'react';
import { useFetcher } from '@remix-run/react';
import {
  Card,
  BlockStack,
  Text,
  InlineStack,
  Button,
  TextField,
  Select,
  Checkbox,
  Tabs,
  Banner,
  Box,
  Divider,
} from '@shopify/polaris';
import type { StorefrontStyle } from '@superapp/core';
import { normalizeStyle } from '~/services/recipes/compiler/style-compiler';
import type { RecipeSpec } from '@superapp/core';

// ----------------------------------------------------------------------------
// Types & Guards
// ----------------------------------------------------------------------------

const STOREFRONT_UI_WITH_STYLE = [
  'theme.banner',
  'theme.popup',
  'theme.notificationBar',
  'proxy.widget',
] as const;

type StyleableType = (typeof STOREFRONT_UI_WITH_STYLE)[number];
type SpecWithStyle = RecipeSpec & { type: StyleableType; style?: StorefrontStyle };

function isSpecWithStyle(spec: RecipeSpec): spec is SpecWithStyle {
  return STOREFRONT_UI_WITH_STYLE.includes(spec.type as StyleableType);
}

// ----------------------------------------------------------------------------
// Per-type style configuration
// ----------------------------------------------------------------------------

type TextRole = { key: string; label: string };

type TypeStyleConfig = {
  showButtonColors: boolean;
  showBackdrop: boolean;
  textRoles: TextRole[];
  showLayoutMode: boolean;
  forceOverlay: boolean;
  showAnchor: boolean;
  showOffset: boolean;
  showWidth: boolean;
  showZIndex: boolean;
  showGap: boolean;
  showMargin: boolean;
  showBorderShadow: boolean;
  showLineHeight: boolean;
  showAccessibility: boolean;
  showResponsive: boolean;
};

const STYLE_CONFIG: Record<StyleableType, TypeStyleConfig> = {
  'theme.banner': {
    showButtonColors: true,
    showBackdrop: false,
    textRoles: [
      { key: 'heading', label: 'Heading' },
      { key: 'subheading', label: 'Subheading' },
      { key: 'button', label: 'Button' },
    ],
    showLayoutMode: false,
    forceOverlay: false,
    showAnchor: false,
    showOffset: false,
    showWidth: true,
    showZIndex: false,
    showGap: true,
    showMargin: true,
    showBorderShadow: true,
    showLineHeight: true,
    showAccessibility: true,
    showResponsive: true,
  },
  'theme.popup': {
    showButtonColors: true,
    showBackdrop: true,
    textRoles: [
      { key: 'title', label: 'Title' },
      { key: 'body', label: 'Body text' },
      { key: 'button', label: 'Button' },
    ],
    showLayoutMode: true,
    forceOverlay: true,
    showAnchor: true,
    showOffset: true,
    showWidth: true,
    showZIndex: true,
    showGap: true,
    showMargin: false,
    showBorderShadow: true,
    showLineHeight: true,
    showAccessibility: true,
    showResponsive: true,
  },
  'theme.notificationBar': {
    showButtonColors: false,
    showBackdrop: false,
    textRoles: [
      { key: 'message', label: 'Message text' },
      { key: 'link', label: 'Link text' },
    ],
    showLayoutMode: false,
    forceOverlay: false,
    showAnchor: false,
    showOffset: false,
    showWidth: true,
    showZIndex: true,
    showGap: false,
    showMargin: false,
    showBorderShadow: true,
    showLineHeight: false,
    showAccessibility: true,
    showResponsive: true,
  },
  'proxy.widget': {
    showButtonColors: true,
    showBackdrop: false,
    textRoles: [
      { key: 'title', label: 'Title' },
      { key: 'message', label: 'Message' },
    ],
    showLayoutMode: true,
    forceOverlay: false,
    showAnchor: true,
    showOffset: true,
    showWidth: true,
    showZIndex: true,
    showGap: true,
    showMargin: true,
    showBorderShadow: true,
    showLineHeight: true,
    showAccessibility: true,
    showResponsive: true,
  },
};

function getStyleConfig(specType: StyleableType): TypeStyleConfig {
  return STYLE_CONFIG[specType];
}

// ----------------------------------------------------------------------------
// Option sets
// ----------------------------------------------------------------------------

const PADDING_OPTIONS = [
  { label: 'None', value: 'none' },
  { label: 'Tight (8px)', value: 'tight' },
  { label: 'Medium (16px)', value: 'medium' },
  { label: 'Loose (24px)', value: 'loose' },
];
const GAP_OPTIONS = PADDING_OPTIONS;
const MARGIN_OPTIONS = PADDING_OPTIONS;

const RADIUS_OPTIONS = [
  { label: 'None', value: 'none' },
  { label: 'Small (4px)', value: 'sm' },
  { label: 'Medium (8px)', value: 'md' },
  { label: 'Large (12px)', value: 'lg' },
  { label: 'XL (16px)', value: 'xl' },
  { label: 'Full / Pill', value: 'full' },
];

const SHADOW_OPTIONS = [
  { label: 'None', value: 'none' },
  { label: 'Small', value: 'sm' },
  { label: 'Medium', value: 'md' },
  { label: 'Large', value: 'lg' },
];

const BORDER_WIDTH_OPTIONS = [
  { label: 'None', value: 'none' },
  { label: 'Thin (1px)', value: 'thin' },
  { label: 'Medium (2px)', value: 'medium' },
  { label: 'Thick (4px)', value: 'thick' },
];

const FONT_SIZE_OPTIONS = [
  { label: 'XS (12px)', value: 'XS' },
  { label: 'SM (14px)', value: 'SM' },
  { label: 'MD (16px)', value: 'MD' },
  { label: 'LG (18px)', value: 'LG' },
  { label: 'XL (20px)', value: 'XL' },
  { label: '2XL (24px)', value: '2XL' },
];

const FONT_WEIGHT_OPTIONS = [
  { label: 'Normal', value: 'normal' },
  { label: 'Medium', value: 'medium' },
  { label: 'Bold', value: 'bold' },
];

const ALIGN_OPTIONS = [
  { label: 'Left', value: 'left' },
  { label: 'Center', value: 'center' },
  { label: 'Right', value: 'right' },
];

const LINE_HEIGHT_OPTIONS = [
  { label: 'Tight (1.25)', value: 'tight' },
  { label: 'Normal (1.5)', value: 'normal' },
  { label: 'Relaxed (1.75)', value: 'relaxed' },
];

const LAYOUT_MODE_OPTIONS = [
  { label: 'Inline (block flow)', value: 'inline' },
  { label: 'Overlay (fixed over page)', value: 'overlay' },
  { label: 'Sticky (fixed to viewport edge)', value: 'sticky' },
  { label: 'Floating (absolute)', value: 'floating' },
];

const ANCHOR_OPTIONS = [
  { label: 'Top', value: 'top' },
  { label: 'Bottom', value: 'bottom' },
  { label: 'Left', value: 'left' },
  { label: 'Right', value: 'right' },
  { label: 'Center', value: 'center' },
];

const WIDTH_OPTIONS = [
  { label: 'Auto', value: 'auto' },
  { label: 'Narrow (480px max)', value: 'narrow' },
  { label: 'Container (1200px max)', value: 'container' },
  { label: 'Wide (720px max)', value: 'wide' },
  { label: 'Full width', value: 'full' },
];

const Z_INDEX_OPTIONS = [
  { label: 'Base (10)', value: 'base' },
  { label: 'Dropdown (100)', value: 'dropdown' },
  { label: 'Sticky (30)', value: 'sticky' },
  { label: 'Overlay (1000)', value: 'overlay' },
  { label: 'Modal (1100)', value: 'modal' },
];

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function deepMerge<T extends object>(a: T, b: Partial<T>): T {
  const out = { ...a };
  for (const k of Object.keys(b) as (keyof T)[]) {
    const vb = b[k];
    if (
      vb !== undefined &&
      typeof vb === 'object' &&
      vb !== null &&
      !Array.isArray(vb) &&
      typeof (a as Record<string, unknown>)[k as string] === 'object'
    ) {
      (out as Record<string, unknown>)[k as string] = deepMerge(
        (a as Record<string, unknown>)[k as string] as T[keyof T],
        vb as Partial<T[keyof T]>,
      );
    } else if (vb !== undefined) {
      (out as Record<string, unknown>)[k as string] = vb;
    }
  }
  return out;
}

function HexField({
  label,
  value,
  onChange,
  helpText,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  helpText?: string;
}) {
  const isValid = !value || /^#[0-9A-Fa-f]{6}$/.test(value);
  return (
    <InlineStack gap="100" blockAlign="end" wrap={false}>
      <div
        style={{
          width: 20,
          height: 20,
          borderRadius: 4,
          border: '1px solid #e5e5e5',
          backgroundColor: isValid && value ? value : 'transparent',
          flexShrink: 0,
          alignSelf: 'flex-end',
          marginBottom: 6,
        }}
      />
      <TextField
        label={label}
        value={value}
        onChange={(v) => onChange(v)}
        autoComplete="off"
        error={!isValid ? 'Must be a 6-digit hex, e.g. #ff0000' : undefined}
        helpText={helpText}
        placeholder="#111111"
      />
    </InlineStack>
  );
}

// ----------------------------------------------------------------------------
// Sub-sections
// ----------------------------------------------------------------------------

function BasicTab({
  style,
  specType,
  update,
}: {
  style: StorefrontStyle;
  specType: StyleableType;
  update: (p: Partial<StorefrontStyle>) => void;
}) {
  const cfg = getStyleConfig(specType);
  const showBackdrop = cfg.showBackdrop ||
    style.layout.mode === 'overlay' ||
    style.layout.mode === 'sticky';

  return (
    <BlockStack gap="400">
      {/* Colors */}
      <BlockStack gap="200">
        <Text as="p" variant="headingSm">Colors</Text>
        <InlineStack gap="300" wrap>
          <HexField
            label="Text color"
            value={style.colors.text}
            onChange={(v) => update({ colors: { ...style.colors, text: v || '#111111' } })}
          />
          <HexField
            label="Background"
            value={style.colors.background}
            onChange={(v) => update({ colors: { ...style.colors, background: v || '#ffffff' } })}
          />
          {cfg.showButtonColors && (
            <>
              <HexField
                label="Button bg"
                value={style.colors.buttonBg ?? ''}
                onChange={(v) => update({ colors: { ...style.colors, buttonBg: v || undefined } })}
                helpText="Optional"
              />
              <HexField
                label="Button text"
                value={style.colors.buttonText ?? ''}
                onChange={(v) => update({ colors: { ...style.colors, buttonText: v || undefined } })}
                helpText="Optional"
              />
            </>
          )}
        </InlineStack>
        {showBackdrop && (
          <BlockStack gap="200">
            <Text as="p" variant="bodySm" tone="subdued">Overlay / backdrop</Text>
            <InlineStack gap="300" wrap>
              <HexField
                label="Backdrop color"
                value={style.colors.overlayBackdrop ?? ''}
                onChange={(v) => update({ colors: { ...style.colors, overlayBackdrop: v || undefined } })}
                helpText="Optional"
              />
              <TextField
                label="Backdrop opacity (0-1)"
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={String(style.colors.overlayBackdropOpacity ?? 0.45)}
                onChange={(v) =>
                  update({
                    colors: {
                      ...style.colors,
                      overlayBackdropOpacity: Math.min(1, Math.max(0, parseFloat(v) || 0.45)),
                    },
                  })
                }
                autoComplete="off"
              />
            </InlineStack>
          </BlockStack>
        )}
      </BlockStack>

      <Divider />

      {/* Typography with text role labels */}
      <BlockStack gap="200">
        <Text as="p" variant="headingSm">Typography</Text>
        {cfg.textRoles.length > 0 && (
          <Text as="p" variant="bodySm" tone="subdued">
            Applies to: {cfg.textRoles.map(r => r.label).join(', ')}
          </Text>
        )}
        <InlineStack gap="300" wrap>
          <Select
            label="Font size"
            options={FONT_SIZE_OPTIONS}
            value={style.typography.size}
            onChange={(v) =>
              update({ typography: { ...style.typography, size: v as StorefrontStyle['typography']['size'] } })
            }
          />
          <Select
            label="Font weight"
            options={FONT_WEIGHT_OPTIONS}
            value={style.typography.weight}
            onChange={(v) =>
              update({ typography: { ...style.typography, weight: v as StorefrontStyle['typography']['weight'] } })
            }
          />
          <Select
            label="Text align"
            options={ALIGN_OPTIONS}
            value={style.typography.align}
            onChange={(v) =>
              update({ typography: { ...style.typography, align: v as StorefrontStyle['typography']['align'] } })
            }
          />
        </InlineStack>
      </BlockStack>

      <Divider />

      {/* Spacing & Shape */}
      <BlockStack gap="200">
        <Text as="p" variant="headingSm">Spacing &amp; Shape</Text>
        <InlineStack gap="300" wrap>
          <Select
            label="Padding"
            options={PADDING_OPTIONS}
            value={style.spacing.padding}
            onChange={(v) =>
              update({ spacing: { ...style.spacing, padding: v as StorefrontStyle['spacing']['padding'] } })
            }
          />
          <Select
            label="Border radius"
            options={RADIUS_OPTIONS}
            value={style.shape.radius}
            onChange={(v) =>
              update({ shape: { ...style.shape, radius: v as StorefrontStyle['shape']['radius'] } })
            }
          />
        </InlineStack>
      </BlockStack>

      {/* Responsive */}
      {cfg.showResponsive && (
        <>
          <Divider />
          <BlockStack gap="200">
            <Text as="p" variant="headingSm">Responsive visibility</Text>
            <InlineStack gap="400">
              <Checkbox
                label="Hide on mobile (&lt; 750px)"
                checked={style.responsive.hideOnMobile}
                onChange={(v) => update({ responsive: { ...style.responsive, hideOnMobile: v } })}
              />
              <Checkbox
                label="Hide on desktop (750px+)"
                checked={style.responsive.hideOnDesktop}
                onChange={(v) => update({ responsive: { ...style.responsive, hideOnDesktop: v } })}
              />
            </InlineStack>
          </BlockStack>
        </>
      )}
    </BlockStack>
  );
}

function AdvancedTab({
  style,
  specType,
  update,
}: {
  style: StorefrontStyle;
  specType: StyleableType;
  update: (p: Partial<StorefrontStyle>) => void;
}) {
  const cfg = getStyleConfig(specType);
  const isOverlay = cfg.forceOverlay ||
    style.layout.mode === 'overlay' ||
    style.layout.mode === 'sticky' ||
    style.layout.mode === 'floating';

  return (
    <BlockStack gap="400">
      {/* Layout & Positioning */}
      <BlockStack gap="200">
        <Text as="p" variant="headingSm">Layout &amp; Positioning</Text>
        <InlineStack gap="300" wrap>
          {cfg.showLayoutMode && (
            <Select
              label="Layout mode"
              options={LAYOUT_MODE_OPTIONS}
              value={style.layout.mode}
              onChange={(v) =>
                update({ layout: { ...style.layout, mode: v as StorefrontStyle['layout']['mode'] } })
              }
              helpText="Inline modules use Theme Editor placement"
            />
          )}
          {cfg.showAnchor && isOverlay && (
            <Select
              label="Anchor position"
              options={ANCHOR_OPTIONS}
              value={style.layout.anchor}
              onChange={(v) =>
                update({ layout: { ...style.layout, anchor: v as StorefrontStyle['layout']['anchor'] } })
              }
            />
          )}
          {cfg.showWidth && (
            <Select
              label="Width"
              options={WIDTH_OPTIONS}
              value={style.layout.width}
              onChange={(v) =>
                update({ layout: { ...style.layout, width: v as StorefrontStyle['layout']['width'] } })
              }
            />
          )}
          {cfg.showZIndex && (
            <Select
              label="Z-index level"
              options={Z_INDEX_OPTIONS}
              value={style.layout.zIndex}
              onChange={(v) =>
                update({ layout: { ...style.layout, zIndex: v as StorefrontStyle['layout']['zIndex'] } })
              }
            />
          )}
        </InlineStack>
        {cfg.showOffset && isOverlay && (
          <InlineStack gap="300" wrap>
            <TextField
              label="Offset X (px, -100 to 100)"
              type="number"
              min={-100}
              max={100}
              value={String(style.layout.offsetX)}
              onChange={(v) =>
                update({
                  layout: {
                    ...style.layout,
                    offsetX: Math.min(100, Math.max(-100, parseInt(v) || 0)),
                  },
                })
              }
              autoComplete="off"
            />
            <TextField
              label="Offset Y (px, -100 to 100)"
              type="number"
              min={-100}
              max={100}
              value={String(style.layout.offsetY)}
              onChange={(v) =>
                update({
                  layout: {
                    ...style.layout,
                    offsetY: Math.min(100, Math.max(-100, parseInt(v) || 0)),
                  },
                })
              }
              autoComplete="off"
            />
          </InlineStack>
        )}
      </BlockStack>

      {/* Advanced spacing */}
      {(cfg.showGap || cfg.showMargin) && (
        <>
          <Divider />
          <BlockStack gap="200">
            <Text as="p" variant="headingSm">Advanced Spacing</Text>
            <InlineStack gap="300" wrap>
              {cfg.showGap && (
                <Select
                  label="Gap (between children)"
                  options={GAP_OPTIONS}
                  value={style.spacing.gap}
                  onChange={(v) =>
                    update({ spacing: { ...style.spacing, gap: v as StorefrontStyle['spacing']['gap'] } })
                  }
                />
              )}
              {cfg.showMargin && (
                <Select
                  label="Margin (outer, inline only)"
                  options={MARGIN_OPTIONS}
                  value={style.spacing.margin}
                  onChange={(v) =>
                    update({ spacing: { ...style.spacing, margin: v as StorefrontStyle['spacing']['margin'] } })
                  }
                />
              )}
            </InlineStack>
          </BlockStack>
        </>
      )}

      {/* Border & Shadow */}
      {cfg.showBorderShadow && (
        <>
          <Divider />
          <BlockStack gap="200">
            <Text as="p" variant="headingSm">Border &amp; Shadow</Text>
            <InlineStack gap="300" wrap>
              <Select
                label="Shadow"
                options={SHADOW_OPTIONS}
                value={style.shape.shadow}
                onChange={(v) =>
                  update({ shape: { ...style.shape, shadow: v as StorefrontStyle['shape']['shadow'] } })
                }
              />
              <Select
                label="Border width"
                options={BORDER_WIDTH_OPTIONS}
                value={style.shape.borderWidth}
                onChange={(v) =>
                  update({
                    shape: { ...style.shape, borderWidth: v as StorefrontStyle['shape']['borderWidth'] },
                  })
                }
              />
              <HexField
                label="Border color"
                value={style.colors.border ?? ''}
                onChange={(v) => update({ colors: { ...style.colors, border: v || undefined } })}
                helpText="Optional; falls back to text color"
              />
            </InlineStack>
          </BlockStack>
        </>
      )}

      {/* Advanced Typography */}
      {cfg.showLineHeight && (
        <>
          <Divider />
          <BlockStack gap="200">
            <Text as="p" variant="headingSm">Advanced Typography</Text>
            <Select
              label="Line height"
              options={LINE_HEIGHT_OPTIONS}
              value={style.typography.lineHeight}
              onChange={(v) =>
                update({
                  typography: {
                    ...style.typography,
                    lineHeight: v as StorefrontStyle['typography']['lineHeight'],
                  },
                })
              }
            />
          </BlockStack>
        </>
      )}

      {/* Accessibility */}
      {cfg.showAccessibility && (
        <>
          <Divider />
          <BlockStack gap="200">
            <Text as="p" variant="headingSm">Accessibility</Text>
            <InlineStack gap="400">
              <Checkbox
                label="Focus-visible ring on buttons"
                checked={style.accessibility.focusVisible}
                onChange={(v) =>
                  update({ accessibility: { ...style.accessibility, focusVisible: v } })
                }
              />
              <Checkbox
                label="Respect prefers-reduced-motion"
                checked={style.accessibility.reducedMotion}
                onChange={(v) =>
                  update({ accessibility: { ...style.accessibility, reducedMotion: v } })
                }
              />
            </InlineStack>
          </BlockStack>
        </>
      )}
    </BlockStack>
  );
}

function CustomCssTab({
  style,
  update,
}: {
  style: StorefrontStyle;
  update: (p: Partial<StorefrontStyle>) => void;
}) {
  const value = style.customCss ?? '';
  const remaining = 2000 - value.length;
  const isOverLimit = remaining < 0;

  return (
    <BlockStack gap="400">
      <Banner tone="warning">
        <BlockStack gap="100">
          <Text as="p" variant="bodyMd" fontWeight="semibold">Custom CSS is sanitized and scoped</Text>
          <Text as="p" variant="bodySm">
            Rules are automatically prefixed with the module&apos;s root selector (e.g.{' '}
            <code>.superapp-banner</code>). Dangerous patterns (<code>url()</code>,{' '}
            <code>@import</code>, <code>expression()</code>, <code>javascript:</code>) are stripped.
            Use <code>var(--sa-*)</code> variables for dynamic values.
          </Text>
        </BlockStack>
      </Banner>

      <TextField
        label="Custom CSS"
        value={value}
        onChange={(v) => update({ customCss: v.slice(0, 2000) || undefined })}
        multiline={10}
        autoComplete="off"
        error={isOverLimit ? `Over limit by ${-remaining} characters` : undefined}
        helpText={`${remaining} characters remaining. Example: .superapp-banner__heading { letter-spacing: 0.05em; }`}
        monospaced
      />

      {value && (
        <Box background="bg-surface-secondary" borderRadius="200" padding="300">
          <BlockStack gap="100">
            <Text as="p" variant="headingSm">Available CSS variables (--sa-*)</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              {[
                '--sa-text', '--sa-bg', '--sa-pad', '--sa-gap', '--sa-margin',
                '--sa-fs', '--sa-fw', '--sa-lh', '--sa-radius', '--sa-shadow',
                '--sa-border-width', '--sa-z', '--sa-width',
                '--sa-btn-bg', '--sa-btn-text', '--sa-border', '--sa-backdrop',
              ].join(' · ')}
            </Text>
          </BlockStack>
        </Box>
      )}
    </BlockStack>
  );
}

// ----------------------------------------------------------------------------
// Main component
// ----------------------------------------------------------------------------

const TABS = [
  { id: 'basic', content: 'Basic' },
  { id: 'advanced', content: 'Advanced' },
  { id: 'custom-css', content: 'Custom CSS' },
];

export function StyleBuilder({
  spec,
  moduleId,
}: {
  spec: RecipeSpec;
  moduleId: string;
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string; version?: number }>();
  const [style, setStyle] = useState<StorefrontStyle>(() =>
    normalizeStyle(isSpecWithStyle(spec) ? spec.style : undefined),
  );
  const [activeTab, setActiveTab] = useState(0);

  const update = useCallback((patch: Partial<StorefrontStyle>) => {
    setStyle((prev) => deepMerge(prev, patch));
  }, []);

  const handleSave = useCallback(() => {
    const nextSpec = { ...spec, style };
    const formData = new FormData();
    formData.set('spec', JSON.stringify(nextSpec));
    fetcher.submit(formData, {
      method: 'post',
      action: `/api/modules/${moduleId}/spec`,
    });
  }, [spec, style, moduleId, fetcher]);

  if (!isSpecWithStyle(spec)) return null;

  const busy = fetcher.state !== 'idle';
  const specType = spec.type;

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <Text as="h2" variant="headingMd">Style Builder</Text>
          <Text as="p" tone="subdued" variant="bodySm">
            Changes create a new draft version
          </Text>
        </InlineStack>

        <Tabs tabs={TABS} selected={activeTab} onSelect={setActiveTab} fitted>
          <Box paddingBlockStart="400">
            {activeTab === 0 && (
              <BasicTab style={style} specType={specType} update={update} />
            )}
            {activeTab === 1 && (
              <AdvancedTab style={style} specType={specType} update={update} />
            )}
            {activeTab === 2 && (
              <CustomCssTab style={style} update={update} />
            )}
          </Box>
        </Tabs>

        <InlineStack gap="200" blockAlign="center">
          <Button onClick={handleSave} loading={busy} variant="primary">
            Save style (new draft)
          </Button>
          {fetcher.data?.ok && (
            <Text as="span" tone="success">
              Saved as v{fetcher.data.version}
            </Text>
          )}
          {fetcher.data?.error && (
            <Text as="span" tone="critical">{fetcher.data.error}</Text>
          )}
        </InlineStack>
      </BlockStack>
    </Card>
  );
}
