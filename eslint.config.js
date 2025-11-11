// eslint.config.js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default [
  // ignore build artifacts
  { ignores: ['**/dist/**', '**/build/**', '**/.turbo/**', '**/coverage/**'] },

  // base JS rules
  js.configs.recommended,

  // base TS rules (type-aware without per-project lists)
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        // works well in monorepos with multiple tsconfigs
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // your shared TS rules here
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },

  // React-only block: applies only in the React app folder
  {
    files: ['apps/client/**/*.{js,jsx,ts,tsx}'],
    plugins: {
      react,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    settings: { react: { version: 'detect' } },
    // use the plugins' flat presets and then tweak
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',
      // your React overrides here
    },
  },
];
