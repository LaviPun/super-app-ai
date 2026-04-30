import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ROUTER_RUNTIME_CONFIG,
  RouterRuntimeConfigSchema,
} from '~/schemas/router-runtime-config.server';

describe('RouterRuntimeConfigSchema', () => {
  it('accepts qwen3 backend for local and remote targets', () => {
    const parsed = RouterRuntimeConfigSchema.parse({
      ...DEFAULT_ROUTER_RUNTIME_CONFIG,
      targets: {
        localMachine: {
          ...DEFAULT_ROUTER_RUNTIME_CONFIG.targets.localMachine,
          backend: 'qwen3',
        },
        modalRemote: {
          ...DEFAULT_ROUTER_RUNTIME_CONFIG.targets.modalRemote,
          backend: 'qwen3',
        },
      },
    });

    expect(parsed.targets.localMachine.backend).toBe('qwen3');
    expect(parsed.targets.modalRemote.backend).toBe('qwen3');
  });

  it('rejects unsupported backend values', () => {
    expect(() =>
      RouterRuntimeConfigSchema.parse({
        ...DEFAULT_ROUTER_RUNTIME_CONFIG,
        targets: {
          ...DEFAULT_ROUTER_RUNTIME_CONFIG.targets,
          localMachine: {
            ...DEFAULT_ROUTER_RUNTIME_CONFIG.targets.localMachine,
            backend: 'qwen4',
          },
        },
      }),
    ).toThrow();
  });
});
