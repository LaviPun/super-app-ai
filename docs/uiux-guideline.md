# Super App AI for Shopify — UI/UX Guidelines

> Scope: Shopify **Admin app** (embedded) + **Internal developer dashboard** + **Customer Account UI** (extensions) + AI workflows (prompt → preview → publish).
> Design baseline: **Shopify Polaris** for Admin UI. Customer Account extensions use Shopify UI Extensions components.

---

## 1) Product Design Principles (Non-Negotiables)

1. **Clarity > cleverness**
   - Every screen answers: *What is this? What can I do? What happens next?*
2. **Consistency**
   - Same components, same placements, same copy patterns across the app.
3. **Fast feedback**
   - Every action has visible response: loading → success/error → next step.
4. **Progressive disclosure**
   - Show 20% settings that solve 80% needs; advanced controls behind "More".
5. **Safe automation**
   - AI suggestions must be reviewable and reversible (undo, versions, rollback).
6. **Accessibility-first**
   - Target WCAG AA. Keyboard-first in Admin.

---

## 2) Core IA (Information Architecture)

### Primary nav (current)
- **Home** (AI Builder + Module list)
- **Connectors** (Integrations)
- **Flows** (Automation schedules)
- **Billing** (Plan & usage)

### Internal admin nav
- **Dashboard** (stats overview)
- **AI Providers** / **Usage & Costs** / **Error Logs** / **API Logs** / **Stores** / **Jobs**

### Rules
- Keep top-level items **≤ 7**.
- Use Shopify mental model: lists → details → actions.
- Every sub-page must have a **back action** to its parent.

---

## 3) Key Workflows (Golden Paths)

### A) AI Create → Preview → Publish (Primary flow)
1. Describe what you want (prompt on Home page)
2. AI generates RecipeSpec JSON (module draft)
3. Preview in embedded iframe (Desktop)
4. Adjust via Style Builder (quick controls + advanced)
5. Publish to theme or app embed
6. Verify: status + version history + rollback

### B) Manage → Iterate
- Module list → open module → edit style → version history → republish.

### C) Connect → Automate
- Add connectors → create flow schedules → monitor in Jobs.

---

## 4) Layout System (Admin App)

### Spacing & grid
- Use an **8px spacing system** (Polaris gap="100" to "800").
- Prefer **single-column forms** (readability).
- Use **Card sections** with clear headings.

### Page structure standard
- **Title bar**
  - Title + back action + primary CTA
- **Body**
  - Cards with logical sections
- **Footer**
  - Save / Publish actions (only if needed and consistent)

### Responsive behavior
- Admin app must work at narrow widths (split view).
- Collapse multi-column layouts to stacked.

---

## 5) Typography & Copy

### Tone
- Clear, confident, supportive.
- No blame language.

### Writing rules
- Buttons: verb-first (Create, Generate, Preview, Publish, Save)
- Labels: sentence case (e.g., "Button label", not "BUTTON LABEL")
- Helper text: explain **why** + **what happens**.

### Microcopy patterns
- **Success**: "Published. It may take a few minutes to appear on the storefront."
- **Error**: "We couldn't publish because X. Fix Y and try again."
- **Empty**: "No modules yet. Generate your first module to get started."

---

## 6) Components & Patterns (Admin)

### Buttons
- **One primary CTA per screen area**
- Destructive actions require confirmation modal (explain impact).

### Forms
- Labels always visible (don't rely on placeholders).
- Inline validation after blur; on submit, focus first invalid field.
- Show loading state on submit buttons.

### Lists & tables (Library / Connectors / Flows)
- Use `DataTable` for structured data.
- Provide clear empty states with CTA ("Create your first module").
- Show count in section heading.

### Modals
- Use for confirmations and short tasks only.
- Avoid multi-step creation inside modals.

### Notifications
- Toast: quick success after save/publish/delete
- Banner: important warnings/errors requiring attention

---

## 7) State Design (Must Have for Every Feature)

For every screen + component define:
- **Loading** (skeleton or spinner; use `useNavigation` state)
- **Empty** (statement + 1 CTA + optional help text)
- **Error** (what happened + how to fix, using Banner)
- **Success** (toast or inline confirmation + next step)
- **Disabled** (why disabled, using tooltip or help text)

---

## 8) Accessibility Checklist (Must-Pass)

- Full keyboard navigation (Tab order logical)
- Visible focus ring
- Semantic headings (H1/H2/H3)
- Every input has label + helper + error association
- Contrast meets AA
- No color-only meaning
- Reduced motion respected
- Touch targets large enough (storefront)

---

## 9) AI UX Standards

### AI reliability expectations
- Always show **what the AI generated** (spec preview).
- Provide **version history** and **rollback**.
- Store versions for audit trail.

### Transparency
- Show module type, category, and plan requirements.
- Show capability gates with clear upgrade path.

---

## 10) Storefront UI System (Merchant Customization With Guardrails)

### Token-based design (no free-form chaos)
Provide controls as **presets + scales** (implemented in StyleBuilder):
- Layout: mode (inline/overlay/sticky/floating), anchor, width
- Spacing: padding/gap/margin (none/tight/medium/loose)
- Typography: size (XS–2XL), weight, align, line-height
- Radius: none/sm/md/lg/xl/full
- Shadow: none/sm/md/lg
- Colors: roles only (text, background, buttonBg, buttonText, border, backdrop)
- Responsive: hide on mobile / hide on desktop
- Custom CSS: scoped and sanitized, max 2000 chars

### Accessibility guardrails
- Focus-visible ring toggle
- Reduced motion toggle
- Hex color validation

### Editing model (merchant-friendly)
- **Basic tab** first (colors, typography, spacing, responsive)
- **Advanced tab** (layout, positioning, border, shadow)
- **Custom CSS tab** (scoped, sanitized)
- Changes create a new draft version

---

## 11) Customer Account UI Extensions

### Block rendering
- Blocks are config-driven via shop metafields.
- Support: TEXT, LINK, BADGE, DIVIDER block types.
- Targets: profile, order-status, order-index, full-page.

### State handling
- **Loading**: show skeleton/spinner while fetching config.
- **Hidden**: gracefully hide when no config or wrong target.
- **Error**: show friendly message, never crash.

---

## 12) Internal Developer Dashboard

### Layout (Implemented)
- **Frame layout** (`internal.tsx`) with Polaris `Frame`, `TopBar`, and `Navigation`
- Left sidebar with icons for all pages: Dashboard, AI Providers, Usage & Costs, Activity Log, Error Logs, API Logs, Stores, Jobs
- Top header with branded "SA" logo and Admin user menu
- Sidebar auto-highlights active page; Logout separated below divider

### Activity Log (Implemented)
- Dedicated `ActivityLog` Prisma model tracks all significant actions
- Actors: SYSTEM, MERCHANT, INTERNAL_ADMIN, WEBHOOK, CRON
- Activity logging integrated into all key API endpoints (publish, create-module, rollback, connectors, flows, billing, providers)
- Activity log page with advanced filters: Actor, Action, Search, Date From/To

### Advanced Filters (Implemented)
All log/data pages have contextual filters:
- Error Logs: Level, Search, Date range
- API Logs: Actor, Status, Search, Date range
- Jobs: Status, Type, Search, Date range
- Stores: Plan tier, Domain search
- Usage: Action, Date range

### Toast Notifications (Implemented)
- Toast system via `Frame` layout context
- Success/error toasts surface after mutations
- Auto-dismiss after 4 seconds

### Loading States (Implemented)
- `SkeletonBodyText` during data loading across all pages
- Loading spinners on all submit buttons
- `useNavigation().state` drives loading indicators

### Settings Page (Implemented)
Dedicated `/internal/settings` page with 4 sections:
- **Appearance**: App name, header/brand color (live preview), logo URL, favicon URL
- **Profile**: Admin name (initials avatar fallback), email, profile picture URL
- **Contact & Legal**: Company name, support email/URL, privacy/terms URLs
- **App Configuration**: Timezone, date format, email alert toggle, maintenance mode toggle

Settings are persisted in the `AppSettings` Prisma model (singleton row) and applied dynamically to the layout (header color, logo, user menu name/avatar).

### Security
- All pages require internal admin authentication.
- No secrets/PII displayed in plain text.

---

## 13) QA "Definition of Done" (UI/UX)

For every feature:
- [ ] Happy path works end-to-end
- [ ] Loading/empty/error/success states designed + implemented
- [ ] Keyboard + focus tested
- [ ] Copy reviewed for consistency
- [ ] Back navigation works on every sub-page
- [ ] Destructive actions have confirmation
- [ ] Versioning/rollback where publishing is involved

---

## 14) Suggested Default Design System Decisions
- Spacing: 8px scale (Polaris gap tokens)
- Border radius: 12px default, 8px compact
- Primary CTA location: top-right in title bar (Admin)
- Empty state pattern: EmptyState component + 1 CTA + optional help text
- Editor pattern: tabs (Basic → Advanced → Custom CSS)
- Storefront customization: tokens/presets only

---
