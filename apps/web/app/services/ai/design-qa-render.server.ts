/**
 * Render-time deterministic QA (035 vocab-hardening — dossier §G1 render checks).
 *
 * The spec-level gate (`design-qa.server.ts`) audits the RecipeSpec object. This
 * module closes the gap the spec-level gate can't see: it deterministically
 * RENDERS the candidate through `PreviewService` (the same renderer the admin
 * preview + storefront parity path uses) and parses the resulting HTML with a
 * real DOM (`linkedom`), so checks that only exist in the rendered output —
 * broken CTA links, missing `alt`, heading-order breaks, placeholder leakage,
 * empty visible slots — become observable.
 *
 * Rollout posture: TELEMETRY-FIRST. Every issue is severity `'warn'` — none
 * block generation. The intent is to trend these signals via the design-QA log
 * + tournament penalty before any of them is promoted to a blocking `'fail'`.
 *
 * Scope: storefront visual surfaces only (`theme.section` / `proxy.widget`) —
 * the only types `PreviewService` renders to buyer-facing HTML we can audit.
 * Any other type returns `[]`.
 *
 * Failure-safety: the whole body is wrapped so a render/parse throw returns `[]`
 * — this gate must NEVER break generation. Typical cost is a single synchronous
 * `PreviewService.render` + one `parseHTML`, well under 100ms.
 */
import type { RecipeSpec } from '@superapp/core';
import { parseHTML } from 'linkedom';
import { PreviewService, type PreviewContext } from '~/services/preview/preview.service';
import { KIND_ARCHETYPE, type SectionArchetype } from '~/services/recipes/kind-archetype';
import type { QaIssue } from '~/services/ai/design-qa.server';

/** Types this gate can render to auditable buyer-facing HTML. */
const RENDERABLE_TYPES = new Set<string>(['theme.section', 'proxy.widget']);

/**
 * Per-archetype max heading length (chars). A hero headline that runs past this
 * reads as body copy jammed into a display slot, not a headline. Only archetypes
 * with a meaningful ceiling are listed; others have no length check.
 */
const MAX_HEADING_LEN: Partial<Record<SectionArchetype, number>> = {
  hero: 120,
  cta: 120,
  band: 90,
};

function archetypeOf(recipe: RecipeSpec): SectionArchetype | undefined {
  const kind = (recipe as { config?: { kind?: unknown } }).config?.kind;
  return typeof kind === 'string' ? KIND_ARCHETYPE[kind] : undefined;
}

/** Visible text of an element, collapsed — empty string when only whitespace. */
function text(el: { textContent?: string | null } | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Render `recipe` through PreviewService and audit the resulting DOM.
 *
 * @param recipe   the candidate spec (post spec-level auto-fix)
 * @param context  optional PreviewContext forwarded to the renderer (surface,
 *                 theme fonts) — parity with how the admin preview renders it
 * @returns        `QaIssue[]`, all severity `'warn'`; `[]` for non-renderable
 *                 types and on ANY render/parse failure (never throws)
 */
export function runRenderQa(recipe: RecipeSpec, context?: PreviewContext): QaIssue[] {
  try {
    if (!RENDERABLE_TYPES.has(recipe.type)) return [];

    const rendered = new PreviewService().render(recipe, context);
    if (rendered.kind !== 'HTML' || typeof rendered.html !== 'string' || rendered.html.length === 0) {
      return [];
    }
    const html = rendered.html;
    const { document } = parseHTML(html);
    const issues: QaIssue[] = [];
    const arch = archetypeOf(recipe);

    // (1) CTA anchors with empty / '#' / missing href. Only flag anchors that
    //     carry visible text (a labelled link the buyer can click) — decorative
    //     empty anchors are a different concern.
    const anchors = Array.from(document.querySelectorAll('a')) as Array<{
      getAttribute(name: string): string | null;
      textContent?: string | null;
    }>;
    const brokenCtas = anchors.filter((a) => {
      if (text(a).length === 0) return false;
      const href = (a.getAttribute('href') ?? '').trim();
      return href === '' || href === '#';
    });
    if (brokenCtas.length > 0) {
      issues.push({
        id: 'render:cta-href',
        severity: 'warn',
        message: `${brokenCtas.length} call-to-action link(s) render with an empty or "#" href (e.g. "${text(brokenCtas[0]).slice(0, 40)}") — give every CTA a real destination URL.`,
        autofixed: false,
      });
    }

    // (2) <img> without a non-empty alt attribute.
    const imgs = Array.from(document.querySelectorAll('img')) as Array<{ getAttribute(name: string): string | null }>;
    const missingAlt = imgs.filter((img) => {
      const alt = img.getAttribute('alt');
      // A present-but-empty alt is a valid "decorative image" signal; only a
      // MISSING alt attribute is the accessibility gap we flag.
      return alt === null;
    });
    if (missingAlt.length > 0) {
      issues.push({
        id: 'render:img-alt',
        severity: 'warn',
        message: `${missingAlt.length} image(s) render without an alt attribute — add descriptive alt text (or alt="" if purely decorative).`,
        autofixed: false,
      });
    }

    // (3) Heading order: at most one <h1>; no level jump > 1 in document order.
    const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')) as Array<{
      tagName: string;
      textContent?: string | null;
    }>;
    const levels = headings.map((h) => Number(h.tagName.slice(1)));
    const h1Count = levels.filter((l) => l === 1).length;
    if (h1Count > 1) {
      issues.push({
        id: 'render:multiple-h1',
        severity: 'warn',
        message: `Rendered output has ${h1Count} <h1> headings — a section should contribute at most one top-level heading.`,
        autofixed: false,
      });
    }
    for (let i = 1; i < levels.length; i++) {
      const prev = levels[i - 1] ?? 0;
      const cur = levels[i] ?? 0;
      if (cur - prev > 1) {
        issues.push({
          id: 'render:heading-order',
          severity: 'warn',
          message: `Heading level jumps from h${prev} to h${cur} — don't skip levels (screen-reader outline breaks).`,
          autofixed: false,
        });
        break;
      }
    }

    // (4) Placeholder leakage. Moustaches are checked against the raw HTML (an
    //     unrendered Liquid/handlebars token can hide in an attribute); the prose
    //     tokens are checked against visible body text so CSS class names in the
    //     inlined stylesheet can't trip them.
    // Match an OPENING "{{" only — a leaked Liquid/handlebars binding always has
    // one, and (unlike a bare "}}") it never appears in the inlined pack CSS,
    // where adjacent rule/@media closers routinely produce "}}".
    if (/\{\{/.test(html)) {
      issues.push({
        id: 'render:moustache-leak',
        severity: 'warn',
        message: 'Rendered HTML contains an unrendered "{{ }}" template token — a binding leaked into the output instead of resolving to content.',
        autofixed: false,
      });
    }
    const bodyText = text(document.body) || text(document.documentElement);
    if (/lorem ipsum/i.test(bodyText)) {
      issues.push({
        id: 'render:lorem',
        severity: 'warn',
        message: 'Rendered copy contains "lorem ipsum" placeholder text — replace with real content.',
        autofixed: false,
      });
    }
    if (/\bPLACEHOLDER\b/.test(bodyText) || /\bTODO\b/.test(bodyText)) {
      issues.push({
        id: 'render:placeholder-word',
        severity: 'warn',
        message: 'Rendered copy contains a "PLACEHOLDER"/"TODO" marker — replace with finished content.',
        autofixed: false,
      });
    }

    // (5) Empty text in key slots: headings and buttons/CTAs with no visible text.
    const emptyHeadings = headings.filter((h) => text(h).length === 0).length;
    if (emptyHeadings > 0) {
      issues.push({
        id: 'render:empty-heading',
        severity: 'warn',
        message: `${emptyHeadings} heading element(s) render with no text — an empty heading is invisible but still breaks the document outline.`,
        autofixed: false,
      });
    }
    const buttons = Array.from(document.querySelectorAll('button,[role="button"]')) as Array<{
      textContent?: string | null;
    }>;
    const emptyButtons = buttons.filter((b) => text(b).length === 0).length;
    // An anchor with a bad href AND text is (1); an anchor/button with NO text is
    // an empty action slot — flag those.
    const emptyActionAnchors = anchors.filter((a) => {
      const cls = 'getAttribute' in a ? (a as { getAttribute(n: string): string | null }).getAttribute('class') ?? '' : '';
      const looksAction = /\b(btn|button|cta)\b/i.test(cls);
      return looksAction && text(a).length === 0;
    }).length;
    if (emptyButtons + emptyActionAnchors > 0) {
      issues.push({
        id: 'render:empty-button',
        severity: 'warn',
        message: `${emptyButtons + emptyActionAnchors} button/CTA element(s) render with no label text — give every action a visible label.`,
        autofixed: false,
      });
    }

    // (6) Per-archetype copy-length sanity (keyed via KIND_ARCHETYPE).
    const maxHeading = arch ? MAX_HEADING_LEN[arch] : undefined;
    if (maxHeading && headings.length > 0) {
      const primary = text(headings[0]);
      if (primary.length > maxHeading) {
        issues.push({
          id: 'render:heading-too-long',
          severity: 'warn',
          message: `The ${arch} heading is ${primary.length} chars (> ${maxHeading}) — that reads as body copy in a display slot; tighten it to a headline.`,
          autofixed: false,
        });
      }
    }

    return issues;
  } catch {
    // Any render/parse failure must not break generation — this is telemetry.
    return [];
  }
}
