import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useListado } from '@/hooks/useListado'

/**
 * `useListado` es la base de todas las tablas del sistema. Lo que se comprueba
 * aquí es lo que evita que un listado se convierta en una fuente de
 * peticiones inconsistentes: la búsqueda retardada, el reinicio a la primera
 * página y la no repetición de la consulta por un objeto de filtros nuevo.
 */

/** Cuenta las peticiones y guarda las URLs pedidas. */
const espiarFetch = () => {
  const urls: string[] = []
  const falso = vi.fn(async (url: string) => {
    urls.push(url)
    return new Response(
      JSON.stringify({
        exito: true,
        mensaje: 'ok',
        datos: [],
        meta: { paginacion: { pagina: 1, limite: 20, total: 0, totalPaginas: 0 } },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  })
  globalThis.fetch = falso as unknown as typeof fetch
  return { urls, falso }
}

describe('carga inicial', () => {
  it('pide la primera página con los filtros indicados', async () => {
    const { urls } = espiarFetch()
    renderHook(() => useListado('/clientes', { tipo: 'EMPRESA' }))

    await waitFor(() => expect(urls).toHaveLength(1))
    expect(urls[0]).toContain('/api/clientes')
    expect(urls[0]).toContain('pagina=1')
    expect(urls[0]).toContain('tipo=EMPRESA')
  })

  it('devuelve una tabla vacía en vez de indefinido mientras carga', () => {
    espiarFetch()
    const { result } = renderHook(() => useListado('/clientes'))
    expect(result.current.filas).toEqual([])
    expect(result.current.paginacion.total).toBe(0)
  })
})

describe('búsqueda con retardo', () => {
  it('no lanza una petición por cada tecla', async () => {
    const { urls } = espiarFetch()
    const { result } = renderHook(() => useListado('/clientes'))

    await waitFor(() => expect(urls).toHaveLength(1))
    const trasCargaInicial = urls.length

    // El backend pagina por fecha, no por relevancia: sin retardo, "Ana"
    // dispararía tres peticiones cuya última respuesta no es necesariamente
    // la esperada.
    act(() => {
      result.current.buscar('A')
    })
    act(() => {
      result.current.buscar('An')
    })
    act(() => {
      result.current.buscar('Ana')
    })

    await waitFor(() => expect(urls.length).toBe(trasCargaInicial + 1))
    expect(urls.at(-1)).toContain('busqueda=Ana')
  })
})

describe('paginación y orden', () => {
  it('cambiar de página vuelve a pedir con el número nuevo', async () => {
    const { urls } = espiarFetch()
    const { result } = renderHook(() => useListado('/clientes'))
    await waitFor(() => expect(urls).toHaveLength(1))

    act(() => result.current.cambiarPagina(3))
    await waitFor(() => expect(urls.at(-1)).toContain('pagina=3'))
  })

  it('al filtrar se vuelve a la primera página', async () => {
    const { urls } = espiarFetch()
    const { result } = renderHook(() => useListado('/clientes'))
    await waitFor(() => expect(urls).toHaveLength(1))

    act(() => result.current.cambiarPagina(5))
    await waitFor(() => expect(urls.at(-1)).toContain('pagina=5'))

    act(() => result.current.buscar('hotel'))
    await waitFor(() => expect(urls.at(-1)).toContain('pagina=1'))
  })

  it('recargar vuelve a pedir los mismos datos', async () => {
    const { urls } = espiarFetch()
    const { result } = renderHook(() => useListado('/clientes'))
    await waitFor(() => expect(urls).toHaveLength(1))

    act(() => result.current.recargar())
    await waitFor(() => expect(urls).toHaveLength(2))
  })
})

describe('estabilidad de los filtros', () => {
  it('un objeto de filtros nuevo en cada render no repite la petición', async () => {
    // Cada pantalla construye el objeto de filtros en el cuerpo del
    // componente. Sin comparar su contenido, sería un objeto distinto en
    // cada render y la consulta se repetiría sin parar.
    const { urls, falso } = espiarFetch()
    const { rerender } = renderHook(({ filtros }) => useListado('/clientes', filtros), {
      initialProps: { filtros: { tipo: 'EMPRESA' as const } },
    })

    await waitFor(() => expect(urls).toHaveLength(1))

    // Cuatro rerender con un objeto nuevo pero de igual contenido.
    for (let i = 0; i < 4; i += 1) {
      rerender({ filtros: { tipo: 'EMPRESA' as const } })
    }

    // Deja correr cualquier petición pendiente antes de afirmar.
    await new Promise((resolver) => setTimeout(resolver, 50))
    expect(falso).toHaveBeenCalledTimes(1)
  })

  it('un filtro de contenido distinto sí vuelve a pedir', async () => {
    const { urls } = espiarFetch()
    const { rerender } = renderHook(({ tipo }) => useListado('/clientes', { tipo }), {
      initialProps: { tipo: 'EMPRESA' as 'EMPRESA' | 'PERSONA' },
    })

    await waitFor(() => expect(urls).toHaveLength(1))
    rerender({ tipo: 'PERSONA' })
    await waitFor(() => expect(urls.length).toBeGreaterThan(1))
    expect(urls.at(-1)).toContain('tipo=PERSONA')
  })
})
