import parser from '@typescript-eslint/parser';
import plugin from '@typescript-eslint/eslint-plugin';

const config = [
  { ignores: ['dist/**', 'exports/**', 'node_modules/**'] },
  {
    files: ['src/**/*.ts'],
    languageOptions: { parser, parserOptions: { ecmaVersion: 'latest', sourceType: 'module' } },
    plugins: { '@typescript-eslint': plugin },
    rules: plugin.configs.recommended.rules,
  },
  {
    files: ['test/**/*.mjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    rules: { 'no-unused-vars': 'error', 'no-constant-condition': 'error', 'no-unreachable': 'error' },
  },
];

export default config;
