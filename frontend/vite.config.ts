import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  /**
   * El backend corre en su propio puerto y en desarrollo no comparte origen
   * con Vite. El proxy evita por completo el problema de CORS: el navegador
   * solo ve `/api/...` en el mismo origen que la aplicación, y Vite lo
   * reenvía al servidor. En producción, el backend debe quedar accesible en
   * el mismo dominio o detrás de un proxy inverso equivalente.
   */
  const destinoApi = env.VITE_API_PROXY ?? 'http://localhost:4000'

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: destinoApi,
          changeOrigin: true,
        },
        // La salud se monta en la raíz del backend, no bajo /api.
        '/salud': {
          target: destinoApi,
          changeOrigin: true,
        },
      },
    },
  }
})
