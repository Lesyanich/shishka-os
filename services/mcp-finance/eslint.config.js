// HC-2: Domain boundary enforcement for mcp-finance
// Spec: docs/plans/spec-ai-native-ops.md
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    files: ['src/**/*.ts'],
    extends: [tseslint.configs.base],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['**/services/mcp-chef', '**/services/mcp-chef/**'],
            message: 'HC-2: mcp-finance must not import from mcp-chef. Use shared types from services/supabase/types/.',
          },
          {
            group: ['**/services/mcp-mission-control', '**/services/mcp-mission-control/**'],
            message: 'HC-2: mcp-finance must not import from mcp-mission-control. Use shared types from services/supabase/types/.',
          },
          {
            group: ['**/apps/**'],
            message: 'HC-2: MCP servers must not import from app code.',
          },
        ],
      }],
    },
  },
);
