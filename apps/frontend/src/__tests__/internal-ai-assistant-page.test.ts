import { describe, expect, it } from 'vitest';
import { internalRoutes } from '../routes/legacy-route-map.js';

describe('internal AI assistant route parity', () => {
  it('maps the V2 assistant shell to legacy Remix assistant with async SSE boundary', () => {
    const route = internalRoutes.find((item) => item.label === 'AI Assistant');
    expect(route).toBeDefined();
    expect(route?.href).toBe('/internal/ai-assistant');
    expect(route?.legacyRoutes).toEqual(expect.arrayContaining([
      'internal.ai-assistant.tsx',
      'internal.ai-assistant.chat.stream.tsx',
    ]));
    expect(route?.apiBoundary).toContain('/v1/internal/assistant/jobs');
    expect(route?.apiBoundary).toContain('/events');
  });
});
