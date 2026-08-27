import { useEffect, useRef } from 'react';
import { useCustomEvent } from '~/components/merchant/polaris';

/**
 * "Modify with AI" modal. Ref-driven show()/hide() (Polaris web-component
 * modal), closing via the component's `afterhide` custom event so ESC/overlay
 * dismissal stays in sync with React state.
 */
export function ModifyAiModal({
  instruction, setInstruction, options, error, generating, applyingIdx, applyBusy, onApply, onGenerate, onClose,
}: {
  instruction: string;
  setInstruction: (v: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options?: any[];
  error?: string;
  generating: boolean;
  applyingIdx: number | null;
  applyBusy: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onApply: (option: any, idx: number) => void;
  onGenerate: () => void;
  onClose: () => void;
}) {
  const modalRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    (modalRef.current as (HTMLElement & { show?: () => void }) | null)?.show?.();
  }, []);
  useCustomEvent(modalRef, 'afterhide', onClose);

  return (
    <s-modal ref={modalRef as never} heading="Modify with AI">
      <s-stack gap="base">
        <s-text color="subdued">Describe the change in plain language.</s-text>
        <s-text-area
          label="What should change?"
          rows={4}
          placeholder="e.g. Make the button green and add a quantity stepper"
          value={instruction}
          onInput={(e) => setInstruction(e.currentTarget.value ?? '')}
        />
        {error && <s-banner tone="critical">{error}</s-banner>}
        {options && options.map((o, i) => (
          <s-box key={i} border="base" borderRadius="base" padding="base">
            <s-stack gap="small-100">
              <s-grid gridTemplateColumns="1fr auto" gap="small-100" alignItems="center">
                <s-text type="strong">Option {i + 1}</s-text>
                <s-button variant="primary" icon="check"
                  loading={applyingIdx === i || undefined}
                  disabled={applyBusy || undefined}
                  onClick={() => onApply(o, i)}>
                  Apply
                </s-button>
              </s-grid>
              <s-text color="subdued">{o.explanation}</s-text>
            </s-stack>
          </s-box>
        ))}
      </s-stack>
      <s-button slot="primary-action" variant="primary" icon="wand"
        loading={generating || undefined}
        disabled={!instruction.trim() || undefined}
        onClick={onGenerate}>
        Generate options
      </s-button>
      <s-button slot="secondary-actions" onClick={onClose}>Cancel</s-button>
    </s-modal>
  );
}
