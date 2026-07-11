import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
    {
        linterOptions: {
            reportUnusedDisableDirectives: 'off'
        }
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        // Restrict react-hooks rules exclusively to JSX/TSX files or files within the src/tui/ React UI directory
        // to prevent false positives in core code (e.g. Baileys' useMultiFileAuthState)
        files: ['**/*.tsx', '**/*.jsx', 'src/tui/**/*.ts', 'src/tui/**/*.tsx', 'src/tui/**/*.js', 'src/tui/**/*.jsx'],
        plugins: {
            'react-hooks': reactHooks
        },
        rules: {
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'warn'
        }
    },
    {
        ignores: [
            '**/node_modules/**',
            '**/session/**',
            '**/temp/**',
            '**/*.min.js',
            'dist/**',
            'coverage/**',
            'graphify-out/**',
            'Sandbox1/**',
            'TEST_RESULT/**',
            'scratch/**'
        ]
    },
    {
        files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                // Node.js Global variables
                process: 'readonly',
                console: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                Buffer: 'readonly',
                __dirname: 'readonly',
                __filename: 'readonly',
                exports: 'writable',
                module: 'readonly',
                require: 'readonly'
            }
        },
        rules: {
            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    'args': 'all',
                    'argsIgnorePattern': '^_',
                    'varsIgnorePattern': '^_'
                }
            ],
            'no-console': 'off',
            'semi': [
                'error',
                'always'
            ],
            'quotes': [
                'error',
                'single',
                {
                    'avoidEscape': true
                }
            ],
            'indent': [
                'warn',
                4,
                {
                    'SwitchCase': 1
                }
            ],
            'comma-dangle': [
                'warn',
                'never'
            ],
            'no-trailing-spaces': 'warn',
            'eol-last': [
                'warn',
                'always'
            ],
            'no-multiple-empty-lines': [
                'warn',
                {
                    'max': 2
                }
            ],
            'prefer-const': 'error',
            'no-var': 'error',
            'object-shorthand': 'warn',
            'arrow-spacing': 'warn',
            'no-duplicate-imports': 'error',
            'no-empty': 'error',
            'no-unused-expressions': 'error',
            'no-warning-comments': [
                'error',
                {
                    'terms': ['todo', 'fixme', 'stub'],
                    'location': 'anywhere'
                }
            ],
            'no-constant-condition': 'error',
            'complexity': [
                'error',
                30
            ],
            'max-depth': [
                'error',
                5
            ],
            'max-lines-per-function': [
                'error',
                {
                    'max': 200,
                    'skipBlankLines': true,
                    'skipComments': true
                }
            ],
            'no-param-reassign': 'error',
            'no-eval': 'error',
            'no-implied-eval': 'error',
            'no-shadow': 'error'
        }
    },
    {
        files: [
            'src/providers/index.ts',
            'src/core/transport/wa/index.ts'
        ],
        rules: {
            'complexity': 'off',
            'max-depth': 'off',
            'max-lines-per-function': 'off'
        }
    },
    {
        files: [
            'src/providers/adapters/**/*.ts',
            'src/providers/adapters/**/*.js',
            'src/providers/geminiLive.ts'
        ],
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': 'off',
            'no-empty': 'off',
            'complexity': 'off',
            'max-lines-per-function': 'off',
            'max-depth': 'off',
            'no-duplicate-imports': 'off',
            '@typescript-eslint/ban-ts-comment': 'off',
            'no-trailing-spaces': 'off',
            'indent': 'off',
            'quotes': 'off',
            'eol-last': 'off',
            'comma-dangle': 'off',
            'no-multiple-empty-lines': 'off',
            'arrow-spacing': 'off',
            'object-shorthand': 'off',
            'prefer-const': 'off'
        }
    },
    {
        files: [
            'src/tests/**/*.ts',
            'src/tests/**/*.tsx',
            'src/tests/**/*.js',
            'src/tests/**/*.jsx',
            'src/scripts/**/*.ts',
            'src/scripts/**/*.tsx',
            'src/scripts/**/*.js',
            'src/scripts/**/*.jsx',
            'src/scripts/**/*.cjs'
        ],
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': 'off',
            'no-empty': 'off',
            'complexity': 'off',
            'max-lines-per-function': 'off',
            'max-depth': 'off',
            'no-shadow': 'off',
            '@typescript-eslint/ban-ts-comment': 'off',
            'no-trailing-spaces': 'off',
            'indent': 'off',
            'quotes': 'off',
            'eol-last': 'off',
            'comma-dangle': 'off',
            'no-multiple-empty-lines': 'off',
            'arrow-spacing': 'off',
            'object-shorthand': 'off',
            'prefer-const': 'off',
            '@typescript-eslint/no-require-imports': 'off',
            'prefer-rest-params': 'off',
            'no-param-reassign': 'off'
        }
    },
    {
        files: [
            'src/core/transport/**/*.ts',
            'src/core/transport/**/*.tsx',
            'src/core/handlers/**/*.ts'
        ],
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': 'off',
            'no-empty': 'off',
            'complexity': 'off',
            'max-lines-per-function': 'off',
            'max-depth': 'off',
            '@typescript-eslint/ban-ts-comment': 'off',
            'no-trailing-spaces': 'off',
            'indent': 'off',
            'quotes': 'off',
            'eol-last': 'off',
            'comma-dangle': 'off',
            'no-multiple-empty-lines': 'off',
            'arrow-spacing': 'off',
            'object-shorthand': 'off',
            'prefer-const': 'off',
            'no-shadow': 'off',
            'no-case-declarations': 'off',
            '@typescript-eslint/no-this-alias': 'off',
            'no-warning-comments': 'off',
            '@typescript-eslint/no-empty-object-type': 'off',
            'no-useless-escape': 'off',
            'no-duplicate-imports': 'off',
            'no-param-reassign': 'off'
        }
    },
    {
        files: [
            'src/tui/**/*.ts',
            'src/tui/**/*.tsx',
            'src/tui/**/*.js',
            'src/tui/**/*.jsx',
            'src/types/**/*.ts',
            'src/types/**/*.tsx'
        ],
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': 'off',
            'no-empty': 'off',
            'complexity': 'off',
            'max-lines-per-function': 'off',
            'max-depth': 'off',
            '@typescript-eslint/ban-ts-comment': 'off',
            'no-trailing-spaces': 'off',
            'indent': 'off',
            'quotes': 'off',
            'eol-last': 'off',
            'comma-dangle': 'off',
            'no-multiple-empty-lines': 'off',
            'arrow-spacing': 'off',
            'object-shorthand': 'off',
            'prefer-const': 'off',
            'no-shadow': 'off',
            'no-case-declarations': 'off',
            '@typescript-eslint/no-this-alias': 'off',
            'no-warning-comments': 'off',
            '@typescript-eslint/no-empty-object-type': 'off',
            'no-useless-escape': 'off',
            'no-duplicate-imports': 'off',
            'no-param-reassign': 'off',
            '@typescript-eslint/no-duplicate-enum-values': 'off',
            '@typescript-eslint/no-require-imports': 'off',
            'react-hooks/exhaustive-deps': 'off'
        }
    }
);
