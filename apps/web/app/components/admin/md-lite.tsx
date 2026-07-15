/**
 * MdLite — a safe, lightweight inline-markdown renderer shared across internal
 * admin surfaces (AI assistant, Support CRM). Model/agent output is never
 * treated as HTML: every token maps to a real React node, so `<script>` and
 * any other markup surface as literal text. No `dangerouslySetInnerHTML`.
 *
 * Supports `**bold**`, `` `code` ``, newlines, and ``` fenced code blocks.
 * Extracted from internal.ai-assistant.tsx so multiple routes can reuse it.
 */

/**
 * Lightweight inline-markdown token. `bold` may contain `text`/`code` children
 * (matching the old sequential `**bold**` then `` `code` `` replace order).
 * Rendered as real React nodes — model output is never treated as HTML, so
 * `<script>` and any other markup surface as literal text.
 */
export type MdLiteInline = { type: 'text'; value: string } | { type: 'code'; value: string };
export type MdLiteToken =
  | MdLiteInline
  | { type: 'bold'; children: MdLiteInline[] }
  | { type: 'br' }
  | { type: 'codeblock'; value: string };

/** Split a single line (no newlines) into `text`/`code` inline tokens. */
function tokenizeInlineCode(line: string): MdLiteInline[] {
  const out: MdLiteInline[] = [];
  const re = /`([^`]+)`/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(line)) !== null) {
    if (match.index > last) out.push({ type: 'text', value: line.slice(last, match.index) });
    out.push({ type: 'code', value: match[1] ?? '' });
    last = re.lastIndex;
  }
  if (last < line.length) out.push({ type: 'text', value: line.slice(last) });
  return out;
}

/** Parse a single line into inline tokens, resolving `**bold**` then `` `code` ``. */
function tokenizeLine(line: string): MdLiteToken[] {
  const out: MdLiteToken[] = [];
  const re = /\*\*([^]+?)\*\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(line)) !== null) {
    if (match.index > last) out.push(...tokenizeInlineCode(line.slice(last, match.index)));
    out.push({ type: 'bold', children: tokenizeInlineCode(match[1] ?? '') });
    last = re.lastIndex;
  }
  if (last < line.length) out.push(...tokenizeInlineCode(line.slice(last)));
  return out;
}

/** True when a line opens/closes a ``` fenced code block (language tag ignored). */
function isFenceLine(line: string): boolean {
  return line.trimStart().startsWith('```');
}

/**
 * Tokenize the lightweight markdown the assistant emits (`**bold**`, `` `code` ``,
 * newlines, and ``` fenced code blocks) into a flat token list. Pure + unit-tested;
 * the renderer maps each token to a React element so nothing is ever injected as
 * HTML — fenced-block content becomes a plain text node inside `<pre><code>`, so a
 * `<script>` (or any markup) in a drafted RecipeSpec surfaces as literal text.
 */
export function tokenizeMdLite(s: string): MdLiteToken[] {
  const lines = s.split('\n');
  const out: MdLiteToken[] = [];
  let i = 0;
  let unit = 0; // line-unit index (a normal line OR a whole code block)
  while (i < lines.length) {
    if (unit > 0) out.push({ type: 'br' });
    if (isFenceLine(lines[i]!)) {
      const body: string[] = [];
      i += 1; // consume the opening fence
      while (i < lines.length && !isFenceLine(lines[i]!)) {
        body.push(lines[i]!);
        i += 1;
      }
      if (i < lines.length) i += 1; // consume the closing fence, if any
      out.push({ type: 'codeblock', value: body.join('\n') });
    } else {
      out.push(...tokenizeLine(lines[i]!));
      i += 1;
    }
    unit += 1;
  }
  return out;
}

function renderInline(token: MdLiteInline, key: number) {
  if (token.type === 'code') return <code key={key}>{token.value}</code>;
  return <span key={key}>{token.value}</span>;
}

/** Render assistant/tool text as safe React nodes (replaces the old HTML string). */
export function MdLite({ text }: { text: string }) {
  const tokens = tokenizeMdLite(text);
  return (
    <>
      {tokens.map((token, i) => {
        if (token.type === 'br') return <br key={i} />;
        if (token.type === 'codeblock') {
          return (
            <pre key={i} className="asst-codeblock">
              <code>{token.value}</code>
            </pre>
          );
        }
        if (token.type === 'bold') {
          return <b key={i}>{token.children.map((child, ci) => renderInline(child, ci))}</b>;
        }
        return renderInline(token, i);
      })}
    </>
  );
}
