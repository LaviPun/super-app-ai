import { describe, expect, it, vi } from 'vitest';
import { InMemoryJobLedgerRepository, createQueuedJob } from '@superapp/db';
import { createAiGenerationProcessor, type AiGenerationAdapter } from '../ai-generation.js';

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

describe('AI generation worker', () => {
  it('generates RecipeSpec-only output and emits completion events', async () => {
    const repository = new InMemoryJobLedgerRepository();
    const { record } = await createQueuedJob(repository, {
      type: 'AI_GENERATE',
      payload: { prompt: 'Create a banner for summer sale' },
      trace: { correlationId: 'corr-ai-1' },
    });
    const processor = createAiGenerationProcessor({
      adapter: {
        async generate() {
          return {
            recipeSpec: {
              type: 'theme.section',
              name: 'Summer sale banner',
              category: 'STOREFRONT_UI',
              requires: ['THEME_ASSETS'],
              config: {
                kind: 'banner',
                activation: 'section',
                title: 'Summer sale',
                subtitle: 'Save today',
                fields: { ctaText: 'Shop now', ctaUrl: 'https://example.com/collections/sale' },
                blocks: [],
              },
            },
            model: 'test-model',
          };
        },
        async hydrate() {
          throw new Error('not used');
        },
        async modify() {
          throw new Error('not used');
        },
      },
      jobRepository: repository,
      logger,
    });

    const result = await processor({
      id: record.id,
      type: 'AI_GENERATE',
      queueName: 'ai-generation',
      payload: record.payload,
      trace: record.trace,
    });

    expect(result.status).toBe('SUCCESS');
    expect(result.events.map((event) => event.type)).toEqual(['JOB_STARTED', 'JOB_PROGRESS', 'JOB_COMPLETED']);
    expect((await repository.findById(record.id))?.status).toBe('SUCCESS');
  });

  it('hydrates module config and records success without requiring new RecipeSpec', async () => {
    const repository = new InMemoryJobLedgerRepository();
    const { record } = await createQueuedJob(repository, {
      type: 'AI_HYDRATE',
      payload: {
        moduleId: 'mod-1',
        sourceSpec: {
          type: 'theme.section',
          name: 'Existing banner',
          category: 'STOREFRONT_UI',
          config: {
            kind: 'banner',
            activation: 'section',
            title: 'Hello',
            fields: { ctaText: 'Shop now', ctaUrl: 'https://example.com/collections/all' },
          },
        },
      },
      trace: { correlationId: 'corr-ai-2' },
    });

    const processor = createAiGenerationProcessor({
      adapter: {
        async generate() {
          throw new Error('not used');
        },
        async hydrate() {
          return { validationReport: { overall: 'PASS', checks: [] }, hydratedAt: new Date().toISOString() };
        },
        async modify() {
          throw new Error('not used');
        },
      },
      jobRepository: repository,
      logger,
    });

    const result = await processor({
      id: record.id,
      type: 'AI_HYDRATE',
      queueName: 'ai-generation',
      payload: record.payload,
      trace: record.trace,
    });

    expect(result.status).toBe('SUCCESS');
    expect((await repository.findById(record.id))?.status).toBe('SUCCESS');
  });

  it('fails invalid provider output that is not RecipeSpec JSON', async () => {
    const repository = new InMemoryJobLedgerRepository();
    const { record } = await createQueuedJob(repository, {
      type: 'AI_MODIFY',
      payload: { moduleId: 'mod-1', instruction: 'Change headline' },
      trace: { correlationId: 'corr-ai-3' },
    });
    const adapter: AiGenerationAdapter = {
      async generate() {
        throw new Error('not used');
      },
      async hydrate() {
        throw new Error('not used');
      },
      async modify() {
        return { recipeSpec: { rawCode: '<script>alert(1)</script>' } };
      },
    };

    const processor = createAiGenerationProcessor({ adapter, jobRepository: repository, logger });
    await expect(processor({
      id: record.id,
      type: 'AI_MODIFY',
      queueName: 'ai-generation',
      payload: record.payload,
      trace: record.trace,
    })).rejects.toThrow();
    expect((await repository.findById(record.id))?.status).toBe('FAILED');
  });

  it('records provider failures for retry handling', async () => {
    const repository = new InMemoryJobLedgerRepository();
    const { record } = await createQueuedJob(repository, {
      type: 'AI_GENERATE',
      payload: { prompt: 'Create a popup' },
      trace: { correlationId: 'corr-ai-4' },
    });
    const processor = createAiGenerationProcessor({
      adapter: {
        async generate() {
          throw new Error('provider unavailable');
        },
        async hydrate() {
          throw new Error('not used');
        },
        async modify() {
          throw new Error('not used');
        },
      },
      jobRepository: repository,
      logger,
    });

    await expect(processor({
      id: record.id,
      type: 'AI_GENERATE',
      queueName: 'ai-generation',
      payload: record.payload,
      trace: record.trace,
    })).rejects.toThrow('provider unavailable');
    expect((await repository.findById(record.id))?.error).toBe('provider unavailable');
  });
});
