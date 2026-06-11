export function toSseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function writeSseReady(reply: { raw: { write: (chunk: string) => void } }): void {
  reply.raw.write(':ready\n\n');
}
