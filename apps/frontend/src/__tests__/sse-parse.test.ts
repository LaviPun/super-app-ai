import { describe, expect, it } from 'vitest';
import { parseSseChunk } from '@/lib/sse-parse';

describe('parseSseChunk', () => {
  it('parses SSE event blocks and keeps partial remainder', () => {
    const { messages, remainder } = parseSseChunk(
      ':ready\n\nevent: job_started\ndata: {"type":"JOB_STARTED"}\n\nevent: job_prog',
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({
      event: 'job_started',
      data: '{"type":"JOB_STARTED"}',
    });
    expect(remainder).toContain('event: job_prog');
  });

  it('ignores comment frames', () => {
    const { messages } = parseSseChunk(':keepalive\n\n');
    expect(messages).toHaveLength(0);
  });
});
