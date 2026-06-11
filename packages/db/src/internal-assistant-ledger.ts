export type InternalAssistantMessageRole = 'user' | 'assistant' | 'system';
export type InternalAssistantTarget = 'localMachine' | 'modalRemote';
export type InternalAssistantMessageStatus = 'queued' | 'streaming' | 'completed' | 'failed';

export type InternalAssistantSessionRecord = {
  id: string;
  title: string;
  mode: InternalAssistantTarget;
  memoryEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type InternalAssistantMessageRecord = {
  id: string;
  sessionId: string;
  role: InternalAssistantMessageRole;
  content: string;
  status: InternalAssistantMessageStatus;
  mode?: InternalAssistantTarget;
  clientRequestId?: string;
  responseToMessageId?: string;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateInternalAssistantSessionInput = {
  id?: string;
  title: string;
  mode?: InternalAssistantTarget;
  memoryEnabled?: boolean;
};

export type CreateInternalAssistantMessageInput = {
  sessionId: string;
  role: InternalAssistantMessageRole;
  content: string;
  status?: InternalAssistantMessageStatus;
  mode?: InternalAssistantTarget;
  clientRequestId?: string;
  responseToMessageId?: string;
};

export interface InternalAssistantRepository {
  createSession(input: CreateInternalAssistantSessionInput): Promise<InternalAssistantSessionRecord>;
  findSession(id: string): Promise<InternalAssistantSessionRecord | null>;
  createMessage(input: CreateInternalAssistantMessageInput): Promise<InternalAssistantMessageRecord>;
  updateMessage(
    id: string,
    patch: Partial<Pick<InternalAssistantMessageRecord, 'content' | 'status' | 'error'>>,
  ): Promise<InternalAssistantMessageRecord>;
  findUserMessageByRequest(sessionId: string, clientRequestId: string): Promise<InternalAssistantMessageRecord | null>;
  findAssistantResponseForUser(sessionId: string, userMessageId: string): Promise<InternalAssistantMessageRecord | null>;
  listMessages(sessionId: string): Promise<InternalAssistantMessageRecord[]>;
}

export class InMemoryInternalAssistantRepository implements InternalAssistantRepository {
  private readonly sessions = new Map<string, InternalAssistantSessionRecord>();
  private readonly messages = new Map<string, InternalAssistantMessageRecord>();
  private nextSessionId = 1;
  private nextMessageId = 1;

  async createSession(input: CreateInternalAssistantSessionInput): Promise<InternalAssistantSessionRecord> {
    const now = new Date().toISOString();
    const record: InternalAssistantSessionRecord = {
      id: input.id ?? `ias_${String(this.nextSessionId++).padStart(6, '0')}`,
      title: input.title,
      mode: input.mode ?? 'localMachine',
      memoryEnabled: input.memoryEnabled ?? false,
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.set(record.id, record);
    return record;
  }

  async findSession(id: string): Promise<InternalAssistantSessionRecord | null> {
    return this.sessions.get(id) ?? null;
  }

  async createMessage(input: CreateInternalAssistantMessageInput): Promise<InternalAssistantMessageRecord> {
    if (!this.sessions.has(input.sessionId)) {
      throw new Error(`Internal assistant session not found: ${input.sessionId}`);
    }
    const now = new Date().toISOString();
    const record: InternalAssistantMessageRecord = {
      id: `iam_${String(this.nextMessageId++).padStart(6, '0')}`,
      sessionId: input.sessionId,
      role: input.role,
      content: redactInternalAssistantContent(input.content),
      status: input.status ?? 'completed',
      mode: input.mode,
      clientRequestId: input.clientRequestId,
      responseToMessageId: input.responseToMessageId,
      error: null,
      createdAt: now,
      updatedAt: now,
    };
    this.messages.set(record.id, record);
    return record;
  }

  async updateMessage(
    id: string,
    patch: Partial<Pick<InternalAssistantMessageRecord, 'content' | 'status' | 'error'>>,
  ): Promise<InternalAssistantMessageRecord> {
    const existing = this.messages.get(id);
    if (!existing) throw new Error(`Internal assistant message not found: ${id}`);
    const updated: InternalAssistantMessageRecord = {
      ...existing,
      ...patch,
      content: patch.content === undefined ? existing.content : redactInternalAssistantContent(patch.content),
      updatedAt: new Date().toISOString(),
    };
    this.messages.set(id, updated);
    return updated;
  }

  async findUserMessageByRequest(sessionId: string, clientRequestId: string): Promise<InternalAssistantMessageRecord | null> {
    return [...this.messages.values()].find((message) =>
      message.sessionId === sessionId &&
      message.role === 'user' &&
      message.clientRequestId === clientRequestId
    ) ?? null;
  }

  async findAssistantResponseForUser(sessionId: string, userMessageId: string): Promise<InternalAssistantMessageRecord | null> {
    return [...this.messages.values()].find((message) =>
      message.sessionId === sessionId &&
      message.role === 'assistant' &&
      message.responseToMessageId === userMessageId &&
      message.status === 'completed'
    ) ?? null;
  }

  async listMessages(sessionId: string): Promise<InternalAssistantMessageRecord[]> {
    return [...this.messages.values()]
      .filter((message) => message.sessionId === sessionId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
}

function redactInternalAssistantContent(content: string): string {
  return content
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]')
    .replace(/\bBearer\s+[A-Za-z0-9._-]{8,}\b/gi, 'Bearer [REDACTED]');
}
