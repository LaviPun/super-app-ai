import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  {
    ignores: ['node_modules/**', 'build/**', 'dist/**', '.cache/**', 'prisma/migrations/**'],
  },
  {
    files: ['app/**/*.{ts,tsx}', 'scripts/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    rules: {
      // TypeScript
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],

      // React
      'react/react-in-jsx-scope': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // General quality
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      'prefer-const': 'error',
      'no-var': 'error',
    },
    settings: {
      react: { version: 'detect' },
    },
  },
  {
    // SuperApp AI design-system port: these files are faithful 1:1 ports of the
    // untyped Claude Design prototype (React.createElement JSX). They intentionally
    // use `any` to mirror the prototype's loose shapes; strict typing stays on for
    // the rest of the app.
    files: [
      'app/components/superapp/**/*.{ts,tsx}',
      'app/components/admin/**/*.{ts,tsx}',
      'app/components/merchant/**/*.{ts,tsx}',
      'app/routes/internal.tsx',
      'app/routes/internal.*.{ts,tsx}',
      'app/routes/_index.tsx',
      'app/routes/modules._index.tsx',
      'app/routes/modules.$moduleId.tsx',
      'app/routes/flows._index.tsx',
      'app/routes/flows.build.$flowId.tsx',
      'app/routes/connectors._index.tsx',
      'app/routes/connectors.$connectorId.tsx',
      'app/routes/data._index.tsx',
      'app/routes/data.$storeKey.tsx',
      'app/routes/billing._index.tsx',
      'app/routes/billing.history.tsx',
      'app/routes/settings._index.tsx',
      'app/routes/generate._index.tsx',
      'app/routes/templates._index.tsx',
      'app/routes/analytics._index.tsx',
      'app/routes/activity._index.tsx',
      'app/routes/help._index.tsx',
    ],
    linterOptions: {
      // The ports also carry their own inline `eslint-disable no-explicit-any`
      // directives; with the rule off here those become redundant — don't flag them.
      reportUnusedDisableDirectives: 'off',
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
