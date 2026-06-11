export type WorkerLogger = {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
};

export const consoleWorkerLogger: WorkerLogger = {
  info(message, context) {
    console.info(`[workers] ${message}`, context ?? {});
  },
  warn(message, context) {
    console.warn(`[workers] ${message}`, context ?? {});
  },
  error(message, context) {
    console.error(`[workers] ${message}`, context ?? {});
  },
};
