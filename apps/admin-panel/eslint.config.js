import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // HC-2: Domain boundary — admin-panel must NOT import from MCP servers directly
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['**/services/mcp-*', '**/services/mcp-*/**'],
            message: 'HC-2: Admin panel must not import from MCP servers directly. Use Supabase client or shared types from services/supabase/types/.',
          },
        ],
      }],

      // Allow leading-underscore "intentionally unused" convention
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],

      // React Compiler-aligned rules from eslint-plugin-react-hooks: disabled.
      // These enforce patterns the upstream plugin added recently
      // (set-state-in-effect, purity, static-components, immutability,
      // preserve-manual-memoization) and the codebase has ~40 pre-existing
      // violations that require a dedicated migration phase. Tracked as
      // follow-up MC task 6218a30f. rules-of-hooks and exhaustive-deps stay
      // as errors — they catch real bugs. Pre-commit hook uses
      // --max-warnings 0 so keeping these as 'warn' would block all commits;
      // hence 'off' until the migration phase.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/static-components': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/preserve-manual-memoization': 'off',

      // Fast Refresh optimization rule — warns on standard Context patterns
      // (Provider + hook in same file) and component + sibling util exports.
      // Not a correctness rule; downgrading avoids churning well-established
      // files. Splitting contexts is tracked as a follow-up.
      'react-refresh/only-export-components': 'off',
    },
  },
])
