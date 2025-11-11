/** @type {import("prettier").Config} */
export default {
  semi: true,
  singleQuote: true,
  trailingComma: 'es5',
  printWidth: 100,
  tabWidth: 2,
  endOfLine: 'lf',

  // React-specific tweaks
  overrides: [
    {
      files: 'apps/web/**/*.{js,jsx,ts,tsx}',
      options: {
        jsxSingleQuote: false,
        bracketSpacing: true,
      },
    },
  ],
};
