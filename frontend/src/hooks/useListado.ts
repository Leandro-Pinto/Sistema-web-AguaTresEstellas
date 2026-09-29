import { useCallback, useMemo, useState } from 'react'
import type { Paginacion } from '@/types/dominio'
import { http } from '@/services/http'
import { usePeticion, useRetraso } from '@/hooks'

export interface ConsultaLista {
  pagina: number
  limite: number
  busqueda: string
  orden: 'asc' | 'desc'
}

export const consultaInicial: ConsultaLista = {
  pagina: 1,
  limite: 20,
  busqueda: '',
  orden: 'desc',
}

export type Filtros = Record<string, string | number | boolean | null | undefined>

export interface EstadoListado<T> {
  filas: T[]
  paginacion: Paginacion
  cargando: boolean
  error: Error | null
  recargar: () => void
  consulta: ConsultaLista
  buscar: (valor: string) => void
  cambiarPagina: (pagina: number) => void
  cambiarLimite: (limite: number) => void
  ordenarPor: (orden: 'asc' | 'desc') => void
}

/**
 * Estado de una tabla con búsqueda, orden y paginación contra la API.
 *
 * Centraliza la parte que se repite en todos los listados del sistema; cada
 * pantalla declara solo sus filtros y sus columnas.
 *
 * Tres decisiones que se pagan caro si se ignoran:
 *
 * 1. La búsqueda lleva retardo. El backend pagina por fecha, no por
 *    relevancia, así que escribir "Ana" dispararía tres peticiones (`A`, `An`,
 *    `Ana`) y la respuesta que llegue última no necesariamente sería la
 *    esperada.
 *
 * 2. `filtros` se serializa para compararlo. Cada pantalla construye el objeto
 *    de filtros en el cuerpo del componente y, sin esa comparación, sería un
 *    objeto nuevo en cada render: la petición se repetiría sin parar.
 *
 * 3. La respuesta se tipa como `{ datos, paginacion }` porque es lo que devuelve
 *    `http.pagina`, que ya desenvuelve la envoltura `{ exito, datos, meta }`.
 */
export const useListado = <T,>(ruta: string, filtros: Filtros = {}): EstadoListado<T> => {
  const [consulta, setConsulta] = useState<ConsultaLista>(consultaInicial)
  const busqueda = useRetraso(consulta.busqueda, 350)

  const params = useMemo<Filtros>(
    () => ({
      pagina: consulta.pagina,
      limite: consulta.limite,
      orden: consulta.orden,
      busqueda: busqueda || undefined,
      ...filtros,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [consulta.pagina, consulta.limite, consulta.orden, busqueda, JSON.stringify(filtros)],
  )

  const { datos, cargando, error, recargar } = usePeticion<{ datos: T[]; paginacion: Paginacion }>(
    (senal) => http.pagina<T[]>(ruta, params, { signal: senal }),
    [params],
  )

  // Cambiar de búsqueda, filtro u orden vuelve a la primera página: quedarse en
  // la 5 de un listado que ahora tiene 2 páginas mostraría una tabla vacía sin
  // explicación.
  const buscar = useCallback(
    (valor: string) => setConsulta((c) => ({ ...c, pagina: 1, busqueda: valor })),
    [],
  )
  const cambiarPagina = useCallback((pagina: number) => setConsulta((c) => ({ ...c, pagina })), [])
  const cambiarLimite = useCallback(
    (limite: number) => setConsulta((c) => ({ ...c, pagina: 1, limite })),
    [],
  )
  const ordenarPor = useCallback(
    (orden: 'asc' | 'desc') => setConsulta((c) => ({ ...c, pagina: 1, orden })),
    [],
  )

  return {
    filas: datos?.datos ?? [],
    paginacion: datos?.paginacion ?? {
      pagina: 1,
      limite: consulta.limite,
      total: 0,
      totalPaginas: 0,
    },
    cargando,
    error,
    recargar,
    consulta,
    buscar,
    cambiarPagina,
    cambiarLimite,
    ordenarPor,
  }
}
