/* eslint-env node */
// eslint-disable-next-line no-undef
module.exports = {
  extends: ['stylelint-config-standard', 'stylelint-config-recommended-scss'],
  plugins: ['stylelint-order', '@stylistic/stylelint-plugin'],
  rules: {
    'no-duplicate-selectors': true,
    'no-descending-specificity': true,
    'max-nesting-depth': 3,
    'selector-max-id': 0,
    'selector-max-class': 3,
    'declaration-no-important': true,
    'color-named': 'never',
    'color-no-invalid-hex': true,
    'function-url-no-scheme-relative': true,

    '@stylistic/indentation': 2,
    '@stylistic/number-leading-zero': 'always',
    '@stylistic/string-quotes': 'single',
    '@stylistic/block-opening-brace-space-before': 'always',
    '@stylistic/block-closing-brace-newline-after': 'always',
    '@stylistic/declaration-block-trailing-semicolon': 'always',

    'order/properties-order': [
      [
        'position',
        'top',
        'right',
        'bottom',
        'left',
        'display',
        'flex',
        'grid',
        'width',
        'height',
        'margin',
        'padding',
        'font',
        'color',
        'background',
      ],
      { unspecified: 'bottomAlphabetical' },
    ],

    'scss/at-rule-no-unknown': true,
    'scss/dollar-variable-pattern': '^[_a-z][a-z0-9-]+$',
  },
};
