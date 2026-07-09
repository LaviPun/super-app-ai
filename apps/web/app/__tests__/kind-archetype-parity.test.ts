import { describe, it, expect } from 'vitest';
import { KIND_ARCHETYPE as PREVIEW_MAP } from '~/services/preview/preview.service';
import { KIND_ARCHETYPE as NATIVE_MAP } from '~/services/recipes/compiler/native-section';

/**
 * R0 preview⇄storefront parity guard.
 *
 * The kind→archetype alias table lives in three places — preview.service.ts,
 * native-section.ts, and the Liquid `when` table in superapp-module.liquid — and
 * the Liquid copy can't import a TS const. If the two TS copies drift, a section
 * kind previews as one archetype but compiles to a different (or generic) one,
 * silently breaking parity. This locks the two TS maps together so any edit to one
 * without the other fails here (the maintainability review that motivated this
 * flagged exactly this drift risk).
 */
describe('kind→archetype alias parity (preview ⇄ native compiler)', () => {
  it('both TS maps have the identical key set', () => {
    const previewKeys = Object.keys(PREVIEW_MAP).sort();
    const nativeKeys = Object.keys(NATIVE_MAP).sort();
    const onlyInPreview = previewKeys.filter((k) => !(k in NATIVE_MAP));
    const onlyInNative = nativeKeys.filter((k) => !(k in PREVIEW_MAP));
    expect(onlyInPreview, `kinds mapped in preview but missing from native compiler: ${onlyInPreview.join(', ')}`).toEqual([]);
    expect(onlyInNative, `kinds mapped in native compiler but missing from preview: ${onlyInNative.join(', ')}`).toEqual([]);
  });

  it('every shared kind resolves to the same archetype in both', () => {
    const mismatches: string[] = [];
    for (const [kind, archetype] of Object.entries(PREVIEW_MAP)) {
      if (kind in NATIVE_MAP && NATIVE_MAP[kind] !== archetype) {
        mismatches.push(`${kind}: preview=${archetype} native=${NATIVE_MAP[kind]}`);
      }
    }
    expect(mismatches, `alias archetype mismatches: ${mismatches.join('; ')}`).toEqual([]);
  });

  it('guards a non-trivial number of aliases (so the maps can’t both go empty)', () => {
    expect(Object.keys(PREVIEW_MAP).length).toBeGreaterThan(20);
  });
});
