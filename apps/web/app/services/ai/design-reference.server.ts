import { SettingsService } from '~/services/settings/settings.service';

export interface DesignReferencePack {
  sourceUrl: string;
  sourceType: 'store' | 'fallback';
  brandTone: string;
  primaryColors: string[];
  neutralPalette: string[];
  typographyHints: string[];
  componentStyleHints: string[];
  uxPrinciples: string[];
}

const FALLBACK_DESIGN_REFERENCE_URL = 'https://bummer.in';

function toSafeUrl(input: string | null | undefined): string | null {
  if (!input?.trim()) return null;
  try {
    const u = new URL(input.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function deriveDesignReferencePack(referenceUrl?: string | null): DesignReferencePack {
  const normalized = toSafeUrl(referenceUrl) ?? FALLBACK_DESIGN_REFERENCE_URL;
  const host = new URL(normalized).hostname.toLowerCase();
  const fallback = host === 'bummer.in' || host.endsWith('.bummer.in');

  if (fallback) {
    return {
      sourceUrl: normalized,
      sourceType: 'fallback',
      brandTone: 'premium-minimal, editorial, high-contrast with restrained accents',
      primaryColors: ['#111827', '#F97316', '#F8FAFC'],
      neutralPalette: ['#0F172A', '#1F2937', '#64748B', '#E2E8F0', '#FFFFFF'],
      typographyHints: [
        'Use modern geometric sans aesthetic with strong heading weight and clean body text.',
        'Favor larger heading scale with compact line-height and high readability.',
      ],
      componentStyleHints: [
        'Rounded-medium corners, subtle soft shadows, crisp border contrast.',
        'Primary CTA must be visually dominant; secondary action should be low-emphasis text/button.',
      ],
      uxPrinciples: [
        'Premium hierarchy: one clear focal message and one primary CTA.',
        'Reduce clutter and avoid noisy ornamentation.',
        'Motion should be subtle and purposeful; respect reduced-motion defaults.',
      ],
    };
  }

  return {
    sourceUrl: normalized,
    sourceType: 'store',
    brandTone: 'brand-aligned premium ecommerce with polished, conversion-focused UI',
    primaryColors: ['Use source brand primary/accent colors from reference URL'],
    neutralPalette: ['Use source neutral palette for backgrounds, text, and borders'],
    typographyHints: [
      'Match source brand typography mood (heading emphasis + readable body).',
      'Preserve consistent size rhythm between title, supporting copy, and CTA.',
    ],
    componentStyleHints: [
      'Mirror source CTA styling pattern (shape, color contrast, hover emphasis).',
      'Keep spacing rhythm and radius scale consistent with source brand feel.',
    ],
    uxPrinciples: [
      'Deliver a premium first-impression with clear hierarchy and conversion intent.',
      'Preserve accessibility and legibility while matching brand style direction.',
    ],
  };
}

export function buildDesignReferencePromptBlock(pack: DesignReferencePack): string {
  let promptSource = pack.sourceUrl;
  try {
    const parsed = new URL(pack.sourceUrl);
    promptSource = parsed.origin;
  } catch {
    promptSource = pack.sourceUrl;
  }
  if (promptSource.length > 120) {
    promptSource = `${promptSource.slice(0, 117)}...`;
  }
  return [
    `DesignReferenceV1 (source: ${pack.sourceType}, url: ${promptSource})`,
    `BrandTone: ${pack.brandTone}`,
    `PrimaryColors: ${pack.primaryColors.join(', ')}`,
    `NeutralPalette: ${pack.neutralPalette.join(', ')}`,
    `TypographyHints: ${pack.typographyHints.join(' | ')}`,
    `ComponentStyleHints: ${pack.componentStyleHints.join(' | ')}`,
    `UXPrinciples: ${pack.uxPrinciples.join(' | ')}`,
  ].join('\n');
}

export async function resolveDesignReferencePack(): Promise<DesignReferencePack> {
  const settings = await new SettingsService().get();
  return deriveDesignReferencePack(settings.designReferenceUrl);
}

