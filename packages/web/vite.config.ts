import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const port = parseInt(env.WEB_PORT || env.PORT || '8999', 10)
  const workerPort = parseInt(env.WORKER_PORT || '8888', 10)

  return {
    plugins: [react()],
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
