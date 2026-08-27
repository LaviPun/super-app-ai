import { SchemaForm, type JsonSchemaNode, type SectionUiHints } from '~/components/SchemaForm';
import { Disclosure } from './Disclosure';

/**
 * The module edit page's "Settings" tab. Job #2 for the merchant here is
 * "edit settings/config confidently" — the config form (or the "generate
 * full settings" prompt, when there's no schema yet) is the first and only
 * thing visible by default. Module metadata (name, internal notes) and the
 * destructive delete action are real but secondary/rare actions, so they're
 * tucked behind collapsed disclosures instead of sharing top-level billing
 * with the primary configure job.
 */
export function SettingsTab({
  adminConfig,
  configValue,
  onConfigChange,
  onSaveConfig,
  savingConfig,
  hydrationStatus,
  onGenerateSettings,
  generatingSettings,
  nameDraft,
  setNameDraft,
  moduleName,
  onSaveName,
  savingName,
  notesDraft,
  setNotesDraft,
  internalNotes,
  onSaveNotes,
  savingNotes,
  onDelete,
}: {
  adminConfig: { jsonSchema: unknown; uiSchema: unknown; defaults: unknown } | null;
  configValue: Record<string, unknown>;
  onConfigChange: (v: Record<string, unknown>) => void;
  onSaveConfig: () => void;
  savingConfig: boolean;
  hydrationStatus: 'none' | 'done';
  onGenerateSettings: () => void;
  generatingSettings: boolean;
  nameDraft: string;
  setNameDraft: (v: string) => void;
  moduleName: string;
  onSaveName: () => void;
  savingName: boolean;
  notesDraft: string;
  setNotesDraft: (v: string) => void;
  internalNotes: string;
  onSaveNotes: () => void;
  savingNotes: boolean;
  onDelete: () => void;
}) {
  return (
    <s-stack gap="base">
      {adminConfig ? (
        <s-section heading="Settings">
          <s-stack gap="base">
            <SchemaForm
              schema={adminConfig.jsonSchema as JsonSchemaNode}
              uiSchema={adminConfig.uiSchema as Record<string, SectionUiHints>}
              value={configValue}
              onChange={onConfigChange}
              tier="advanced"
              disabled={savingConfig}
            />
            <s-stack direction="inline">
              <s-button variant="primary" icon="check" loading={savingConfig || undefined} onClick={onSaveConfig}>
                Save settings
              </s-button>
            </s-stack>
          </s-stack>
        </s-section>
      ) : hydrationStatus === 'none' ? (
        <s-banner tone="info" heading="Generate full settings">
          <s-stack gap="small-100">
            <s-text>Let AI expand this module into a complete, validated settings schema you can fine-tune.</s-text>
            <s-stack direction="inline">
              <s-button icon="wand" loading={generatingSettings || undefined} onClick={onGenerateSettings}>
                Generate full settings
              </s-button>
            </s-stack>
          </s-stack>
        </s-banner>
      ) : null}

      <Disclosure heading="Module details" description="Name and internal notes">
        <s-stack gap="base">
          <s-grid gridTemplateColumns="1fr auto" gap="small-100" alignItems="end">
            <s-text-field label="Module name" value={nameDraft} onInput={(e) => setNameDraft(e.currentTarget.value ?? '')} />
            <s-button icon="check" loading={savingName || undefined}
              disabled={(!nameDraft.trim() || nameDraft.trim() === moduleName) || undefined}
              onClick={onSaveName}>Save</s-button>
          </s-grid>
          <s-stack gap="small-100">
            <s-text-area label="Internal notes" details="Optional — notes for your team" rows={3}
              placeholder="Notes for your team…"
              value={notesDraft} onInput={(e) => setNotesDraft(e.currentTarget.value ?? '')} />
            <s-stack direction="inline">
              <s-button icon="check" loading={savingNotes || undefined}
                disabled={notesDraft === (internalNotes ?? '') || undefined}
                onClick={onSaveNotes}>Save notes</s-button>
            </s-stack>
          </s-stack>
        </s-stack>
      </Disclosure>

      <Disclosure heading="Danger zone" description="Delete this module" tone="critical">
        <s-stack gap="small-100">
          <s-text>This removes the module and all versions. It cannot be undone.</s-text>
          <s-stack direction="inline">
            <s-button tone="critical" icon="delete" onClick={onDelete}>Delete module</s-button>
          </s-stack>
        </s-stack>
      </Disclosure>
    </s-stack>
  );
}
