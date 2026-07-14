import { describe, expect, it } from 'vitest';
import { tokenizeMdLite, type MdLiteToken } from '~/routes/internal.ai-assistant';

describe('tokenizeMdLite', () => {
  it('returns a single text token for plain text', () => {
    expect(tokenizeMdLite('hello world')).toEqual<MdLiteToken[]>([
      { type: 'text', value: 'hello world' },
    ]);
  });

  it('parses **bold** into a bold token with text children', () => {
    expect(tokenizeMdLite('a **b** c')).toEqual<MdLiteToken[]>([
      { type: 'text', value: 'a ' },
      { type: 'bold', children: [{ type: 'text', value: 'b' }] },
      { type: 'text', value: ' c' },
    ]);
  });

  it('parses `code` into a code token', () => {
    expect(tokenizeMdLite('run `npm test` now')).toEqual<MdLiteToken[]>([
      { type: 'text', value: 'run ' },
      { type: 'code', value: 'npm test' },
      { type: 'text', value: ' now' },
    ]);
  });

  it('supports code nested inside bold (sequential-replace parity)', () => {
    expect(tokenizeMdLite('**a `b` c**')).toEqual<MdLiteToken[]>([
      {
        type: 'bold',
        children: [
          { type: 'text', value: 'a ' },
          { type: 'code', value: 'b' },
          { type: 'text', value: ' c' },
        ],
      },
    ]);
  });

  it('emits a br token per newline (blank line = two brs)', () => {
    expect(tokenizeMdLite('a\nb')).toEqual<MdLiteToken[]>([
      { type: 'text', value: 'a' },
      { type: 'br' },
      { type: 'text', value: 'b' },
    ]);
    expect(tokenizeMdLite('a\n\nb')).toEqual<MdLiteToken[]>([
      { type: 'text', value: 'a' },
      { type: 'br' },
      { type: 'br' },
      { type: 'text', value: 'b' },
    ]);
  });

  it('treats raw HTML / script as literal text (no markup tokens)', () => {
    expect(tokenizeMdLite('<script>alert(1)</script>')).toEqual<MdLiteToken[]>([
      { type: 'text', value: '<script>alert(1)</script>' },
    ]);
    expect(tokenizeMdLite('a & <b> tag')).toEqual<MdLiteToken[]>([
      { type: 'text', value: 'a & <b> tag' },
    ]);
  });

  it('leaves an unterminated marker as literal text', () => {
    expect(tokenizeMdLite('**oops')).toEqual<MdLiteToken[]>([
      { type: 'text', value: '**oops' },
    ]);
    expect(tokenizeMdLite('a `code')).toEqual<MdLiteToken[]>([
      { type: 'text', value: 'a `code' },
    ]);
  });

  it('parses a fenced code block into a single codeblock token (language tag dropped)', () => {
    const src = 'Draft:\n```json\n{\n  "type": "STOREFRONT_UI"\n}\n```\ndone';
    expect(tokenizeMdLite(src)).toEqual<MdLiteToken[]>([
      { type: 'text', value: 'Draft:' },
      { type: 'br' },
      { type: 'codeblock', value: '{\n  "type": "STOREFRONT_UI"\n}' },
      { type: 'br' },
      { type: 'text', value: 'done' },
    ]);
  });

  it('keeps fenced-block content as literal text — markup never becomes tokens (injection safety)', () => {
    const src = '```\n<script>alert(1)</script>\n```';
    expect(tokenizeMdLite(src)).toEqual<MdLiteToken[]>([
      { type: 'codeblock', value: '<script>alert(1)</script>' },
    ]);
  });

  it('handles an unterminated fence by consuming the rest as a code block', () => {
    expect(tokenizeMdLite('```\nline1\nline2')).toEqual<MdLiteToken[]>([
      { type: 'codeblock', value: 'line1\nline2' },
    ]);
  });
});
