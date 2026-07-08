// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.object.name=/^(describe|it|test)$/][callee.property.name='only']",
          message: 'Focused Jest tests must not be committed.',
        },
        {
          selector: "CallExpression[callee.name=/^(fdescribe|fit)$/]",
          message: 'Focused Jest tests must not be committed.',
        },
      ],
      "prettier/prettier": ["error", { endOfLine: "auto" }],
    },
  },
);
