# UI/UX Refinement Summary

Summary of iterative screenshot-analyze-improve cycles applied to the Shopify embedded app (Remix + Polaris) for industry-leading, customer-friendly UI/UX.

## Design Goals Applied

- **Customer-friendly:** Clear labels, helpful empty/error states, obvious next steps.
- **Industry-leading:** Consistent spacing (Polaris tokens), clear hierarchy, minimal clutter.
- **Polaris-first:** Page, Card, BlockStack, InlineGrid, Banner, DataTable, Modal, Text, Badge, Button, Box. Replaced one-off inline styles with Polaris layout and tokens where it improved consistency.
- **Cards:** Consistent padding (`padding="400"`) and radius (app-wide 12px via `app.css`), clear section titles.
- **Modals:** Clear titles, primary action on the right, cancel/secondary obvious, loading state on submit.
- **Tables:** Readable columns, clear row actions, empty state with CTA.

---

## Priority 1 – High-Traffic Pages

### 1. Dashboard (`_index.tsx`)

**Changes:**

- **Welcome banner:** Added primary CTA "Create a module" and clearer copy (plan + next step). Wrapped body in BlockStack.
- **Overview metrics:** Section title "Overview"; metric cards use `Card padding="400"`, `BlockStack gap="200"`, `headingXl` for numbers; grid `gap="400"`.
- **Activity (charts):** Section title "Activity"; chart cards use `padding="400"`, `headingSm` for card titles; day labels in InlineStack with Box for alignment; job success bar copy "View logs" and "·" separator.
- **Recent activity:** Card with padded header; empty state when no jobs (message + "Set up flows" link); "View all logs" button.
- **What you can build:** Section title; tiles use Polaris `Box` with `padding="300"`, `background="bg-surface-secondary"`, `borderRadius="200"` instead of inline styles; CTA "Create a module" and "Shopify docs".
- **Quick links:** Section title "Quick links"; cards `padding="400"`, primary CTA on Modules ("Go to modules"), secondary on others with descriptive labels ("Manage connectors", "Manage flows", "View logs").

### 2. Modules Index (`modules._index.tsx`)

**Changes:**

- **Create mode:** Replaced two buttons with Tabs ("Generate with AI" | "From template") and section heading "Create a module".
- **AI Builder card:** `Card padding="400"`; header with "Edit prompt" / "Start fresh"; collapsed prompt summary uses `Box` with Polaris tokens; full form uses `TextField` (multiline) with helpText; "Example prompts" as `Button variant="tertiary"` (slim) instead of raw buttons; section spacing `gap="400"`.
- **Template section:** Replaced gradient hero div with `Card padding="500"` and clear "Module templates" heading + description; template cards `padding="400"`; empty state uses `Text as="p" tone="subdued"`.
- **Your modules:** Section title "Your modules"; stats cards `padding="400"`, `headingXl`.
- **Modules table:** Card with `padding="0"`, Tabs in padded Box, table/empty state in padded Box; EmptyState with `action` (Create a module) and BlockStack/Text; row action "View" as `variant="plain"`.
- **By type:** Existing card retained; table layout unchanged.

### 3. Module Detail (`modules.$moduleId.tsx`)

**Changes:**

- **Layout:** Two-panel grid uses `var(--p-space-400)` for gap; sticky preview uses `var(--p-space-400)` for top.
- **Stats bar:** All four cards `padding="400"`, `BlockStack gap="200"`, grid `gap="400"`.
- **Left column cards:** Config/Style (unchanged). Modify with AI, Publish, Version history, Technical details, Danger zone: all `Card padding="400"`.
- **Preview card:** `Card padding="400"`, "Live preview" heading `fontWeight="semibold"`. Visual preview: `Box` with `borderRadius="300"`, `borderWidth="025"`, `borderColor="border"`, `minHeight="520px"`, `background="bg-surface-secondary"`. HTML/JSON preview: `Box` with `padding="400"`, `background="bg-surface-secondary"`, `borderRadius="300"`, `minHeight`/`maxHeight="520px"`, `overflow="auto"`, monospace via `var(--p-font-mono)`. No-preview state: `Box` with padding and two-line message ("No preview available…" + "Publish to a theme…").

---

## Priority 2 – Supporting Pages (One Pass Each)

### 4. Connectors Index (`connectors._index.tsx`)

**Changes:**

- **Overview:** Section title "Overview"; stats cards `padding="400"`, `BlockStack gap="200"`, `headingXl`.
- **Add connector:** Card `padding="400"`.
- **Configured connectors:** Card `padding="400"`, heading `fontWeight="semibold"`, EmptyState body with `Text as="p" tone="subdued"`.
- **Delete modal:** Unchanged (already clear title, primary destructive, secondary Cancel).

### 5. Data Index (`data._index.tsx`)

**Changes:**

- **Suggested data stores:** Card `padding="400"`, heading "Suggested data stores" with `fontWeight="semibold"`, `BlockStack gap="400"`.
- **Empty state (custom stores):** `Text as="p" tone="subdued"`.

### 6. Flows Index (`flows._index.tsx`)

**Changes:**

- **Empty state (no workflows):** Card `padding="500"`.
- **Workflow list:** Card `padding="400"`, BlockStack `gap="400"`.
- **Schedules:** Card `padding="400"`, BlockStack `gap="400"`, heading "Schedules" with `fontWeight="semibold"`.

### 7. Billing & Settings

- **Not modified** in this pass. Recommended next: usage display (Polaris layout), plan cards (consistent padding/headings), retention form (clear primary/secondary actions).

---

## Recommended Follow-ups

- **Connectors detail:** API Tester UI and endpoints table: consistent Card/Box padding, empty states with CTAs.
- **Data store detail:** Records table and add/view record modals: primary action on the right, loading state on submit.
- **Flows:** Create/toggle/delete schedule modals: confirm copy and button order.
- **Billing/Settings:** One cycle for usage, plan cards, and retention form.
- **Polaris Card:** Verify `padding` prop is supported in the version in use; if not, use inner `Box padding="400"` for consistent spacing.
- **EmptyState `action`:** Confirm Polaris EmptyState supports `action: { content, url }`; if not, use a separate Button below.

---

## Verification

- **Build:** `npm run build` (apps/web) succeeds.
- **Lint:** `npm run lint` failed with environment error (`util.styleText is not a function` in ESLint stylish formatter), not due to code changes.
- **Pre-existing:** `data-store.service.ts` duplicate `listRecords` (unrelated); Polaris CSS minify warning for `@media (--p-breakpoints-md-up) and print` (upstream).
