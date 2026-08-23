const js = require('@eslint/js');

module.exports = [
  {
    ignores: ['**/node_modules/**', 'coverage/**']
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        Buffer: 'readonly',
        console: 'readonly',
        module: 'readonly',
        require: 'readonly',
        process: 'readonly',
        __dirname: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['error', { caughtErrors: 'all', caughtErrorsIgnorePattern: '^_' }]
    }
  },
  {
    files: ['privacy-server.js'],
    languageOptions: {
      globals: {
        AbortSignal: 'readonly',
        fetch: 'readonly'
      }
    }
  },
  {
    files: ['rag/server.js'],
    languageOptions: {
      globals: {
        setTimeout: 'readonly'
      }
    }
  },
  {
    files: [
      'script.js',
      'assets/newsletter-config.js',
      'assets/newsletter.js',
      'assets/tag-navigation.js',
      'assets/knowledge-graph.js',
      'assets/knowledge-network.js',
      'assets/roadmap.js',
      'assets/grep.js',
      'assets/kernel-grep-overlay.js',
      'assets/glossary.js'
    ],
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        fetch: 'readonly',
        URLSearchParams: 'readonly',
        AbortController: 'readonly',
        Element: 'readonly',
        HTMLElement: 'readonly',
        MutationObserver: 'readonly',
        IntersectionObserver: 'readonly'
      }
    }
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly'
      }
    }
  }
];
