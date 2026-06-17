/**
 * Bounded-concurrency task pool with race-order settlement.
 *
 * Deliberately tiny and dependency-free — the workflow engine's pool is
 * tenant-scoped and far heavier than the tournament needs. Each task runs at
 * most `concurrency` at a time; `onSettled` fires as each one finishes (in
 * completion order, not submission order) so a CLI can stream live progress.
 */
export async function runPooled<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
  onSettled?: (result: T, index: number) => void,
): Promise<T[]> {
  const limit = Math.max(1, Math.min(concurrency, tasks.length || 1));
  const results: T[] = new Array(tasks.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = next++;
      const task = tasks[index];
      if (!task) return;
      const result = await task();
      results[index] = result;
      onSettled?.(result, index);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}
