import type { Linter } from 'eslint';
import js from '@eslint/js';
import unicorn from 'eslint-plugin-unicorn';
import stylistic from '@stylistic/eslint-plugin';
import tseslint from 'typescript-eslint';

export default [
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
        tsconfigRootDir: import.meta.dirname,
        warnOnUnsupportedTypeScriptVersion: false,
        extraFileExtensions: ['.vue']
      }
    }
  },
  {
    ignores: ['ast/tests/**', 'ast/output/**']
  }
] as Linter.Config[];
