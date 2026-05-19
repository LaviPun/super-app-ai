import { describe, expect, it } from 'vitest';
import { InMemoryInternalAssistantRepository } from '../internal-assistant-ledger.js';

describe('InMemoryInternalAssistantRepository', () => {
  it('persists sessions and redacted messages', async () => {
    const repository = new InMemoryInternalAssistantRepository();
    const session = await repository.createSession({ title: 'Ops chat' });
    const user = await repository.createMessage({
      sessionId: session.id,
      role: 'user',
      content: 'Check Bearer secret-token-123',
      clientRequestId: 'request-123',
    });

    expect(user.content).toBe('Check Bearer [REDACTED]');
    expect(await repository.findUserMessageByRequest(session.id, 'request-123')).toMatchObject({ id: user.id });
    expect(await repository.listMessages(session.id)).toHaveLength(1);
  });

  it('finds a completed assistant response for a user message', async () => {
    const repository = new InMemoryInternalAssistantRepository();
    const session = await repository.createSession({ title: 'Ops chat' });
    const user = await repository.createMessage({
      sessionId: session.id,
      role: 'user',
      content: 'Summarize',
    });
    const assistant = await repository.createMessage({
      sessionId: session.id,
      role: 'assistant',
      content: 'Summary',
      responseToMessageId: user.id,
      status: 'completed',
    });

    expect(await repository.findAssistantResponseForUser(session.id, user.id)).toMatchObject({ id: assistant.id });
  });
});
