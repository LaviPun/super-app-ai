/**
 * Picker UI — doc Section 16. Screens 1–6: Goal → Recipe plan → Placement → Config → Data & permissions → Review & deploy.
 * All dropdowns and options from Allowed Values Manifest (no static lists in UI).
 */

import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { Page, Card, FormLayout, Select, Button, BlockStack, Text } from '@shopify/polaris';
import { useState, useCallback } from 'react';
import {
  RECIPE_GOAL_CATEGORIES,
  THEME_PLACEABLE_TEMPLATES,
  THEME_SECTION_GROUPS,
  CHECKOUT_UI_TARGETS,
  MODULE_CATEGORIES,
} from '@superapp/core';

export async function loader({ request }: LoaderFunctionArgs) {
  return json({
    goals: RECIPE_GOAL_CATEGORIES as unknown as string[],
    themeTemplates: THEME_PLACEABLE_TEMPLATES as unknown as string[],
    themeSectionGroups: THEME_SECTION_GROUPS as unknown as string[],
    checkoutTargets: CHECKOUT_UI_TARGETS as unknown as string[],
    categories: MODULE_CATEGORIES as unknown as string[],
  });
}

type LoaderData = Awaited<ReturnType<typeof loader>>;

const STEP_LABELS = [
  'What do you want to achieve?',
  'Recommended implementation plan',
  'Placement picker',
  'Configuration schema',
  'Data & permissions',
  'Review & deploy',
];

export default function PickerIndex() {
  const data = useLoaderData<LoaderData>();
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState<string>('');
  const [placementTemplate, setPlacementTemplate] = useState<string>('');
  const [sectionGroup, setSectionGroup] = useState<string>('');

  const goalOptions = data.goals.map((g) => ({ label: g, value: g }));
  const templateOptions = [{ label: '(Any)', value: '' }, ...data.themeTemplates.map((t) => ({ label: t, value: t }))];
  const groupOptions = [{ label: '(Any)', value: '' }, ...data.themeSectionGroups.map((g) => ({ label: g, value: g }))];

  const handleGoalChange = useCallback((v: string) => setGoal(v), []);
  const handleTemplateChange = useCallback((v: string) => setPlacementTemplate(v), []);
  const handleGroupChange = useCallback((v: string) => setSectionGroup(v), []);

  const nextStep = () => setStep((s) => Math.min(s + 1, 5));
  const prevStep = () => setStep((s) => Math.max(s - 1, 0));

  return (
    <Page
      title="Create module"
      backAction={{ content: 'Modules', url: '/modules' }}
    >
      <BlockStack gap="400">
        <Text as="p" variant="bodyMd" tone="subdued">
          Step {step + 1} of 6: {STEP_LABELS[step]}
        </Text>

        {step === 0 && (
          <Card>
            <FormLayout>
              <Select
                label="Goal (category)"
                options={goalOptions}
                value={goal}
                onChange={handleGoalChange}
                placeholder="Select a goal"
              />
              <Button variant="primary" onClick={nextStep} disabled={!goal}>
                Next
              </Button>
            </FormLayout>
          </Card>
        )}

        {step === 1 && (
          <Card>
            <BlockStack gap="300">
              <Text as="p">Recipe plan will be suggested based on: {goal || '—'}</Text>
              <Button variant="primary" onClick={nextStep}>Next</Button>
            </BlockStack>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <FormLayout>
              <Select
                label="Theme template (doc 4.2.2B)"
                options={templateOptions}
                value={placementTemplate}
                onChange={handleTemplateChange}
              />
              <Select
                label="Section group (doc 4.2.3)"
                options={groupOptions}
                value={sectionGroup}
                onChange={handleGroupChange}
              />
              <Button variant="primary" onClick={nextStep}>Next</Button>
            </FormLayout>
          </Card>
        )}

        {(step === 3 || step === 4 || step === 5) && (
          <Card>
            <BlockStack gap="300">
              <Text as="p">Step {step + 1}: {STEP_LABELS[step]} (configure in follow-up)</Text>
              <Button variant="primary" onClick={nextStep}>{step < 5 ? 'Next' : 'Deploy'}</Button>
            </BlockStack>
          </Card>
        )}

        {step > 0 && (
          <Button onClick={prevStep}>Back</Button>
        )}
      </BlockStack>
    </Page>
  );
}
