export type ParsedSseMessage = {
  event: string;
  data: string;
};

export function parseSseChunk(buffer: string): { messages: ParsedSseMessage[]; remainder: string } {
  const messages: ParsedSseMessage[] = [];
  const blocks = buffer.split('\n\n');
  const remainder = blocks.pop() ?? '';

  for (const block of blocks) {
    if (!block.trim() || block.trim().startsWith(':')) continue;
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length > 0) messages.push({ event, data: dataLines.join('\n') });
  }

  return { messages, remainder };
}
