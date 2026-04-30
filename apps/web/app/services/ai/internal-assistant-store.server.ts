import { getPrisma } from '~/db.server';

export type AssistantMode = 'localMachine' | 'modalRemote';

export type AssistantSessionSummary = {
  id: string;
  title: string;
  mode: AssistantMode;
  memoryEnabled: boolean;
  updatedAt: string;
  createdAt: string;
  messageCount: number;
};

export type AssistantMessageRecord = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  mode: AssistantMode | null;
  backend: string | null;
  model: string | null;
  latencyMs: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  estimatedCostCents: number | null;
  hadFallback: boolean;
  retryCount: number;
  status: 'streaming' | 'completed' | 'error';
  clientRequestId: string | null;
  responseToMessageId: string | null;
  error: string | null;
  createdAt: string;
};

export type AssistantMemoryRecord = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string').slice(0, 20);
  } catch {
    return [];
  }
}

let internalAiMessageSchemaEnsured = false;
let ensureInternalAiMessageSchemaPromise: Promise<void> | null = null;

async function ensureInternalAiMessageSchema() {
  if (internalAiMessageSchemaEnsured) return;
  if (ensureInternalAiMessageSchemaPromise) return ensureInternalAiMessageSchemaPromise;
  ensureInternalAiMessageSchemaPromise = (async () => {
    const prisma = getPrisma();
    const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>('PRAGMA table_info("InternalAiMessage")');
    const columns = new Set(rows.map((row) => row.name));
    if (!columns.has('retryCount')) {
      await prisma.$executeRawUnsafe('ALTER TABLE "InternalAiMessage" ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0');
    }
    if (!columns.has('status')) {
      await prisma.$executeRawUnsafe('ALTER TABLE "InternalAiMessage" ADD COLUMN "status" TEXT NOT NULL DEFAULT \'completed\'');
    }
    if (!columns.has('clientRequestId')) {
      await prisma.$executeRawUnsafe('ALTER TABLE "InternalAiMessage" ADD COLUMN "clientRequestId" TEXT');
    }
    if (!columns.has('responseToMessageId')) {
      await prisma.$executeRawUnsafe('ALTER TABLE "InternalAiMessage" ADD COLUMN "responseToMessageId" TEXT');
    }
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "InternalAiMessage_sessionId_clientRequestId_idx" ON "InternalAiMessage"("sessionId", "clientRequestId")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "InternalAiMessage_responseToMessageId_idx" ON "InternalAiMessage"("responseToMessageId")');
    internalAiMessageSchemaEnsured = true;
  })().finally(() => {
    ensureInternalAiMessageSchemaPromise = null;
  });
  return ensureInternalAiMessageSchemaPromise;
}

let internalAiTablesEnsured = false;
let ensureInternalAiTablesPromise: Promise<void> | null = null;

async function ensureInternalAiTables() {
  if (internalAiTablesEnsured) return;
  if (ensureInternalAiTablesPromise) return ensureInternalAiTablesPromise;
  ensureInternalAiTablesPromise = (async () => {
    const prisma = getPrisma();
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "InternalAiSession" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "title" TEXT NOT NULL,
        "mode" TEXT NOT NULL DEFAULT 'localMachine',
        "memoryEnabled" BOOLEAN NOT NULL DEFAULT true,
        "archivedAt" DATETIME,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "InternalAiMessage" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "sessionId" TEXT NOT NULL,
        "role" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "mode" TEXT,
        "backend" TEXT,
        "model" TEXT,
        "latencyMs" INTEGER,
        "tokensIn" INTEGER,
        "tokensOut" INTEGER,
        "estimatedCostCents" INTEGER DEFAULT 0,
        "hadFallback" BOOLEAN NOT NULL DEFAULT false,
        "error" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("sessionId") REFERENCES "InternalAiSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "InternalAiMemory" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "title" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "tagsJson" TEXT,
        "isEnabled" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "InternalAiToolAudit" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "sessionId" TEXT,
        "messageId" TEXT,
        "toolName" TEXT NOT NULL,
        "argsJson" TEXT,
        "resultJson" TEXT,
        "success" BOOLEAN NOT NULL DEFAULT true,
        "error" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("sessionId") REFERENCES "InternalAiSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
        FOREIGN KEY ("messageId") REFERENCES "InternalAiMessage" ("id") ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "InternalAiSession_updatedAt_idx" ON "InternalAiSession"("updatedAt")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "InternalAiSession_createdAt_idx" ON "InternalAiSession"("createdAt")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "InternalAiMessage_sessionId_createdAt_idx" ON "InternalAiMessage"("sessionId", "createdAt")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "InternalAiMessage_createdAt_idx" ON "InternalAiMessage"("createdAt")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "InternalAiMemory_isEnabled_updatedAt_idx" ON "InternalAiMemory"("isEnabled", "updatedAt")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "InternalAiToolAudit_createdAt_idx" ON "InternalAiToolAudit"("createdAt")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "InternalAiToolAudit_toolName_createdAt_idx" ON "InternalAiToolAudit"("toolName", "createdAt")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "InternalAiToolAudit_sessionId_createdAt_idx" ON "InternalAiToolAudit"("sessionId", "createdAt")');
    await ensureInternalAiMessageSchema();
    internalAiTablesEnsured = true;
  })().finally(() => {
    ensureInternalAiTablesPromise = null;
  });
  return ensureInternalAiTablesPromise;
}

export class InternalAssistantStoreService {
  async listSessions(search?: string): Promise<AssistantSessionSummary[]> {
    await ensureInternalAiTables();
    const prisma = getPrisma();
    const rows = await prisma.internalAiSession.findMany({
      where: {
        archivedAt: null,
        ...(search?.trim()
          ? { title: { contains: search.trim() } }
          : {}),
      },
      include: {
        _count: {
          select: { messages: true },
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 200,
    });
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      mode: row.mode as AssistantMode,
      memoryEnabled: row.memoryEnabled,
      updatedAt: row.updatedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      messageCount: row._count.messages,
    }));
  }

  async createSession(input: { title: string; mode: AssistantMode; memoryEnabled?: boolean }): Promise<AssistantSessionSummary> {
    await ensureInternalAiTables();
    const prisma = getPrisma();
    const row = await prisma.internalAiSession.create({
      data: {
        title: input.title.trim() || 'New chat',
        mode: input.mode,
        memoryEnabled: input.memoryEnabled ?? true,
      },
      include: { _count: { select: { messages: true } } },
    });
    return {
      id: row.id,
      title: row.title,
      mode: row.mode as AssistantMode,
      memoryEnabled: row.memoryEnabled,
      updatedAt: row.updatedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      messageCount: row._count.messages,
    };
  }

  async updateSession(sessionId: string, input: { title?: string; mode?: AssistantMode; memoryEnabled?: boolean }) {
    await ensureInternalAiTables();
    const prisma = getPrisma();
    const row = await prisma.internalAiSession.update({
      where: { id: sessionId },
      data: {
        ...(input.title !== undefined ? { title: input.title.trim() || 'New chat' } : {}),
        ...(input.mode !== undefined ? { mode: input.mode } : {}),
        ...(input.memoryEnabled !== undefined ? { memoryEnabled: input.memoryEnabled } : {}),
      },
      include: { _count: { select: { messages: true } } },
    });
    return {
      id: row.id,
      title: row.title,
      mode: row.mode as AssistantMode,
      memoryEnabled: row.memoryEnabled,
      updatedAt: row.updatedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      messageCount: row._count.messages,
    } satisfies AssistantSessionSummary;
  }

  async archiveSession(sessionId: string): Promise<void> {
    await ensureInternalAiTables();
    const prisma = getPrisma();
    await prisma.internalAiSession.update({
      where: { id: sessionId },
      data: { archivedAt: new Date() },
    });
  }

  async getSession(sessionId: string): Promise<AssistantSessionSummary | null> {
    await ensureInternalAiTables();
    const prisma = getPrisma();
    const row = await prisma.internalAiSession.findFirst({
      where: { id: sessionId, archivedAt: null },
      include: { _count: { select: { messages: true } } },
    });
    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      mode: row.mode as AssistantMode,
      memoryEnabled: row.memoryEnabled,
      updatedAt: row.updatedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      messageCount: row._count.messages,
    };
  }

  async listMessages(sessionId: string, limit = 200): Promise<AssistantMessageRecord[]> {
    await ensureInternalAiTables();
    const prisma = getPrisma();
    const rows = await prisma.internalAiMessage.findMany({
      where: { sessionId },
      orderBy: [{ createdAt: 'asc' }],
      take: Math.max(1, Math.min(limit, 400)),
    });
    return rows.map((row) => ({
      id: row.id,
      role: row.role as AssistantMessageRecord['role'],
      content: row.content,
      mode: row.mode as AssistantMode | null,
      backend: row.backend,
      model: row.model,
      latencyMs: row.latencyMs,
      tokensIn: row.tokensIn,
      tokensOut: row.tokensOut,
      estimatedCostCents: row.estimatedCostCents,
      hadFallback: row.hadFallback,
      retryCount: row.retryCount,
      status: row.status as AssistantMessageRecord['status'],
      clientRequestId: row.clientRequestId,
      responseToMessageId: row.responseToMessageId,
      error: row.error,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async createMessage(input: {
    sessionId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    mode?: AssistantMode;
    backend?: string;
    model?: string;
    latencyMs?: number;
    tokensIn?: number;
    tokensOut?: number;
    estimatedCostCents?: number;
    hadFallback?: boolean;
    retryCount?: number;
    status?: 'streaming' | 'completed' | 'error';
    clientRequestId?: string;
    responseToMessageId?: string;
    error?: string;
  }): Promise<AssistantMessageRecord> {
    await ensureInternalAiTables();
    const prisma = getPrisma();
    const row = await prisma.internalAiMessage.create({
      data: {
        sessionId: input.sessionId,
        role: input.role,
        content: input.content,
        mode: input.mode,
        backend: input.backend,
        model: input.model,
        latencyMs: input.latencyMs,
        tokensIn: input.tokensIn,
        tokensOut: input.tokensOut,
        estimatedCostCents: input.estimatedCostCents ?? 0,
        hadFallback: input.hadFallback ?? false,
        retryCount: input.retryCount ?? 0,
        status: input.status ?? 'completed',
        clientRequestId: input.clientRequestId,
        responseToMessageId: input.responseToMessageId,
        error: input.error,
      },
    });
    await prisma.internalAiSession.update({
      where: { id: input.sessionId },
      data: { updatedAt: new Date() },
    });
    return {
      id: row.id,
      role: row.role as AssistantMessageRecord['role'],
      content: row.content,
      mode: row.mode as AssistantMode | null,
      backend: row.backend,
      model: row.model,
      latencyMs: row.latencyMs,
      tokensIn: row.tokensIn,
      tokensOut: row.tokensOut,
      estimatedCostCents: row.estimatedCostCents,
      hadFallback: row.hadFallback,
      retryCount: row.retryCount,
      status: row.status as AssistantMessageRecord['status'],
      clientRequestId: row.clientRequestId,
      responseToMessageId: row.responseToMessageId,
      error: row.error,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async updateMessage(messageId: string, input: {
    content?: string;
    mode?: AssistantMode;
    backend?: string;
    model?: string;
    latencyMs?: number;
    tokensIn?: number;
    tokensOut?: number;
    estimatedCostCents?: number;
    hadFallback?: boolean;
    retryCount?: number;
    status?: 'streaming' | 'completed' | 'error';
    error?: string | null;
  }): Promise<AssistantMessageRecord> {
    await ensureInternalAiTables();
    const prisma = getPrisma();
    const row = await prisma.internalAiMessage.update({
      where: { id: messageId },
      data: {
        ...(input.content !== undefined ? { content: input.content } : {}),
        ...(input.mode !== undefined ? { mode: input.mode } : {}),
        ...(input.backend !== undefined ? { backend: input.backend } : {}),
        ...(input.model !== undefined ? { model: input.model } : {}),
        ...(input.latencyMs !== undefined ? { latencyMs: input.latencyMs } : {}),
        ...(input.tokensIn !== undefined ? { tokensIn: input.tokensIn } : {}),
        ...(input.tokensOut !== undefined ? { tokensOut: input.tokensOut } : {}),
        ...(input.estimatedCostCents !== undefined ? { estimatedCostCents: input.estimatedCostCents } : {}),
        ...(input.hadFallback !== undefined ? { hadFallback: input.hadFallback } : {}),
        ...(input.retryCount !== undefined ? { retryCount: input.retryCount } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.error !== undefined ? { error: input.error } : {}),
      },
    });
    return {
      id: row.id,
      role: row.role as AssistantMessageRecord['role'],
      content: row.content,
      mode: row.mode as AssistantMode | null,
      backend: row.backend,
      model: row.model,
      latencyMs: row.latencyMs,
      tokensIn: row.tokensIn,
      tokensOut: row.tokensOut,
      estimatedCostCents: row.estimatedCostCents,
      hadFallback: row.hadFallback,
      retryCount: row.retryCount,
      status: row.status as AssistantMessageRecord['status'],
      clientRequestId: row.clientRequestId,
      responseToMessageId: row.responseToMessageId,
      error: row.error,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async findUserMessageByRequest(sessionId: string, clientRequestId: string): Promise<AssistantMessageRecord | null> {
    await ensureInternalAiTables();
    const prisma = getPrisma();
    const row = await prisma.internalAiMessage.findFirst({
      where: {
        sessionId,
        role: 'user',
        clientRequestId,
      },
      orderBy: [{ createdAt: 'desc' }],
    });
    if (!row) return null;
    return {
      id: row.id,
      role: row.role as AssistantMessageRecord['role'],
      content: row.content,
      mode: row.mode as AssistantMode | null,
      backend: row.backend,
      model: row.model,
      latencyMs: row.latencyMs,
      tokensIn: row.tokensIn,
      tokensOut: row.tokensOut,
      estimatedCostCents: row.estimatedCostCents,
      hadFallback: row.hadFallback,
      retryCount: row.retryCount,
      status: row.status as AssistantMessageRecord['status'],
      clientRequestId: row.clientRequestId,
      responseToMessageId: row.responseToMessageId,
      error: row.error,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async findAssistantResponseForUser(sessionId: string, userMessageId: string): Promise<AssistantMessageRecord | null> {
    await ensureInternalAiTables();
    const prisma = getPrisma();
    const row = await prisma.internalAiMessage.findFirst({
      where: {
        sessionId,
        role: 'assistant',
        responseToMessageId: userMessageId,
      },
      orderBy: [{ createdAt: 'desc' }],
    });
    if (!row) return null;
    return {
      id: row.id,
      role: row.role as AssistantMessageRecord['role'],
      content: row.content,
      mode: row.mode as AssistantMode | null,
      backend: row.backend,
      model: row.model,
      latencyMs: row.latencyMs,
      tokensIn: row.tokensIn,
      tokensOut: row.tokensOut,
      estimatedCostCents: row.estimatedCostCents,
      hadFallback: row.hadFallback,
      retryCount: row.retryCount,
      status: row.status as AssistantMessageRecord['status'],
      clientRequestId: row.clientRequestId,
      responseToMessageId: row.responseToMessageId,
      error: row.error,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async listMemories(): Promise<AssistantMemoryRecord[]> {
    await ensureInternalAiTables();
    const prisma = getPrisma();
    const rows = await prisma.internalAiMemory.findMany({
      orderBy: [{ updatedAt: 'desc' }],
      take: 300,
    });
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      content: row.content,
      tags: parseTags(row.tagsJson),
      isEnabled: row.isEnabled,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async createMemory(input: { title: string; content: string; tags: string[]; isEnabled?: boolean }): Promise<AssistantMemoryRecord> {
    await ensureInternalAiTables();
    const prisma = getPrisma();
    const row = await prisma.internalAiMemory.create({
      data: {
        title: input.title.trim(),
        content: input.content.trim(),
        tagsJson: JSON.stringify(input.tags.slice(0, 20)),
        isEnabled: input.isEnabled ?? true,
      },
    });
    return {
      id: row.id,
      title: row.title,
      content: row.content,
      tags: parseTags(row.tagsJson),
      isEnabled: row.isEnabled,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async updateMemory(memoryId: string, input: { title?: string; content?: string; tags?: string[]; isEnabled?: boolean }): Promise<AssistantMemoryRecord> {
    await ensureInternalAiTables();
    const prisma = getPrisma();
    const row = await prisma.internalAiMemory.update({
      where: { id: memoryId },
      data: {
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.content !== undefined ? { content: input.content.trim() } : {}),
        ...(input.tags !== undefined ? { tagsJson: JSON.stringify(input.tags.slice(0, 20)) } : {}),
        ...(input.isEnabled !== undefined ? { isEnabled: input.isEnabled } : {}),
      },
    });
    return {
      id: row.id,
      title: row.title,
      content: row.content,
      tags: parseTags(row.tagsJson),
      isEnabled: row.isEnabled,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async deleteMemory(memoryId: string): Promise<void> {
    await ensureInternalAiTables();
    const prisma = getPrisma();
    await prisma.internalAiMemory.delete({ where: { id: memoryId } });
  }

  async getEnabledMemoryContext(limit = 20): Promise<Array<{ title: string; content: string; tags: string[] }>> {
    await ensureInternalAiTables();
    const prisma = getPrisma();
    const rows = await prisma.internalAiMemory.findMany({
      where: { isEnabled: true },
      orderBy: [{ updatedAt: 'desc' }],
      take: Math.max(1, Math.min(limit, 50)),
    });
    return rows.map((row) => ({
      title: row.title,
      content: row.content,
      tags: parseTags(row.tagsJson),
    }));
  }

  async writeToolAudit(input: {
    toolName: string;
    sessionId?: string;
    messageId?: string;
    argsJson?: string;
    resultJson?: string;
    success?: boolean;
    error?: string;
  }): Promise<void> {
    await ensureInternalAiTables();
    const prisma = getPrisma();
    await prisma.internalAiToolAudit.create({
      data: {
        toolName: input.toolName,
        sessionId: input.sessionId,
        messageId: input.messageId,
        argsJson: input.argsJson,
        resultJson: input.resultJson,
        success: input.success ?? true,
        error: input.error,
      },
    });
  }
}
