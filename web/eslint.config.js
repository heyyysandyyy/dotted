import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // shadcn/ui components are auto-generated — do not lint them
  globalIgnores(['dist', 'src/components/ui/**']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // TanStack Router route files always export a non-component Route object
    // Context files always export the context object alongside the Provider component
    files: ['src/routes/**/*.{ts,tsx}', 'src/context/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // Architecture rule: components must not mutate the Fabric canvas directly —
    // all canvas changes route through useCanvasStore. Block the fabric *value*
    // import in components (type-only imports are fine). CanvasStage owns the
    // canvas instance and is the sole exception.
    files: ['src/editor/components/**/*.{ts,tsx}'],
    ignores: ['src/editor/components/CanvasStage.tsx'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'fabric',
              message:
                'Components must not import the fabric value — route canvas changes through useCanvasStore. Type-only imports are allowed.',
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },
])
