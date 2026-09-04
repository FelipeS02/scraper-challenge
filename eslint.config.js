import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'output/**', 'coverage/**'],
  },

  js.configs.recommended,

  // Type-aware linting. `recommendedTypeChecked` rather than `strictTypeChecked`:
  // this codebase parses untrusted HTML, so defensive null/undefined checks are
  // correct even where the type system believes a value is always present.
  // `strictTypeChecked` flags those as unnecessary conditions and would push us
  // toward deleting the very guards a scraper needs.
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Unused args are allowed when prefixed with `_`, which keeps interface
      // implementations honest about the signature they satisfy.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Every rejection must carry a stack trace we can log.
      '@typescript-eslint/only-throw-error': 'error',
      // Floating promises are how scrapers silently drop work.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      // `console` is the logger's own transport; everything else goes through it.
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // Enforced adapter seam: the engine is payload-generic and must never import
  // an adapter, a transport, or an HTML parser directly — only through the ports
  // declared in engine/ports.ts. This is a build-time seam, not a convention.
  {
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/adapters/**', '**/infra/**', '**/cli/**'],
              message: 'engine/ must not import an adapter — this is the ports/adapters seam.',
            },
            {
              group: ['axios', 'axios-*', 'cheerio', 'tough-cookie'],
              message:
                'engine/ must not touch a transport or an HTML parser; go through HttpTransport.',
            },
          ],
        },
      ],
    },
  },

  // Config files are not part of the TypeScript program.
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  // Must stay last: switches off every rule that would fight Prettier.
  prettier,
);
