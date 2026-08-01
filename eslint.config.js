import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['dist/**', 'src-tauri/**', 'node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      // Fijo en vez de 'detect': la auto-detección de eslint-plugin-react
      // usa context.getFilename(), removido en ESLint 10, y crashea.
      react: { version: '19.1.0' },
    },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      // Prop-types no aplica: la validación de props la hace TypeScript.
      'react/prop-types': 'off',
      // Reglas de React Hooks — ver specs/estructura-codigo/design.md Fase 0.
      // Solo las dos reglas clásicas; el resto del set (compiler/purity/etc.
      // de eslint-plugin-react-hooks v7) queda fuera a propósito para no
      // introducir un aluvión de reglas nuevas no pedidas por el spec.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Aviso, no error — para no romper el build por los archivos legados
      // que specs/estructura-codigo/tasks.md ya planea reducir por fases.
      'max-lines': ['warn', { max: 500, skipBlankLines: true, skipComments: true }],
    },
  },
);
