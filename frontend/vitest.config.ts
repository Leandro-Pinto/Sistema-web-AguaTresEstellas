import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

/**
 * Configuración de las pruebas del frontend.
 *
 * Va en un archivo aparte de `vite.config.ts` a propósito: el bloque `test`
 * no existe en el tipo de configuración de Vite, y meterlo ahí obligaría a
 * importarlo desde `vitest/config` en el archivo que también usa el servidor
 * de desarrollo y el build de producción.
 *
 * `environment: 'jsdom'` aporta `window`, `document` y el almacenamiento que
 * necesita el cliente HTTP. `globals: false` es deliberado: las pruebas
 * importan explícitamente `describe`, `it` y `expect` de `vitest`, de modo que
 * un test no depende de un global invisible que solo existe en el runner.
 *
 * `setupFiles` carga los emparejadores de jest-dom y limpia el almacenamiento
 * entre pruebas. Sin esa limpieza, el token que una prueba deja en
 * `localStorage` haría que la siguiente arrancara autenticada.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/pruebas/preparacion.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Los temporizadores falsos rompen `useRetraso`, que mide la búsqueda con
    // un retardo de 350 ms: la prueba de debounce necesita reloj real.
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: './cobertura',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/pruebas/**', 'src/main.tsx'],
    },
  },
})
