/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const REQUIRED_ENV = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];

export default defineConfig(({ command, mode }) => {
  // Without these, src/supabase/client.ts throws at load. Vite inlines the
  // missing values as undefined, the throw becomes unconditional, and the
  // bundler drops every module that could only run after it — so the build
  // "succeeds" with an app that has no screens. Fail the build instead.
  if (command === 'build') {
    const env = loadEnv(mode, '.', 'VITE_');
    const missing = REQUIRED_ENV.filter((key) => !env[key]);
    if (missing.length > 0) {
      throw new Error(
        `Missing ${missing.join(' and ')}. Copy .env.example to .env and fill it in before building.`,
      );
    }
  }

  return {
    plugins: [react(), tailwindcss()],
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    },
  };
});
