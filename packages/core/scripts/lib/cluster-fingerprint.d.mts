export function blankStrings(obj: unknown, keyHint?: string): unknown;
export function fingerprintKey(entry: { spec: { type: string; config: unknown } }): string;
export function nameDescriptionSimilarity(
  a: { name: string; description: string },
  b: { name: string; description: string },
): number;
export function findClusters<
  T extends { id: string; file: string; name: string; description: string; spec: { type: string; config: unknown } },
>(templatesWithFile: T[], similarityThreshold?: number): T[][];
