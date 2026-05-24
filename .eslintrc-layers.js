// @ts-check
import js from '@eslint/js'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import importPlugin from 'eslint-plugin-import'

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  js.configs.recommended,

  // ── packages/core — 业务逻辑层 ──────────────────────────────────
  {
    files: ['packages/core/**/*.{ts,tsx}'],
    plugins: { '@typescript-eslint': tsPlugin, import: importPlugin },
    languageOptions: { parser: tsParser },
    rules: {
      // 禁止 import react-dom（core 层不能有 DOM 依赖）
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['react-dom', 'react-dom/*'], message: 'packages/core must not import react-dom. Move UI code to packages/ui.' },
          { group: ['@forge/ui', '@forge/ui/*'], message: 'packages/core must not import @forge/ui. This breaks the dependency direction.' },
          { group: ['../../apps/*', '../../../apps/*'], message: 'packages/core must not import from apps/. Extract shared logic instead.' },
        ],
      }],
    },
  },

  // ── packages/ui — UI 组件层 ──────────────────────────────────────
  {
    files: ['packages/ui/**/*.{ts,tsx}'],
    plugins: { '@typescript-eslint': tsPlugin, import: importPlugin },
    languageOptions: { parser: tsParser },
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@forge/core', '@forge/core/*'], message: 'packages/ui must not import @forge/core. UI components must be pure and stateless.' },
          { group: ['zustand', 'zustand/*'], message: 'packages/ui must not import zustand. Move state to packages/core.' },
          { group: ['@tanstack/*'], message: 'packages/ui must not import @tanstack. Move data fetching to packages/core.' },
        ],
      }],
    },
  },

  // ── apps/web/src/pages — 页面层 ──────────────────────────────────
  {
    files: ['apps/web/src/pages/**/*.{ts,tsx}'],
    plugins: { '@typescript-eslint': tsPlugin },
    languageOptions: { parser: tsParser },
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['axios', 'node-fetch'], message: 'Pages must not call APIs directly. Use hooks from @forge/core.' },
        ],
      }],
    },
  },
]
