import type { RouterRuntimeTarget } from '~/schemas/router-runtime-config.server';

export type AssistantProbeSnapshot = {
  health: { ok: boolean; message: string };
  chatProbe: { ok: boolean; message: string };
};

export type AssistantReadinessTone = 'good' | 'warn' | 'bad';

export type AssistantReadinessSummary = {
  tone: AssistantReadinessTone;
  headline: string;
  detail: string;
  diagnostics: {
    active: { health: string; chat: string };
    standby?: { health: string; chat: string };
  };
  active: {
    target: RouterRuntimeTarget;
    label: string;
    health: AssistantProbeSnapshot['health'];
    chatProbe: AssistantProbeSnapshot['chatProbe'];
  };
  standby?: {
    target: RouterRuntimeTarget;
    label: string;
    health: AssistantProbeSnapshot['health'];
    chatProbe: AssistantProbeSnapshot['chatProbe'];
  };
};

type BuildReadinessInput = {
  activeTarget: RouterRuntimeTarget;
  assistantLocalOnly: boolean;
  probes: Record<RouterRuntimeTarget, AssistantProbeSnapshot>;
};

function targetLabel(target: RouterRuntimeTarget): string {
  return target === 'localMachine' ? 'Local' : 'Cloud';
}

function deriveReadinessTone(probe: AssistantProbeSnapshot): AssistantReadinessTone {
  if (!probe.health.ok) return 'bad';
  if (!probe.chatProbe.ok) return 'warn';
  return 'good';
}

function deriveHeadline(target: string, probe: AssistantProbeSnapshot): string {
  if (!probe.health.ok) return `${target} unavailable`;
  if (!probe.chatProbe.ok) return `${target} chat blocked`;
  return `${target} ready`;
}

function deriveDetail(probe: AssistantProbeSnapshot): string {
  if (!probe.health.ok) return 'Connection check failed.';
  if (!probe.chatProbe.ok) return 'Connection is up, but chat is not ready.';
  return 'Connected and ready for prompts.';
}

export function buildAssistantReadinessSummary(
  input: BuildReadinessInput,
): AssistantReadinessSummary {
  const activeTarget = input.activeTarget;
  const standbyTarget: RouterRuntimeTarget | null = input.assistantLocalOnly
    ? null
    : activeTarget === 'localMachine'
      ? 'modalRemote'
      : 'localMachine';
  const activeLabel = targetLabel(activeTarget);
  const activeProbe = input.probes[activeTarget];
  const standbyProbe = standbyTarget ? input.probes[standbyTarget] : null;

  const headline = deriveHeadline(activeLabel, activeProbe);
  const detail = deriveDetail(activeProbe);
  const summary: AssistantReadinessSummary = {
    tone: deriveReadinessTone(activeProbe),
    headline,
    detail,
    diagnostics: {
      active: {
        health: activeProbe.health.message,
        chat: activeProbe.chatProbe.message,
      },
    },
    active: {
      target: activeTarget,
      label: activeLabel,
      health: activeProbe.health,
      chatProbe: activeProbe.chatProbe,
    },
  };

  if (standbyTarget && standbyProbe) {
    summary.diagnostics.standby = {
      health: standbyProbe.health.message,
      chat: standbyProbe.chatProbe.message,
    };
    summary.standby = {
      target: standbyTarget,
      label: targetLabel(standbyTarget),
      health: standbyProbe.health,
      chatProbe: standbyProbe.chatProbe,
    };
  }

  return summary;
}
