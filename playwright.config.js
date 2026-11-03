import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_CLIENT_PORT || 5173);
const SERVER_PORT = Number(process.env.E2E_SERVER_PORT || 5055);

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node e2e/start-server.js',
      port: SERVER_PORT,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        NODE_ENV: 'test',
        E2E_SERVER_PORT: String(SERVER_PORT),
        CLIENT_ORIGIN: `http://127.0.0.1:${PORT},http://localhost:${PORT}`,
        LLM_PROVIDER: 'mock',
        EMBEDDING_PROVIDER: 'mock',
        LOG_LEVEL: 'warn',
      },
    },
    {
      command: `npm run dev --workspace client -- --host 127.0.0.1 --port ${PORT} --strictPort`,
      port: PORT,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        VITE_API_PROXY_TARGET: `http://127.0.0.1:${SERVER_PORT}`,
      },
    },
  ],
});
