import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

/**
 * Preparación común a todas las pruebas del frontend.
 *
 * Tres tareas, y las tres evitan que una prueba contamine a la siguiente:
 *
 * 1. `cleanup` desmonta lo que quedó renderizado. Sin esto, el DOM acumula
 *    pantallas y `getByText` encuentra el botón de una prueba anterior.
 *
 * 2. Se vacían los dos almacenes. El cliente HTTP guarda los tokens ahí, y un
 *    token olvidado haría que la prueba siguiente arrancara "autenticada".
 *
 * 3. `fetch` queda con una respuesta vacía por defecto. Las pruebas que
 *    necesitan una respuesta concreta la redefinen; las demás no ejercitan
 *    la capa HTTP y no deberían dejar llamadas sin resolver.
 */
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  globalThis.fetch = vi.fn(async () =>
    new Response(JSON.stringify({ exito: true, mensaje: 'ok', datos: null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  ) as unknown as typeof fetch
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
})
