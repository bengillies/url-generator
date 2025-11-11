import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import globals from 'globals';
import eslintConfigPrettier from 'eslint-config-prettier';
import eslintPluginPrettier from 'eslint-plugin-prettier';

const vitestGlobals = {
  afterAll: 'readonly',
  afterEach: 'readonly',
  beforeAll: 'readonly',
  beforeEach: 'readonly',
  describe: 'readonly',
  expect: 'readonly',
  it: 'readonly',
  test: 'readonly',
  vi: 'readonly',
};

const typeScriptAdjustments = {
  ...tseslint.configs['flat/eslint-recommended'],
  files: ['**/*.ts'],
};

const typeCheckedRules = tseslint.configs['flat/recommended-type-checked'][2]?.rules ?? {};
const stylisticRules = tseslint.configs['flat/stylistic-type-checked'][2]?.rules ?? {};

const sharedTypeScriptRules = {
  ...typeCheckedRules,
  ...stylisticRules,
  '@typescript-eslint/consistent-type-imports': [
    'error',
    {
      prefer: 'type-imports',
      disallowTypeAnnotations: false,
      fixStyle: 'inline-type-imports',
    },
  ],
  '@typescript-eslint/no-unused-vars': [
    'error',
    {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
    },
  ],
};

const typeScriptConfig = {
  files: ['**/*.ts'],
  languageOptions: {
    parser: tsParser,
    parserOptions: {
      project: ['./tsconfig.json'],
      tsconfigRootDir: import.meta.dirname,
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    globals: {
      ...globals.browser,
      ...vitestGlobals,
    },
  },
  plugins: {
    '@typescript-eslint': tseslint,
  },
  rules: sharedTypeScriptRules,
};

const testTypeScriptConfig = {
  files: ['tests/**/*.ts'],
  languageOptions: {
    parser: tsParser,
    parserOptions: {
      project: ['./tsconfig.vitest.json'],
      tsconfigRootDir: import.meta.dirname,
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    globals: {
      ...globals.browser,
    },
  },
  plugins: {
    '@typescript-eslint': tseslint,
  },
  rules: sharedTypeScriptRules,
};

const nodeTypeScriptConfig = {
  files: ['*.config.ts', 'vitest.config.ts'],
  languageOptions: {
    parser: tsParser,
    parserOptions: {
      project: ['./tsconfig.json'],
      tsconfigRootDir: import.meta.dirname,
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    globals: {
      ...globals.node,
    },
  },
  plugins: {
    '@typescript-eslint': tseslint,
  },
  rules: sharedTypeScriptRules,
};

export default [
  {
    ignores: ['dist', 'node_modules'],
  },
  {
    plugins: {
      prettier: eslintPluginPrettier,
    },
    rules: {
      'prettier/prettier': 'error',
    },
  },
  js.configs.recommended,
  typeScriptAdjustments,
  typeScriptConfig,
  testTypeScriptConfig,
  nodeTypeScriptConfig,
  eslintConfigPrettier,
];
