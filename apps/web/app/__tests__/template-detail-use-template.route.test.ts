import { describe, it, expect } from 'vitest';
import { useTemplateSubmission } from '~/utils/template-detail';

describe('template-detail "Use template" CTA (WS-F: was a dead navigate to an unread query param)', () => {
  it('submits to the real from-template endpoint with the templateId', () => {
    expect(useTemplateSubmission('tmpl_123')).toEqual({
      action: '/api/modules/from-template',
      body: { templateId: 'tmpl_123' },
    });
  });
});
