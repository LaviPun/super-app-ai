/**
 * Picker UI — doc Section 16. Screens 1–6: Goal → Recipe plan → Placement → Config → Data & permissions → Review & deploy.
 * All dropdowns and options from Allowed Values Manifest (no static lists in UI).
 */

import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData, useNavigate } from '@remix-run/react';
import { useState, useCallback } from 'react';
import { MerchantShell } from '~/components/merchant/MerchantShell';
import {
  RECIPE_GOAL_CATEGORIES,
  THEME_PLACEABLE_TEMPLATES,
  THEME_SECTION_GROUPS,
  CHECKOUT_UI_TARGETS,
  MODULE_CATEGORIES,
} from '@superapp/core';
import { shopify } from '~/shopify.server';

export async function loader({ request }: LoaderFunctionArgs) {
  await shopify.authenticate.admin(request);
  return json({
    goals: RECIPE_GOAL_CATEGORIES as unknown as string[],
    themeTemplates: THEME_PLACEABLE_TEMPLATES as unknown as string[],
    themeSectionGroups: THEME_SECTION_GROUPS as unknown as string[],
    checkoutTargets: CHECKOUT_UI_TARGETS as unknown as string[],
    categories: MODULE_CATEGORIES as unknown as string[],
  });
}

const STEP_LABELS = [
  'What do you want to achieve?',
  'Recommended implementation plan',
  'Placement picker',
  'Configuration schema',
  'Data & permissions',
  'Review & deploy',
];

export default function PickerIndex() {
  return (
    <MerchantShell polaris>
      <PickerBody />
    </MerchantShell>
  );
}

function PickerBody() {
  const data = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState<string>('');
  const [placementTemplate, setPlacementTemplate] = useState<string>('');
  const [sectionGroup, setSectionGroup] = useState<string>('');

  const handleGoalChange = useCallback((v: string) => setGoal(v), []);
  const handleTemplateChange = useCallback((v: string) => setPlacementTemplate(v), []);
  const handleGroupChange = useCallback((v: string) => setSectionGroup(v), []);

  const nextStep = () => setStep((s) => Math.min(s + 1, 5));
  const prevStep = () => setStep((s) => Math.max(s - 1, 0));

  return (
    <s-page heading="Create module" inlineSize="base">
      <s-stack gap="small-100">
        <s-stack direction="inline">
          <s-button variant="tertiary" icon="arrow-left" onClick={() => navigate('/modules')}>Modules</s-button>
        </s-stack>
        <s-paragraph color="subdued">
          Step {step + 1} of 6: {STEP_LABELS[step]}
        </s-paragraph>
      </s-stack>

      {step === 0 && (
        <s-section>
          <s-stack gap="base">
            <s-select
              label="Goal (category)"
              value={goal}
              onChange={(e) => handleGoalChange(e.currentTarget.value)}
            >
              <s-option value="">Select a goal</s-option>
              {data.goals.map((g) => (
                <s-option key={g} value={g}>{g}</s-option>
              ))}
            </s-select>
            <s-stack direction="inline">
              <s-button variant="primary" onClick={nextStep} disabled={!goal || undefined}>
                Next
              </s-button>
            </s-stack>
          </s-stack>
        </s-section>
      )}

      {step === 1 && (
        <s-section>
          <s-stack gap="base">
            <s-text>Recipe plan will be suggested based on: {goal || '—'}</s-text>
            <s-stack direction="inline">
              <s-button variant="primary" onClick={nextStep}>Next</s-button>
            </s-stack>
          </s-stack>
        </s-section>
      )}

      {step === 2 && (
        <s-section>
          <s-stack gap="base">
            <s-select
              label="Theme template (doc 4.2.2B)"
              value={placementTemplate}
              onChange={(e) => handleTemplateChange(e.currentTarget.value)}
            >
              <s-option value="">(Any)</s-option>
              {data.themeTemplates.map((t) => (
                <s-option key={t} value={t}>{t}</s-option>
              ))}
            </s-select>
            <s-select
              label="Section group (doc 4.2.3)"
              value={sectionGroup}
              onChange={(e) => handleGroupChange(e.currentTarget.value)}
            >
              <s-option value="">(Any)</s-option>
              {data.themeSectionGroups.map((g) => (
                <s-option key={g} value={g}>{g}</s-option>
              ))}
            </s-select>
            <s-stack direction="inline">
              <s-button variant="primary" onClick={nextStep}>Next</s-button>
            </s-stack>
          </s-stack>
        </s-section>
      )}

      {(step === 3 || step === 4 || step === 5) && (
        <s-section>
          <s-stack gap="base">
            <s-text>Step {step + 1}: {STEP_LABELS[step]} (configure in follow-up)</s-text>
            <s-stack direction="inline">
              <s-button variant="primary" onClick={nextStep}>{step < 5 ? 'Next' : 'Deploy'}</s-button>
            </s-stack>
          </s-stack>
        </s-section>
      )}

      {step > 0 && (
        <s-stack direction="inline">
          <s-button onClick={prevStep}>Back</s-button>
        </s-stack>
      )}
    </s-page>
  );
}

export { MerchantErrorBoundary as ErrorBoundary } from '~/components/merchant/MerchantErrorBoundary';
