export function blankStrings(obj: unknown): unknown;
export function fingerprintKey(entry: { spec: { type: string; config: unknown } }): string;
export function findClusters<T extends { id: string; spec: { type: string; config: unknown } }>(
  templates: T[],
): T[][];
