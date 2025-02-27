import type { Linter } from 'eslint';
import js from '@eslint/js';
import unicorn from 'eslint-plugin-unicorn';
import stylistic from '@stylistic/eslint-plugin';
import tseslint from 'typescript-eslint';

export const getBaseConfig = (base_directory = import.meta.dirname) => ([
  js.configs.recommended,
  unicorn.configs['flat/recommended'],
  stylistic.configs.customize({
    quotes: 'single',
    semi: true,
    commaDangle: 'never',
    braceStyle: '1tbs',
    arrowParens: false,
    blockSpacing: true
  }),
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  tseslint.configs.eslintRecommended,
  {
    name: 'TypeScript Parser config',
    files: ['*.ts', '**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: base_directory,
        warnOnUnsupportedTypeScriptVersion: false
      }
    }
  },
  {
    ignores: ['ast/tests/**', 'ast/output/**', '**blockchain-conversion**/', 'package/**']
  },
  {
    name: 'Rules overrides',
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      'unicorn/import-style': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-dynamic-delete': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'unicorn/consistent-function-scoping': ['error', { checkArrowFunctions: false }],
      'unicorn/no-await-expression-member': 'off'
    }
  }
] as Linter.Config[]);
