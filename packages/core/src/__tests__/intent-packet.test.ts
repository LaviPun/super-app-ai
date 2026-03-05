import { describe, it, expect } from 'vitest';
import {
  CLEAN_INTENTS,
  MODULE_TYPE_TO_INTENT,
  ROUTING_TABLE,
  resolveRouting,
} from '../intent-packet.js';

const CLEAN_INTENTS_SET = new Set(CLEAN_INTENTS);
const BLUEPRINT_ROUTE = ROUTING_TABLE['platform.extensionBlueprint']!;

describe('intent-packet invariants (AI patch plan 1.8)', () => {
  it('every MODULE_TYPE_TO_INTENT value exists in CLEAN_INTENTS', () => {
    for (const [moduleType, intent] of Object.entries(MODULE_TYPE_TO_INTENT)) {
      expect(CLEAN_INTENTS_SET.has(intent as (typeof CLEAN_INTENTS)[number]), `${moduleType} → ${intent} not in CLEAN_INTENTS`).toBe(true);
    }
  });

  it('every CLEAN_INTENTS value has a ROUTING_TABLE entry', () => {
    for (const intent of CLEAN_INTENTS) {
      const entry = ROUTING_TABLE[intent];
      expect(entry, `CLEAN_INTENTS ${intent} missing ROUTING_TABLE entry`).toBeDefined();
      expect(entry?.prompt_scaffold_id).toBeDefined();
      expect(entry?.prompt_profile).toBeDefined();
      expect(entry?.output_schema).toBeDefined();
    }
  });

  it('unknown intent resolves to blueprint fallback (not promo popup)', () => {
    const unknown = resolveRouting('unknown.intent.xyz');
    expect(unknown.prompt_scaffold_id).toBe(BLUEPRINT_ROUTE.prompt_scaffold_id);
    expect(unknown.prompt_scaffold_id).not.toBe('tpl_promo_popup_v1');
  });

  it('utility.effect and utility.floating_widget have routing entries', () => {
    expect(ROUTING_TABLE['utility.effect']).toBeDefined();
    expect(ROUTING_TABLE['utility.floating_widget']).toBeDefined();
    expect(resolveRouting('utility.effect').prompt_scaffold_id).toBe('tpl_effect_v1');
    expect(resolveRouting('utility.floating_widget').prompt_scaffold_id).toBe('tpl_floating_widget_v1');
  });
});
