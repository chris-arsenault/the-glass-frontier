// eslint.config.js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import sonarjs from 'eslint-plugin-sonarjs'
import importPlugin from 'eslint-plugin-import';
import promisePlugin from 'eslint-plugin-promise';
import unicornPlugin from 'eslint-plugin-unicorn';
import securityPlugin from 'eslint-plugin-security';
import commentsPlugin from 'eslint-plugin-eslint-comments';
import perfectionistPlugin from 'eslint-plugin-perfectionist';

export default [
  // ignore build artifacts
  { ignores: ['**/dist/**', '**/build/**', '**/.turbo/**', '**/coverage/**'] },

  // base JS rules
  js.configs.recommended,

  // base TS rules plus type-aware overlays
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
    plugins: { '@typescript-eslint': tseslint.plugin,
      sonarjs,
      importPlugin,
      promisePlugin,
      unicornPlugin,
      securityPlugin,
      commentsPlugin,
      perfectionistPlugin
    },
    rules: {
      /* Complexity and structure */
      complexity: ['error', { max: 10 }],
      'max-depth': ['warn', 4],
      'max-lines': ['warn', 500],
      'max-lines-per-function': ['warn', 50],
      'max-params': ['warn', 4],
      // Cognitive complexity per function (Sonar methodology)
      'sonarjs/cognitive-complexity': ['error', 15],
      // Optional hardening to catch path explosion
      'max-nested-callbacks': ['warn', 3],

      /* Core quality */
      'no-fallthrough': 'error',
      'no-unreachable': 'error',
      'no-implicit-coercion': 'warn',
      'no-else-return': 'warn',
      'no-param-reassign': 'warn',
      'prefer-const': 'warn',

      /* TypeScript-specific */
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/explicit-function-return-type': ['warn', { allowExpressions: true }],
      '@typescript-eslint/array-type': ['warn', { default: 'array-simple' }],
      '@typescript-eslint/member-ordering': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-inferrable-types': 'warn',
      '@typescript-eslint/require-await': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      '@typescript-eslint/method-signature-style': ['error', 'property'],
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
      '@typescript-eslint/prefer-readonly': 'warn',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/strict-boolean-expressions': ['warn', {   allowAny: false,
        allowNumber: false,
        allowString: false,
        allowNullableBoolean: false,
        allowNullableNumber: false,
        allowNullableString: false,
        allowNullableObject: false,
        allowNullableEnum: false }
      ],

        /* Readability and duplication */
      'sonarjs/no-duplicate-string': 'warn',
      'sonarjs/no-identical-functions': 'warn',
      'sonarjs/no-inverted-boolean-check': 'warn',

      eqeqeq: ['error', 'always'],
      curly: 'error',
      'no-trailing-spaces': 'warn',
      'object-curly-spacing': ['error', 'always'],
      semi: ['error', 'always'],
      quotes: ['error', 'single'],
      indent: ['error', 2],

        /* Safety and performance */
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-loop-func': 'warn',
      'no-await-in-loop': 'warn',
      'no-constant-condition': 'warn',
      'securityPlugin/detect-eval-with-expression': 'error',
      'securityPlugin/detect-object-injection': 'warn',

       /* Import hygiene */
      'importPlugin/no-default-export': 'warn',
      'importPlugin/no-cycle': 'error',
      'importPlugin/first': 'error',
      'importPlugin/newline-after-import': 'error',
      'importPlugin/no-extraneous-dependencies': ['error', { devDependencies: ['**/*.test.ts', '**/vite.config.*'] }],

        /* Promises */
      'promisePlugin/always-return': 'error',
      'promisePlugin/no-return-wrap': 'error',
      'promisePlugin/no-native': 'off',
      'promisePlugin/no-nesting': 'warn',
      'promisePlugin/no-new-statics': 'error',

      /* Unicorn: safer, clearer defaults */
      'unicornPlugin/no-null': 'off',
      'unicornPlugin/prefer-optional-catch-binding': 'error',
      'unicornPlugin/prefer-ternary': 'warn',
      'unicornPlugin/consistent-function-scoping': 'warn',
      'unicornPlugin/no-array-reduce': 'warn',


      /* Comments and todos */
      'commentsPlugin/no-unused-disable': 'error',
      'no-warning-comments': ['warn', { terms: ['todo', 'fixme'], location: 'anywhere' }],

      /* Deterministic ordering for LLM output */
      'perfectionistPlugin/sort-imports': ['error', { type: 'natural', groups: [['builtin', 'external'], ['internal', 'parent', 'sibling', 'index']], order: 'asc' }],
      'perfectionistPlugin/sort-objects': ['error', { type: 'natural', order: 'asc' }],

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
