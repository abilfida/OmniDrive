import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

// Only the two fields the sidebar shows, instead of bundling the whole root package.json
const rootPackage = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const port = parseInt(env.WEB_PORT || env.PORT || '8999', 10)
  const workerPort = parseInt(env.WORKER_PORT || '8888', 10)

  return {
    plugins: [react()],
    define: {
      __APP_VERSION__: JSON.stringify(rootPackage.version),
      __APP_REPOSITORY_URL__: JSON.stringify(rootPackage.repository.url.replace(/\.git$/, '')),
    },
    server: {
      port,
      proxy: {
        '/api': {
          target: `http://localhost:${workerPort}`,
          changeOrigin: true,
        }
      }
    },
    test: {
      environment: 'jsdom',
      globals: true,
    }
  }
})
