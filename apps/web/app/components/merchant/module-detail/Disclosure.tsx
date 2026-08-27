import { useState, useId } from 'react';
import type { ReactNode } from 'react';

/**
 * Progressive-disclosure section: a bordered card whose body is collapsed by
 * default (or via `defaultOpen`). Used on the module edit page to keep
 * secondary/advanced content (metadata, danger zone) out of the primary
 * reading path — see DESIGN.md "Motion" for the transition timing and
 * apps/web/app/styles/merchant.css (`.sa-m-disclosure-*`) for styling.
 *
 * Native <button> trigger (not `s-button`) so focus/keyboard behavior is
 * plain and predictable, and content is only mounted while open so closed
 * sections carry no hidden DOM weight.
 */
export function Disclosure({
  heading,
  description,
  tone,
  defaultOpen = false,
  children,
}: {
  heading: string;
  description?: string;
  tone?: 'critical';
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  return (
    <div className={`sa-m-disclosure${tone === 'critical' ? ' sa-m-disclosure--critical' : ''}`}>
      <button
        type="button"
        className="sa-m-disclosure-head"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="sa-m-disclosure-head-text">
          <s-text type="strong">{heading}</s-text>
          {description ? <s-text color="subdued">{description}</s-text> : null}
        </span>
        <s-icon type={open ? 'chevron-up' : 'chevron-down'} size="small" />
      </button>
      {open && (
        <div id={bodyId} className="sa-m-disclosure-body">
          {children}
        </div>
      )}
    </div>
  );
}
