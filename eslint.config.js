import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        ignores: [
            '**/node_modules/**',
            '**/session/**',
            '**/temp/**',
            '**/*.min.js',
            'dist/**',
            'coverage/**'
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
                8
            ],
            'max-depth': [
                'error',
                3
            ],
            'max-lines-per-function': [
                'error',
                {
                    'max': 20,
                    'skipBlankLines': true,
                    'skipComments': true
                }
            ],
            'no-param-reassign': 'error',
            'no-eval': 'error',
            'no-implied-eval': 'error',
            'no-shadow': 'error'
        }
    }
);
