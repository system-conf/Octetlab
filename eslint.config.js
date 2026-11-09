import js from '@eslint/js'
import globals from 'globals'
import i18next from 'eslint-plugin-i18next'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'coverage']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // User-facing text must come from src/locales via t() (docs/I18N.md).
    // 'error': a literal in JSX fails the lint (wave 1.1 moved every literal to the locale files).
    files: ['src/features/**/*.{ts,tsx}', 'src/App.tsx'],
    ignores: ['**/*.test.{ts,tsx}'],
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': [
        'error',
        {
          mode: 'jsx-only',
          // Non-text attributes (title, aria-label, placeholder, label, alt stay checked).
          'jsx-attributes': {
            exclude: [
              'className', 'illustrationClassName', 'style', 'type', 'key', 'id', 'width', 'height', 'role', 'href', 'target',
              'rel', 'htmlFor', 'name', 'value', 'autoComplete', 'enterKeyHint', 'inputMode',
              'aria-hidden', 'aria-live', 'aria-current', 'aria-haspopup', 'aria-controls',
              'position', 'color', 'nodeColor', 'nodeStrokeColor',
            ],
          },
        },
      ],
    },
  },
])
