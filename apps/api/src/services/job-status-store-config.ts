import { KvJobStatusStore, setJobStatusStore } from '@superapp/job-orchestration';
import type { ApiRuntimeEnv } from '../handlers/api-context.js';

export function configureJobStatusStore(env: ApiRuntimeEnv): void {
  if (env.JOB_STATUS_KV) {
    setJobStatusStore(new KvJobStatusStore(env.JOB_STATUS_KV));
  }
}
