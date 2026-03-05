# UI/UX Polaris Audit Report

**Scope:** Shopify embedded app (Remix + Polaris). Evaluated against Shopify Polaris best practices, admin UX standards, and customer-friendly patterns. No Figma; audit is design-system and UX only.

---

## 1. Dashboard (`_index.tsx`)

### ✅ Correctly implemented
- Clear page title and welcome banner with contextual copy.
- Metric cards use `InlineGrid` with responsive columns (`xs: 2, sm: 3, md: 6`).
- Consistent `BlockStack`/`InlineStack` and `Text` variants (e.g. `bodySm` subdued, `headingLg` for numbers).
- Job success bar has `role="progressbar"` and `aria-valuenow`/`aria-valuemin`/`aria-valuemax`.
- Recent activity uses `DataTable` with Badge for status.
- Quick navigation uses a 4-card grid with headings and CTAs.

### ⚠️ Minor issues
- **“What you can build” tiles** (lines 257–272): Raw `div` with inline styles (`padding`, `border`, `background: #fafafa`, `#e1e3e5`) instead of Polaris `Card` or `Box` with tokens. Inconsistent with rest of app. **Impact:** Low (visual only). **Fix:** Use `Card` or `Box` with `padding="300"`, `background="bg-surface-secondary"`, and `borderRadius="200"` (or a small reusable “tile” component).
- **MiniBarChart** (lines 11–31): Inline `style` and hardcoded hex (`#2C6ECB`, `#B4E0FA`). **Impact:** Low. **Fix:** Use CSS variables (e.g. `var(--p-color-bg-fill-info)`) or Polaris tokens where applicable.
- **Day labels** (lines 176–180): `InlineStack gap="200"` with multiple `Text` spans; on small viewports labels can crowd. **Impact:** Low. **Fix:** Consider wrapping or `wrap` on very narrow widths.
- **“View details” / “View all”** (lines 204, 216): Point to `/logs`. If no `/logs` route exists in this app, links are dead. **Impact:** Medium if route missing. **Fix:** Confirm route and use `Link` + `to` for in-app nav, or `Button url` if Polaris handles it.

### ❌ Gaps
- **Recent activity:** No loading state when data is loading (loader is sync, so OK for initial load; if ever async, add `SkeletonBodyText` or Spinner).
- **Empty state:** When `recentJobs.length === 0` the whole “Recent activity” card is hidden. No empty state message (e.g. “No recent activity yet”). **Impact:** Low. **Fix:** Show card with EmptyState when `recentJobs.length === 0`.

### Recommendations
1. **High:** Replace “What you can build” custom-styled divs with Polaris `Card`/`Box` and design tokens so the section matches the rest of the dashboard and is themeable.
2. **Medium:** Add an empty state for “Recent activity” when there are no jobs (e.g. “No recent activity — runs will appear here”).
3. **Low:** Use Polaris color tokens or CSS variables in `MiniBarChart` and ensure `/logs` exists and is reachable from Dashboard.

---

## 2. Modules index (`modules._index.tsx`)

### ✅ Correctly implemented
- Create mode toggle (AI / From Template) with clear primary/secondary button states.
- AI Builder card: prompt textarea, Try chips, Selects, options grid with shimmer loading.
- Template tab: filters (search, category, type, sort), template cards, empty state when no match.
- Modules DataTable with status tabs (All / Published / Drafts), type breakdown with filter links.
- Loader error banner with dismiss; revalidation on focus and interval.
- Empty states for “No modules” and “No templates match” with next actions.

### ⚠️ Minor issues
- **Try chips** (lines 279–296): Raw `<button>` with inline styles instead of Polaris `Button variant="plain"` or `Tag`. **Impact:** Low (keyboard/focus still work). **Fix:** Use `Button variant="plain" size="slim"` or Polaris `Tag` for consistency and accessibility.
- **Prompt textarea** (lines 298–312): Raw `<textarea>` with inline styles. **Impact:** Low. **Fix:** Use Polaris `TextField` with `multiline={3}` and `autoComplete="off"` for consistent focus ring and error state.
- **Initial load** (lines 241–246): Full-page Spinner in a raw `div` when `!mounted`. **Impact:** Low. **Fix:** Prefer a page-level skeleton (e.g. `SkeletonPage` or Card skeletons) so layout is stable.
- **Template hero** (lines 416–428): Inline gradient and padding; `span style={{ color: '...' }}`. **Impact:** Low. **Fix:** Move to CSS class or Polaris-compatible tokens if you want theme alignment.
- **EmptyState** (lines 429–433, 681–684): `image=""` used everywhere. Polaris EmptyState supports an image for illustration. **Impact:** Low. **Fix:** Add a relevant image or use Polaris’ default empty illustration for consistency.
- **Modules table:** No sortable columns. **Impact:** Low for small lists. **Fix:** If list grows, add `sortable` and sort state for key columns (e.g. Updated, Name).

### ❌ Gaps
- **Create confirm modal:** No explicit “create confirm” modal in this file; creation goes through “Use this option” and then redirect. If there is a confirm step elsewhere, ensure modal has title, primary/secondary actions, and focus trap.
- **Delete module:** Delete is not on the index page in this file; it’s on module detail. So no delete modal on index — OK.

### Recommendations
1. **High:** Replace raw prompt textarea and Try chips with Polaris `TextField` (multiline) and `Button variant="plain"` or `Tag` so focus, keyboard, and errors are consistent.
2. **Medium:** Use Polaris `EmptyState` with an image (or Polaris’ empty illustration) instead of `image=""` for “No modules” and “No templates match” to improve scannability and trust.
3. **Low:** Replace initial “mounted” spinner with a skeleton layout (e.g. `SkeletonBodyText` in card shapes) to reduce layout shift.

---

## 3. Module detail (`modules.$moduleId.tsx`)

### ✅ Correctly implemented
- Page header with title, subtitle, back action, and titleMetadata (status + plan badges).
- Capability gate banner with list of reasons and “View upgrade options” CTA.
- Two-panel layout: left (config, style, AI modify, publish, version history, technical spec, danger zone), right (sticky preview).
- Preview: visual/HTML tabs, iframe for HTML, code block for JSON; no-preview state message.
- StyleBuilder and ConfigEditor in left column.
- Version list DataTable with rollback forms; Technical details modal with tabs (Compiled / RecipeSpec).
- Modify-with-AI modal: instruction field, generate, then choose option; loading and error banners.
- Publish: theme selector, refresh themes, disabled when blocked; error banner for publish failures.
- Danger zone: two-step delete (confirm state + “Yes, delete permanently”).
- Catalog info banner when applicable.

### ⚠️ Minor issues
- **Layout** (line 234): Raw `display: grid` with `gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)'` and `gap: 24`. **Impact:** Low. **Fix:** Consider `InlineGrid columns={{ xs: 1, md: 2 }}` for consistency and responsive stacking on small screens (currently no breakpoint).
- **Sticky preview** (line 322): `position: sticky; top: 16` in a raw div. **Impact:** Low. **Fix:** Use `Box` with positioning if Polaris exposes it, or keep but ensure no overflow issues in embedded iframe.
- **Preview iframe/code** (lines 393–418): Inline styles for border, height, background, font. **Impact:** Low. **Fix:** Use design tokens or a shared “code block” style for consistency.
- **Modify modal** (lines 349–424): When `modifyOptions` is set, primary action becomes “Back” (secondary). Polaris Modal expects a primary action; having only secondary “Back”/“Cancel” is OK but ensure focus goes to a safe element when modal opens.
- **Delete confirm** (lines 398–411): Inline confirmation with Banner and buttons; not a modal. **Impact:** Low. **Fix:** Consider a Modal for delete to match Connectors/Flows and improve focus management.

### ❌ Gaps
- **Responsiveness:** Two-column grid does not collapse on narrow viewports; left/right may squeeze. **Impact:** Medium on mobile. **Fix:** Stack vertically on `xs`/`sm` (e.g. preview below content).
- **Technical modal:** No loading state if compiled/spec were async; currently sync so OK.
- **Version table:** No empty state copy when `versions.length === 0` beyond “No versions yet.” — OK.

### Recommendations
1. **High:** Make the main content/preview layout responsive: single column on small screens (e.g. `InlineGrid columns={{ xs: 1, md: 2 }}`), preview below the form, and ensure touch targets and spacing remain usable.
2. **Medium:** Move “Delete module” into a Polaris `Modal` with title “Delete module”, body copy, and primary destructive + secondary Cancel, for consistency with Connectors/Flows and better focus/accessibility.
3. **Low:** Replace raw grid and sticky div with Polaris layout primitives where possible (e.g. `InlineGrid`, `Box`) to align with design tokens and future theming.

---

## 4. Connectors index (`connectors._index.tsx`)

### ✅ Correctly implemented
- Page title and subtitle; back action.
- Stats cards (Total, Tested, Untested).
- Add-connector card with form (name, base URL, API key header, API key), help text, and SSRF badge.
- DataTable for connectors with Name, Base URL, Auth, Status, Endpoints, actions (Test API, Delete).
- Empty state when no connectors, with clear next action.
- Delete confirmation modal with title, body, primary (destructive) and secondary Cancel.

### ⚠️ Minor issues
- **Delete modal** (lines 211–218): Uses `document.createElement('form')` and `innerHTML` to submit. **Impact:** Medium (security/maintainability). **Fix:** Use Remix `Form` or `useFetcher` with `method="post"` and `action` so intent and connectorId are not built via string concatenation; avoids XSS if name ever contained HTML.
- **Action error** (lines 107–111): `actionData?.error` shown in Banner; no success toast after create (redirect only). **Impact:** Low. **Fix:** Optional success Banner or toast on return from redirect so user knows “Connector added.”
- **Form:** No client-side validation for URL format (https only). **Impact:** Low if server enforces. **Fix:** Add `type="url"` and/or pattern so invalid URLs are caught earlier.

### ❌ Gaps
- **Loading:** `isSaving` shows SkeletonBodyText for the table; good. No loading state on the “Add connector” button beyond Polaris loading. **Impact:** Low.
- **Table:** No sort or filter. **Impact:** Low for typical connector count.

### Recommendations
1. **High:** Replace delete modal’s form submission with Remix `useFetcher` (or `Form` with hidden inputs) and `action`; do not build form via `innerHTML` and string interpolation.
2. **Medium:** After successful connector creation, show a short success message (e.g. Banner or Polaris toast if available) so users get clear feedback before the list updates.
3. **Low:** Add URL validation (e.g. `TextField type="url"` or pattern) for Base URL and surface server errors next to the field if present.

---

## 5. Connector detail (`connectors.$connectorId.tsx`)

### ✅ Correctly implemented
- Page with title (name), subtitle (baseUrl), back action, titleMetadata (auth badge, Tested).
- Primary action “Edit connector” opening edit modal.
- Tabs: API Tester, Saved Endpoints.
- Request card: Method select, Path with prefix, Send button; Headers (JSON), Body (JSON) for non-GET; “Save as endpoint” button.
- Response card: status Badge, headers/body in Box/code.
- Saved Endpoints table with Test/Delete; empty state Banner when no endpoints.
- Modals: Save endpoint (name + description), Delete endpoint, Edit connector (name, base URL) with Save/Cancel and loading/disabled.

### ⚠️ Minor issues
- **Path + Send** (lines 201–213): `TextField` with `connectedRight={Button}`. **Impact:** Low. **Fix:** Ensure focus order (Path → Send) and that Send is the primary action; Polaris handles this.
- **Edit modal** (lines 350–364): No explicit focus trap mentioned; Polaris Modal typically handles. **Impact:** Low.
- **Test request** (lines 86–121): Uses `fetch('/api/connectors/test')` — in embedded app this may need to be the full app origin or a route that works in embed. **Impact:** Low if API route is correct.
- **Saved Endpoints table:** Column “Status” shows last test status; no “Last tested” date in table. **Impact:** Low. **Fix:** Optional extra column for “Last tested” for clarity.

### ❌ Gaps
- **Loading:** While `testLoading` is true, only the Send button shows loading; request builder stays editable. **Impact:** Low. **Fix:** Optional: disable path/method/body during request to prevent accidental change.
- **Error state:** Test error shown in Banner; good. No retry CTA. **Impact:** Low.
- **Save endpoint modal:** No validation message if name is duplicate (if backend supports). **Impact:** Low.

### Recommendations
1. **High:** Ensure “Edit connector” and “Save as endpoint” modals get focus on open and that primary action is clearly indicated (Polaris Modal does this by default; verify in embed).
2. **Medium:** Optionally disable the request form (or show a loading overlay) while a test request is in progress to avoid conflicting edits.
3. **Low:** Add a “Last tested” column to Saved Endpoints table if the API returns it, for quicker scanning.

---

## 6. Data index (`data._index.tsx`)

### ✅ Correctly implemented
- Info banner explaining data stores.
- “Suggested Data Stores” card with predefined store cards (enable/disable, View data link).
- “Custom stores” section with Create custom store button, EmptyState when none, DataTable when present.
- Create custom store modal: Store key, Display name, Description (optional); Create/Cancel.

### ⚠️ Minor issues
- **Predefined cards** (lines 98–119): Nested `Card` inside a parent Card. **Impact:** Low. **Fix:** Ensure padding/spacing is consistent; Polaris allows nested cards but visual hierarchy should stay clear.
- **EmptyState** (lines 135–137): `image=""`. **Impact:** Low. **Fix:** Use EmptyState image for “No custom stores” if available.
- **Custom table:** Key, Label, Records, Status, actions. **Impact:** None. Good.

### ❌ Gaps
- **Loading:** No explicit loading state for enable/disable or create (fetcher handles in background). **Impact:** Low. **Fix:** Show loading on the specific button (e.g. Enable/Disable) or inline spinner while fetcher is submitting.
- **Success feedback:** After creating a custom store, modal closes and list updates via revalidation; no success Banner. **Impact:** Low. **Fix:** Optional success Banner or toast.

### Recommendations
1. **High:** Add loading indicators on Enable/Disable and “Create custom store” (e.g. button loading or inline Spinner) so users see that the action is in progress.
2. **Medium:** After creating a custom store, show a short success message so users confirm the store was added.
3. **Low:** Use Polaris EmptyState with an image for “No custom stores” for consistency with other pages.

---

## 7. Data store detail (`data.$storeKey.tsx`)

### ✅ Correctly implemented
- Page title (store label), subtitle (description/key), titleMetadata (key badge, record count).
- Records DataTable: Title, External ID, Created, Preview, actions (View, Delete).
- Empty state when no records.
- Pagination text (Page X of Y, total).
- Add record modal: Title, External ID, Payload (JSON); Add/Cancel.
- View record modal: external ID, created, payload in Box/code; Close.

### ⚠️ Minor issues
- **Add record modal** (lines 132–148): Primary “Add” has no `loading` prop when fetcher is submitting. **Impact:** Medium. **Fix:** Pass fetcher state to modal and set `loading` on primary action and optionally disable payload field during submit.
- **View record modal** (lines 151–170): No primary action; only secondary “Close”. Polaris modals often expect at least one action. **Impact:** Low. **Fix:** Consider making “Close” the primary action or adding an explicit primary for “Close” for consistency.
- **Delete from table** (line 114): Delete button calls `handleDelete(r.id)` immediately — no confirmation. **Impact:** High for accidental clicks. **Fix:** Add a confirmation modal (e.g. “Delete this record?” with Delete/Cancel) before calling delete.
- **Pagination** (lines 119–124): Only text “Page X of Y”; no Previous/Next buttons. **Impact:** Medium if many pages. **Fix:** Add pagination controls (e.g. Button “Previous”/“Next” or Polaris Pagination if available).

### ❌ Gaps
- **Table loading:** No skeleton or spinner when records are loading (e.g. on first load or after add). **Impact:** Low if loader is fast.
- **Payload validation:** Add record payload is JSON; invalid JSON is sent as `{ raw: newPayload }`. **Impact:** Low. **Fix:** Optionally validate JSON and show TextField error before submit.

### Recommendations
1. **High:** Add a confirmation modal before deleting a record (title, body, destructive Delete + Cancel) to prevent accidental data loss.
2. **Medium:** Add Previous/Next (or full pagination) controls for the records list when `totalPages > 1`, and show loading state on “Add” in the add-record modal.
3. **Low:** Validate JSON in “Payload” and show inline error; disable Add when invalid if you want strict validation.

---

## 8. Flows index (`flows._index.tsx`)

### ✅ Correctly implemented
- Page title “Workflows”, back action, primary “Create workflow”, secondary “Browse templates”.
- Empty state (no workflows): illustration, heading, copy, and CTAs (Browse templates, Create workflow).
- When workflows exist: DataTable (Name, Status, Updated, Edit).
- Schedules card: collapsible “Show schedules” / “Create schedule” / “Hide”; form for name, cron, event JSON; DataTable for schedules with Pause/Resume and Delete.
- Delete schedule modal with destructive primary and Cancel.

### ⚠️ Minor issues
- **Empty state** (lines 124–152): Custom SVG and centering in a raw `div` with inline styles. **Impact:** Low. **Fix:** Consider Polaris EmptyState with image for consistency; keep illustration as asset if needed.
- **Schedules visibility** (lines 99–100): `showSchedules` and `showCreateSchedule` are separate; user must click “Show schedules” then “Create schedule”. **Impact:** Low. **Fix:** Optional: single “Create schedule” that expands the form directly.
- **Delete modal** (lines 255–273): Same pattern as Connectors — form created via `document.createElement` and `innerHTML`. **Impact:** Medium. **Fix:** Use Remix Form/useFetcher for delete.
- **Cron help text** (line 208): Good placeholder; consider link to cron docs. **Impact:** Low.

### ❌ Gaps
- **Loading:** No skeleton for workflows or schedules when `isSaving` or revalidating. **Impact:** Low.
- **Empty schedules:** When schedules list is empty, only text “No schedules yet. Create one to automate…” — no EmptyState component. **Impact:** Low.

### Recommendations
1. **High:** Replace delete-schedule modal form submission with Remix `useFetcher` (or Form) and proper action; avoid building form via `innerHTML` and string interpolation.
2. **Medium:** Consider using Polaris EmptyState with image for the main “no workflows” state so it matches other resource index pages.
3. **Low:** Add a loading/skeleton state for the schedules table when revalidating after create/toggle/delete.

---

## 9. Billing (`billing._index.tsx`)

### ✅ Correctly implemented
- Plan banner (success when subscribed, highlight when Free) with clear copy.
- “Usage this month” card with ProgressBar per quota (AI Requests, Publish Ops, Workflow Runs, Connector Calls); tone by usage level; “Unlimited” when limit is -1.
- “Choose your plan” section with plan cards: display name, price, feature list, Current badge, Upgrade button (disabled when current).
- Skeleton for usage when `isSaving`.

### ⚠️ Minor issues
- **Section heading** (line 125): “Choose your plan” uses `Text as="h2" variant="headingLg"` outside a Card. **Impact:** Low. **Fix:** Ensure consistent spacing (e.g. BlockStack gap) from the previous Divider and the card grid.
- **Plan cards:** No loading state on individual “Upgrade” buttons (only global `isSaving`). **Impact:** Low. **Fix:** Disable all upgrade buttons when any submit is in progress if not already.
- **Error handling:** Action can return `json({ error })` on failure; not shown in this file. **Impact:** Medium. **Fix:** In loader/action return or via useActionData, show error Banner when subscription creation fails.

### ❌ Gaps
- **Action error:** No `useActionData` to display `error` from action (e.g. when createSubscription throws). **Impact:** High for failed upgrades. **Fix:** Use action data and render a critical Banner when `actionData?.error`.
- **Success after redirect:** After successful upgrade redirect, no “Plan updated” message. **Impact:** Low. **Fix:** Optional query param or session flash for “Subscription updated.”

### Recommendations
1. **High:** Add `useActionData` and display `actionData?.error` in a critical Banner so users see why an upgrade failed (e.g. payment or API error).
2. **Medium:** After successful redirect from checkout/confirmation, show a success Banner or toast so users know the plan changed.
3. **Low:** Disable all “Upgrade” buttons when `isSaving` to prevent double submission.

---

## 10. Settings (`settings._index.tsx`)

### ✅ Correctly implemented
- Account overview card: store domain, plan, modules/connectors/schedules counts.
- Data retention card: form with Default, AI, API, Error logs retention (days); Save button; success Banner on save.
- Preferences card: placeholder copy and link to Billing.
- Danger zone card: disabled “Delete all modules” and “Purge logs” with explanation.

### ⚠️ Minor issues
- **Back action** (line 94): “Home” instead of “Dashboard” (Dashboard uses “Dashboard”). **Impact:** Low. **Fix:** Use “Dashboard” and same URL as elsewhere for consistency.
- **Link component** (lines 212–214): Custom `Link` that renders `<a href={to} style={{ color: '#2C6ECB' }}>`. This bypasses Remix navigation and can break embedded app (full reload instead of in-app navigation). **Impact:** High in embedded context. **Fix:** Import `Link` from `@remix-run/react` and use it for `/billing` (and any other in-app links).
- **Preferences** (line 176): `<Link to="/billing">` uses the local `Link`; same issue. **Impact:** High. **Fix:** Use Remix `Link` so navigation stays inside the app.

### ❌ Gaps
- **Action error:** No display of action error when intent is unknown or save fails. **Impact:** Medium. **Fix:** Use actionData and show error Banner when present.
- **Retention validation:** No min/max or validation message for days (e.g. 1–365). **Impact:** Low if server validates.

### Recommendations
1. **High:** Replace the custom `Link` with Remix `Link` from `@remix-run/react` for the Billing link (and any other in-app links) so embedded app navigation and focus are preserved.
2. **Medium:** Use “Dashboard” for the back action and ensure Settings is reachable from a consistent nav; add error Banner when action returns an error.
3. **Low:** Add simple validation or help text for retention days (e.g. “1–365 or leave blank to inherit”).

---

## 11. StyleBuilder (`StyleBuilder.tsx`)

### ✅ Correctly implemented
- Card with heading “Style Builder” and “Changes create a new draft version”.
- Tabs: Basic, Advanced, Custom CSS; content per tab.
- Basic: Colors (text, background, button, backdrop), Typography (size, weight, align), Spacing & Shape, Responsive visibility (checkboxes).
- Advanced: Layout & Positioning, Advanced Spacing, Border & Shadow, Line height, Accessibility (focus ring, reduced motion).
- Custom CSS: warning Banner, TextField with character count and error, list of CSS variables.
- Save button with loading; success/error feedback (text tone).
- Type-specific config (e.g. which controls show per module type) is well structured.

### ⚠️ Minor issues
- **HexField** (lines 298–316): Small color swatch div with inline styles (`width`, `height`, `border`, `backgroundColor`). **Impact:** Low. **Fix:** Use Polaris `Box` or design tokens for border/background if available.
- **Custom CSS Banner** (lines 483–491): Uses `code` for class names; good. **Impact:** None.
- **Save feedback** (lines 516–521): Success/error shown as inline Text with tone; no Banner. **Impact:** Low. **Fix:** Optional: use Banner for errors so they’re more visible and dismissible.

### ❌ Gaps
- **Accessibility:** Tabs and form controls are Polaris; ensure Custom CSS textarea has sufficient label and that color swatch has an accessible name if it’s meaningful. **Impact:** Low.
- **Responsiveness:** InlineStack with `wrap` used; good. No specific mobile tweaks. **Impact:** Low.

### Recommendations
1. **High:** Keep current structure; consider showing save errors in a dismissible Banner above the Save button so they’re hard to miss.
2. **Medium:** Use design tokens or Polaris Box for HexField swatch border/background so it respects theme.
3. **Low:** Ensure “Style Builder” card is in a logical focus order after ConfigEditor and before Publish.

---

## 12. ConfigEditor (`ConfigEditor.tsx`)

### ✅ Correctly implemented
- Card “Module settings” with optional Saved/Error badges.
- Module name TextField.
- Content & configuration section with type-specific fields (text, url, textarea, number, boolean, select, readonly) rendered from CONFIG_FIELDS.
- Save button with loading and disabled when no changes.
- Error Banner when fetcher returns error.
- Divider between name and config block.

### ⚠️ Minor issues
- **Badge for “Saved”** (line 283): Shown when `fetcher.data?.ok`; it stays until next save or error. **Impact:** Low. **Fix:** Optional: clear or auto-hide “Saved” after a few seconds so it doesn’t look like a permanent state.
- **Layout:** Fields are stacked in a single BlockStack; long forms (e.g. theme.popup) scroll. **Impact:** Low. **Fix:** Optional: group related fields in sub-cards or collapsible sections for very long configs.

### ❌ Gaps
- **Validation:** No client-side validation (e.g. URL format, max length) beyond maxLength on TextField. **Impact:** Low if server validates.
- **Required fields:** No visual indication of required vs optional beyond helpText. **Impact:** Low.

### Recommendations
1. **High:** None critical; component is clear and consistent.
2. **Medium:** For module types with many fields (e.g. popup), consider grouping (e.g. “Trigger & timing”, “Content”, “Buttons”) with subheadings or collapsible sections to improve scannability.
3. **Low:** Add inline validation for URLs and required fields where applicable, and surface server validation errors next to the relevant field if the API returns them.

---

## Cross-cutting summary

| Area | Finding |
|------|--------|
| **Visual hierarchy** | Generally good: headings (headingMd/headingSm), subdued body, Badges. A few sections use raw divs and inline styles (Dashboard tiles, Template hero, Flows empty illustration). |
| **Spacing** | BlockStack/InlineGrid gaps (200, 300, 400, 500) used consistently. A few raw `gap: 24` or padding in px. |
| **Typography** | Polaris variants used (bodySm, bodyMd, headingLg, etc.); tone="subdued" where appropriate. |
| **Empty states** | Many use `EmptyState` with `image=""`; copy and next actions are clear. Adding images would improve consistency. |
| **Loading** | SkeletonBodyText or Spinner used on index pages; some modals/buttons lack loading (e.g. Data store Add, Connector detail). |
| **Error states** | Banners used for loader/action/fetcher errors; Billing action error not displayed; Settings action error not displayed. |
| **Modals** | Generally have title, primary/secondary actions; Connectors and Flows delete modals use innerHTML form submit (should use fetcher). |
| **Tables** | DataTable used consistently; no sortable columns; row actions (View, Delete, etc.) clear. |
| **Forms** | Labels, help text, and validation feedback present in most places; a few raw inputs (Dashboard, Modules prompt/chips). |
| **Buttons** | Primary/secondary/plain and destructive used appropriately; loading state sometimes missing on modal primary actions. |
| **Accessibility** | Progress bar has ARIA; Polaris components handle focus. Ensure Remix Link in Settings and no custom focus traps that conflict with Polaris. |
| **Responsiveness** | InlineGrid breakpoints (xs, sm, md) used; Module detail two-column layout does not stack on small screens. |
| **Polaris usage** | Mostly Polaris; exceptions: raw textarea/buttons (Modules), raw divs (Dashboard tiles, Template hero), inline styles in several places. |

---

## Top 5 app-wide recommendations

1. **Use Remix Link in Settings** and fix Connectors/Flows delete flows to use `useFetcher` (or Form) instead of building forms with `innerHTML`.
2. **Show Billing action errors** via `useActionData` and a critical Banner so upgrade failures are visible.
3. **Replace custom-styled “What you can build” tiles and Modules prompt/chips** with Polaris components (Card/Box, TextField, Button/Tag) for consistency and accessibility.
4. **Add delete confirmation modal** on Data store detail before deleting a record, and add loading state on “Add record” primary action.
5. **Make Module detail layout responsive** (stack preview below content on small screens) and consider moving module delete into a Modal for consistency.

---

*End of audit. No code changes were made; this document is for evaluation and prioritization only.*
