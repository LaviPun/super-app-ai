import type { JobStatus, JobType, WorkerEvent } from '@superapp/platform-contracts';

export type AsyncUxTone = 'neutral' | 'progress' | 'success' | 'critical' | 'warning';

export type AsyncUxPhase =
  | 'queued'
  | 'running'
  | 'validating'
  | 'ready'
  | 'failed'
  | 'cancelled'
  | 'applying'
  | 'verifying'
  | 'published'
  | 'retrying'
  | 'succeeded'
  | 'connecting'
  | 'blocked'
  | 'timed_out'
  | 'auth_failed';

export type AsyncUxSnapshot = {
  phase: AsyncUxPhase;
  label: string;
  tone: AsyncUxTone;
  progress?: number;
  detail?: string;
  canRetry: boolean;
  canCancel: boolean;
};

const TERMINAL: JobStatus[] = ['SUCCESS', 'FAILED', 'CANCELLED'];

function metadataPhase(event: WorkerEvent | undefined): AsyncUxPhase | undefined {
  const phase = event?.metadata?.phase;
  return typeof phase === 'string' ? (phase as AsyncUxPhase) : undefined;
}

function generationPhase(status: JobStatus, event?: WorkerEvent): AsyncUxSnapshot {
  const meta = metadataPhase(event);
  if (meta) {
    return snapshotFromPhase(meta, event);
  }
  if (status === 'QUEUED') return { phase: 'queued', label: 'Generation queued', tone: 'neutral', canRetry: false, canCancel: true };
  if (status === 'RUNNING') {
    if (event?.message?.toLowerCase().includes('validat')) {
      return { phase: 'validating', label: 'Validating recipe', tone: 'progress', progress: event.progress, detail: event.message, canRetry: false, canCancel: true };
    }
    return { phase: 'running', label: 'Generating', tone: 'progress', progress: event?.progress, detail: event?.message, canRetry: false, canCancel: true };
  }
  if (status === 'SUCCESS') return { phase: 'ready', label: 'Ready to publish', tone: 'success', canRetry: false, canCancel: false };
  if (status === 'FAILED') return { phase: 'failed', label: 'Generation failed', tone: 'critical', detail: event?.message, canRetry: true, canCancel: false };
  return { phase: 'cancelled', label: 'Generation cancelled', tone: 'warning', canRetry: true, canCancel: false };
}

function publishPhase(status: JobStatus, event?: WorkerEvent): AsyncUxSnapshot {
  const meta = metadataPhase(event);
  if (meta) return snapshotFromPhase(meta, event);
  if (status === 'QUEUED') return { phase: 'queued', label: 'Publish queued', tone: 'neutral', canRetry: false, canCancel: true };
  if (status === 'RUNNING') {
    if (event?.message?.toLowerCase().includes('verify')) {
      return { phase: 'verifying', label: 'Verifying theme', tone: 'progress', progress: event.progress, detail: event.message, canRetry: false, canCancel: false };
    }
    return { phase: 'applying', label: 'Applying publish', tone: 'progress', progress: event?.progress, detail: event?.message, canRetry: false, canCancel: false };
  }
  if (status === 'SUCCESS') return { phase: 'published', label: 'Published', tone: 'success', canRetry: false, canCancel: false };
  if (status === 'FAILED') return { phase: 'failed', label: 'Publish failed', tone: 'critical', detail: event?.message, canRetry: true, canCancel: false };
  return { phase: 'cancelled', label: 'Publish cancelled', tone: 'warning', canRetry: true, canCancel: false };
}

function flowPhase(status: JobStatus, event?: WorkerEvent): AsyncUxSnapshot {
  const meta = metadataPhase(event);
  if (meta) return snapshotFromPhase(meta, event);
  if (status === 'QUEUED') return { phase: 'queued', label: 'Flow queued', tone: 'neutral', canRetry: false, canCancel: true };
  if (status === 'RUNNING') {
    if (event?.message?.toLowerCase().includes('retry')) {
      return { phase: 'retrying', label: 'Retrying step', tone: 'warning', progress: event?.progress, detail: event?.message, canRetry: false, canCancel: true };
    }
    return { phase: 'running', label: event?.message ?? 'Running flow step', tone: 'progress', progress: event?.progress, detail: event?.message, canRetry: false, canCancel: true };
  }
  if (status === 'SUCCESS') return { phase: 'succeeded', label: 'Flow succeeded', tone: 'success', canRetry: false, canCancel: false };
  if (status === 'FAILED') return { phase: 'failed', label: 'Flow failed', tone: 'critical', detail: event?.message, canRetry: true, canCancel: false };
  return { phase: 'cancelled', label: 'Flow cancelled', tone: 'warning', canRetry: true, canCancel: false };
}

function connectorTestPhase(status: JobStatus, event?: WorkerEvent): AsyncUxSnapshot {
  const meta = metadataPhase(event);
  if (meta) return snapshotFromPhase(meta, event);
  const message = event?.message?.toLowerCase() ?? '';
  if (message.includes('auth')) {
    return { phase: 'auth_failed', label: 'Auth failed', tone: 'critical', detail: event?.message, canRetry: true, canCancel: false };
  }
  if (message.includes('timeout') || message.includes('timed out')) {
    return { phase: 'timed_out', label: 'Timed out', tone: 'critical', detail: event?.message, canRetry: true, canCancel: false };
  }
  if (message.includes('block') || message.includes('ssrf')) {
    return { phase: 'blocked', label: 'Blocked by policy', tone: 'warning', detail: event?.message, canRetry: false, canCancel: false };
  }
  if (status === 'QUEUED') return { phase: 'queued', label: 'Connector test queued', tone: 'neutral', canRetry: false, canCancel: true };
  if (status === 'RUNNING') {
    return { phase: 'connecting', label: 'Connecting', tone: 'progress', progress: event?.progress, detail: event?.message, canRetry: false, canCancel: true };
  }
  if (status === 'SUCCESS') return { phase: 'succeeded', label: 'Connector test succeeded', tone: 'success', canRetry: false, canCancel: false };
  if (status === 'FAILED') return { phase: 'failed', label: 'Connector test failed', tone: 'critical', detail: event?.message, canRetry: true, canCancel: false };
  return { phase: 'cancelled', label: 'Connector test cancelled', tone: 'warning', canRetry: true, canCancel: false };
}

function internalToolPhase(status: JobStatus, event?: WorkerEvent): AsyncUxSnapshot {
  if (status === 'QUEUED') return { phase: 'queued', label: 'Tool run queued', tone: 'neutral', canRetry: false, canCancel: true };
  if (status === 'RUNNING') {
    return { phase: 'running', label: 'Running tool', tone: 'progress', progress: event?.progress, detail: event?.message, canRetry: false, canCancel: true };
  }
  if (status === 'SUCCESS') return { phase: 'ready', label: 'Tool run complete', tone: 'success', canRetry: false, canCancel: false };
  if (status === 'FAILED') return { phase: 'failed', label: 'Tool run failed', tone: 'critical', detail: event?.message, canRetry: true, canCancel: false };
  return { phase: 'cancelled', label: 'Tool run cancelled', tone: 'warning', canRetry: true, canCancel: false };
}

function snapshotFromPhase(phase: AsyncUxPhase, event?: WorkerEvent): AsyncUxSnapshot {
  const labels: Record<AsyncUxPhase, string> = {
    queued: 'Queued',
    running: 'Running',
    validating: 'Validating',
    ready: 'Ready',
    failed: 'Failed',
    cancelled: 'Cancelled',
    applying: 'Applying',
    verifying: 'Verifying',
    published: 'Published',
    retrying: 'Retrying',
    succeeded: 'Succeeded',
    connecting: 'Connecting',
    blocked: 'Blocked',
    timed_out: 'Timed out',
    auth_failed: 'Auth failed',
  };
  const tone: AsyncUxTone =
    phase === 'failed' || phase === 'auth_failed' || phase === 'timed_out'
      ? 'critical'
      : phase === 'blocked' || phase === 'cancelled' || phase === 'retrying'
        ? 'warning'
        : phase === 'ready' || phase === 'published' || phase === 'succeeded'
          ? 'success'
          : phase === 'queued'
            ? 'neutral'
            : 'progress';
  return {
    phase,
    label: labels[phase],
    tone,
    progress: event?.progress,
    detail: event?.message,
    canRetry: phase === 'failed' || phase === 'auth_failed' || phase === 'timed_out',
    canCancel: phase === 'queued' || phase === 'running' || phase === 'connecting' || phase === 'validating' || phase === 'applying',
  };
}

export function resolveAsyncUxSnapshot(
  jobType: JobType,
  status: JobStatus,
  lastEvent?: WorkerEvent,
): AsyncUxSnapshot {
  switch (jobType) {
    case 'AI_GENERATE':
    case 'AI_HYDRATE':
    case 'AI_MODIFY':
    case 'THEME_ANALYZE':
      return generationPhase(status, lastEvent);
    case 'PUBLISH':
      return publishPhase(status, lastEvent);
    case 'FLOW_RUN':
      return flowPhase(status, lastEvent);
    case 'CONNECTOR_TEST':
    case 'CONNECTOR_CALL':
      return connectorTestPhase(status, lastEvent);
    case 'INTERNAL_TOOL_RUN':
      return internalToolPhase(status, lastEvent);
    default:
      if (status === 'QUEUED') return { phase: 'queued', label: 'Queued', tone: 'neutral', canRetry: false, canCancel: true };
      if (status === 'RUNNING') {
        return { phase: 'running', label: 'Running', tone: 'progress', progress: lastEvent?.progress, detail: lastEvent?.message, canRetry: false, canCancel: true };
      }
      if (status === 'SUCCESS') return { phase: 'succeeded', label: 'Succeeded', tone: 'success', canRetry: false, canCancel: false };
      if (status === 'FAILED') return { phase: 'failed', label: 'Failed', tone: 'critical', detail: lastEvent?.message, canRetry: true, canCancel: false };
      return { phase: 'cancelled', label: 'Cancelled', tone: 'warning', canRetry: true, canCancel: false };
  }
}

export function isTerminalJobStatus(status: JobStatus): boolean {
  return TERMINAL.includes(status);
}
