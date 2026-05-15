import { describe, expect, it } from 'vitest';
import {
  getCapabilityNode,
  isTargetAllowedForType,
  listCapabilitiesBySurface,
} from '../capability-graph.js';

describe('capability graph', () => {
  it('maps theme module types to THEME surface', () => {
    const node = getCapabilityNode('theme.banner');
    expect(node.surface).toBe('THEME');
    expect(node.allowedTargetKinds).toEqual(['THEME']);
  });

  it('maps non-theme module types to PLATFORM surface target', () => {
    const node = getCapabilityNode('admin.block');
    expect(node.surface).toBe('ADMIN');
    expect(node.allowedTargetKinds).toEqual(['PLATFORM']);
  });

  it('enforces target allowlist checks', () => {
    expect(isTargetAllowedForType('theme.popup', 'THEME')).toBe(true);
    expect(isTargetAllowedForType('theme.popup', 'PLATFORM')).toBe(false);
    expect(isTargetAllowedForType('checkout.upsell', 'PLATFORM')).toBe(true);
  });

  it('returns unique capabilities per surface', () => {
    const checkoutCaps = listCapabilitiesBySurface('CHECKOUT');
    expect(checkoutCaps).toContain('CHECKOUT_UI_INFO_SHIP_PAY');
  });
});

