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
      // The underscore prefix and the rest-sibling omission are deliberate,
      // load-bearing shapes, not leftovers: `({ modifiers, ...item })` in
      // invoices.service.ts strips the array the item upsert cannot write,
      // and the fiscal-shape spec destructures `_amount` / `_percent` only to
      // drop those keys from the simulated pre-change payload. Without these
      // options the strict default flags all three as unused.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
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
  {
    files: ['src/scripts/**/*.ts'],
    rules: {
      // Flat config replaces (does not merge) per-file rule arrays, so the
      // global restricted-syntax selectors are repeated here to keep the
      // focused-Jest guard in addition to the scripts-only RLS guard.
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
        {
          selector: 'CallExpression[callee.property.name="transaction"]',
          message:
            'Use runInTenantTransaction() in scripts. dataSource.transaction without bindTenantContext creates RLS bypass risk.',
        },
      ],
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/require-await': 'off',
    },
  },
);
