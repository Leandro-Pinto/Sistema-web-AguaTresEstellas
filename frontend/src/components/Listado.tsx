import { Boton, Paginador, Tabla } from '@/components/ui'
import type { EstadoListado } from '@/hooks/useListado'

/** Barra de un listado: búsqueda a la izquierda, filtros y acciones a la derecha. */
export const BarraListado = ({
  busqueda,
  alBuscar,
  marcador = 'Buscar…',
  children,
  alRecargar,
}: {
  busqueda: string
  alBuscar: (valor: string) => void
  marcador?: string
  children?: React.ReactNode
  alRecargar?: () => void
}) => (
  <div className="flex flex-col gap-3 border-b border-slate-200 p-3 sm:flex-row sm:items-center">
    <div className="relative flex-1">
      <svg
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        value={busqueda}
        onChange={(evento) => alBuscar(evento.target.value)}
        placeholder={marcador}
        aria-label={marcador.replace('…', '')}
        className="w-full rounded-lg border-0 py-2 pl-9 pr-3 text-sm shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-marca-500"
      />
    </div>

    <div className="flex flex-wrap items-end gap-2">
      {children}
      {alRecargar && (
        <Boton variante="secundario" onClick={alRecargar} aria-label="Actualizar listado">
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            aria-hidden="true"
          >
            <path
              d="M21 12a9 9 0 11-2.6-6.4M21 3v6h-6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Actualizar
        </Boton>
      )}
    </div>
  </div>
)

interface ListadoProps<T> extends EstadoListado<T> {
  columnas: { clave: string; encabezado: string; clase?: string }[]
  claveFila: (fila: T) => string | number
  renderFila: (fila: T) => React.ReactNode
  alHacerClic?: (fila: T) => void
  barra?: React.ReactNode
  /** Contenido entre la barra y la tabla: filtros propios del módulo. */
  filtros?: React.ReactNode
  vacio?: { titulo: string; descripcion?: string; accion?: React.ReactNode }
}

/**
 * Superficie completa de un listado: barra, filtros, tabla y paginación.
 *
 * La paginación se oculta cuando no hay resultados: un "Página 1 de 0" es ruido
 * y, en un listado vacío, lo único útil es el mensaje o la acción que explica
 * cómo crear el primer registro.
 */
export function Listado<T>({
  columnas,
  claveFila,
  renderFila,
  alHacerClic,
  barra,
  filtros,
  vacio,
  filas,
  paginacion,
  cargando,
  error,
  recargar,
  cambiarPagina,
  cambiarLimite,
}: ListadoProps<T>) {
  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      {barra}
      {filtros}
      <Tabla
        columnas={columnas}
        filas={filas}
        claveFila={claveFila}
        cargando={cargando}
        error={error}
        reintentar={recargar}
        renderFila={renderFila}
        alHacerClic={alHacerClic}
        vacio={vacio}
      />
      {paginacion.total > 0 && (
        <Paginador
          pagina={paginacion.pagina}
          totalPaginas={paginacion.totalPaginas}
          total={paginacion.total}
          limite={paginacion.limite}
          alCambiar={cambiarPagina}
          alCambiarLimite={cambiarLimite}
        />
      )}
    </div>
  )
}
