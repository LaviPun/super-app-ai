import { describe, expect, it } from 'vitest';
import { selectToolsForPrompt } from '~/services/ai/internal-assistant-tools.server';

describe('internal assistant tool selection', () => {
  it('selects db and health tools for operational prompt', () => {
    const tools = selectToolsForPrompt('Check DB status and system health now');
    expect(tools).toContain('checkDBStatus');
    expect(tools).toContain('getSystemHealth');
  });

  it('selects logs and error tools for failure prompt', () => {
    const tools = selectToolsForPrompt('Show me recent errors and logs');
    expect(tools).toContain('getRecentErrors');
    expect(tools).toContain('fetchLogs');
  });

  it('returns empty tools for generic conversation', () => {
    const tools = selectToolsForPrompt('Write a clean release note for me');
    expect(tools).toEqual([]);
  });
});
