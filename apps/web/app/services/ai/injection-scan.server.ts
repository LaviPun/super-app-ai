import {
  InjectionScanResultSchema,
  PROMPT_ENVELOPE_SYSTEM_RULE,
  PromptEnvelopeSchema,
  renderPromptEnvelope,
  type InjectionMatch,
  type InjectionScanResult,
  type PromptEnvelope,
} from '@superapp/platform-contracts';

/**
 * Prompt-injection scanner + untrusted-input envelope builder (WS2 / 023).
 *
 * The scanner **flags, never hard-blocks** — it strips override attempts so the
 * merchant text stays describable-as-data, but generation always proceeds. The
 * schema-bound RecipeSpec validation downstream is the real safety net; this
 * layer just keeps obvious injections out of the prompt body.
 *
 * Contracts: {@link PromptEnvelopeSchema}, {@link InjectionScanResultSchema}
 * (source of truth: `packages/platform-contracts/src/generation-guardrails.ts`).
 */

type Pattern = {
  id: InjectionMatch['id'];
  severity: InjectionMatch['severity'];
  label: string;
  regex: RegExp;
};

/**
 * Known override-attempt families. Each match is stripped from the sanitized
 * text. Regexes are global+case-insensitive so every occurrence is removed.
 */
const PATTERNS: readonly Pattern[] = [
  {
    id: 'ignore_previous',
    severity: 'high',
    label: 'Ignore/disregard previous instructions',
    regex: /\b(?:ignore|disregard|forget|override)\b[^.\n]*\b(?:previous|prior|above|earlier|all)\b[^.\n]*\b(?:instructions?|prompts?|rules?|context)\b/gi,
  },
  {
    id: 'reveal_system_prompt',
    severity: 'high',
    label: 'Reveal/repeat the system prompt',
    regex: /\b(?:reveal|show|print|repeat|output|expose|leak)\b[^.\n]*\b(?:system|developer)\b[^.\n]*\bprompt\b/gi,
  },
  {
    id: 'override_output_format',
    severity: 'medium',
    label: 'Change the required output format',
    regex: /\b(?:respond|reply|answer|output|return)\b[^.\n]*\b(?:not|instead|only)\b[^.\n]*\b(?:json|recipespec|schema|format)\b/gi,
  },
  {
    id: 'force_raw_html',
    severity: 'medium',
    label: 'Emit raw/arbitrary HTML or scripts',
    regex: /\b(?:output|emit|return|inject|render)\b[^.\n]*\b(?:raw|arbitrary|unescaped|unsanitized)\b[^.\n]*\b(?:html|javascript|js|script|code)\b/gi,
  },
  {
    id: 'set_type_override',
    severity: 'high',
    label: 'Force a specific module "type"',
    regex: /\bset\b[^.\n]*\btype\b[^.\n]*(?:to|=|:)[^.\n]*/gi,
  },
  {
    id: 'role_or_delimiter_spoof',
    severity: 'medium',
    label: 'Spoof a role or prompt delimiter',
    regex: /(?:^|\n)\s*(?:system|assistant|developer)\s*:|<\/?(?:system|assistant|user_request)>|\[\/?(?:inst|system)\]/gi,
  },
];

/** Scan merchant text for injection patterns and return the stripped result. */
export function scanForInjection(rawText: string): InjectionScanResult {
  const matches: InjectionMatch[] = [];
  let sanitized = rawText;

  for (const pattern of PATTERNS) {
    const found = rawText.match(pattern.regex);
    if (found && found.length) {
      matches.push({
        id: pattern.id,
        severity: pattern.severity,
        label: pattern.label,
        matched: (found[0] ?? '').trim().slice(0, 120),
      });
      sanitized = sanitized.replace(pattern.regex, ' ');
    }
  }

  sanitized = sanitized.replace(/[ \t]{2,}/g, ' ').trim();

  return InjectionScanResultSchema.parse({
    flagged: matches.length > 0,
    matches,
    sanitizedText: sanitized,
    originalLength: rawText.length,
    sanitizedLength: sanitized.length,
  });
}

/** Build the untrusted-input envelope (scan + sanitized text) for a request. */
export function buildPromptEnvelope(rawText: string): PromptEnvelope {
  const scan = scanForInjection(rawText);
  return PromptEnvelopeSchema.parse({
    rawText,
    text: scan.sanitizedText,
    scan,
  });
}

/**
 * Produce the delimited block + system rule that every prompt compiler embeds
 * in place of a raw `User request: ...` line. Centralising here guarantees no
 * compiler can accidentally interpolate unwrapped merchant text.
 */
export function wrapUserRequestForPrompt(rawText: string): string {
  const envelope = buildPromptEnvelope(rawText);
  return `${PROMPT_ENVELOPE_SYSTEM_RULE}\n\n${renderPromptEnvelope(envelope)}`;
}
