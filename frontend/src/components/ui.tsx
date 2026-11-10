import { useEffect, useId } from 'react'
import { createPortal } from 'react-dom'
import { ErrorApi } from '@/services/http'
import { clases } from '@/utils/formato'

// --- Botón ----------------------------------------------------------------

type Variante = 'primario' | 'secundario' | 'peligro' | 'fantasma' | 'exito'

const VARIANTES: Record<Variante, string> = {
  primario: 'bg-marca-600 text-white hover:bg-marca-700 focus-visible:outline-marca-600 shadow-sm',
  secundario:
    'bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 focus-visible:outline-slate-400',
  peligro: 'bg-rose-600 text-white hover:bg-rose-700 focus-visible:outline-rose-600 shadow-sm',
  exito: 'bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:outline-emerald-600 shadow-sm',
  fantasma: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-slate-400',
}

interface BotonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante
  cargando?: boolean
  icono?: React.ReactNode
  /** `sm` mantiene el botón en la altura de las barras de herramientas. */
  tamano?: 'sm' | 'md'
}

export const Boton = ({
  variante = 'primario',
  cargando = false,
  icono,
  tamano = 'md',
  className,
  children,
  disabled,
  ...resto
}: BotonProps) => (
  <button
    type="button"
    // Un botón en vuelo no debe aceptar un segundo clic: sin esto, un doble
    // clic en "Guardar" crearía dos pedidos.
    disabled={disabled || cargando}
    aria-busy={cargando}
    className={clases(
      'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors',
      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
      'disabled:cursor-not-allowed disabled:opacity-60',
      tamano === 'sm' ? 'px-2.5 py-1.5 text-sm' : 'px-4 py-2.5 text-sm',
      VARIANTES[variante],
      className,
    )}
    {...resto}
  >
    {cargando ? <Girador /> : icono}
    {children}
  </button>
)

const Girador = () => (
  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
    />
  </svg>
)

// --- Campos de formulario --------------------------------------------------

interface CampoProps {
  etiqueta: string
  error?: string
  ayuda?: string
  requerido?: boolean
  className?: string
  children: (identificador: string) => React.ReactNode
}

const clasesCampo = (error?: string) =>
  clases(
    'block w-full rounded-lg border-0 px-3 py-2 text-sm text-slate-900 shadow-sm',
    'ring-1 ring-inset transition focus:outline-none focus:ring-2',
    'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500',
    error
      ? 'ring-rose-300 focus:ring-rose-500'
      : 'ring-slate-300 focus:ring-marca-500',
  )

/**
 * Envoltorio de un campo de formulario.
 *
 * Centraliza el enlace entre `label`, `input` y el mensaje de error. Es un
 * requisito de accesibilidad, no un detalle de estilo: un lector de pantalla
 * no anuncia el error si el campo no lo referencia, y el usuario con baja
 * visión no distingue el borde rojo de un campo sin explicar.
 */
export const Campo = ({ etiqueta, error, ayuda, requerido, className, children }: CampoProps) => {
  const id = useId()
  const idError = `${id}-error`
  const idAyuda = `${id}-ayuda`

  return (
    <div className={clases('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {etiqueta}
        {requerido && (
          <span className="ml-0.5 text-rose-600" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children(id)}
      {ayuda && !error && (
        <p id={idAyuda} className="text-xs text-slate-500">
          {ayuda}
        </p>
      )}
      {error && (
        <p id={idError} role="alert" className="text-xs font-medium text-rose-600">
          {error}
        </p>
      )}
    </div>
  )
}

interface EntradaProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'className'> {
  etiqueta: string
  error?: string
  ayuda?: string
  /** Marca el campo como obligatorio en el `Campo` y en el HTML. */
  requerido?: boolean
  /** Se combina con las clases del campo, no la reemplaza. */
  className?: string
}

export const Entrada = ({ etiqueta, error, ayuda, requerido, className, ...resto }: EntradaProps) => (
  <Campo etiqueta={etiqueta} error={error} ayuda={ayuda} requerido={requerido} className={className}>
    {(id) => (
      <input
        id={id}
        required={requerido}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : ayuda ? `${id}-ayuda` : undefined}
        className={clasesCampo(error)}
        {...resto}
      />
    )}
  </Campo>
)

interface AreaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> {
  etiqueta: string
  error?: string
  ayuda?: string
  requerido?: boolean
  /** Se renombra porque `filas` colisiona con el atributo `rows` nativo. */
  filas?: number
  className?: string
}

export const AreaTexto = ({
  etiqueta,
  error,
  ayuda,
  requerido,
  filas = 3,
  className,
  ...resto
}: AreaProps) => (
  <Campo etiqueta={etiqueta} error={error} ayuda={ayuda} requerido={requerido} className={className}>
    {(id) => (
      <textarea
        id={id}
        rows={filas}
        required={requerido}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : ayuda ? `${id}-ayuda` : undefined}
        className={clases(clasesCampo(error), 'resize-y')}
        {...resto}
      />
    )}
  </Campo>
)

interface SeleccionProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'className'> {
  etiqueta: string
  error?: string
  ayuda?: string
  /** Pares `[valor, texto]`. El texto vacío es el marcador "sin filtro". */
  opciones: { valor: string | number; texto: string }[]
  marcador?: string
  requerido?: boolean
  className?: string
}

export const Seleccion = ({
  etiqueta,
  error,
  ayuda,
  opciones,
  marcador,
  requerido,
  className,
  ...resto
}: SeleccionProps) => (
  <Campo etiqueta={etiqueta} error={error} ayuda={ayuda} requerido={requerido} className={className}>
    {(id) => (
      <select
        id={id}
        required={requerido}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : ayuda ? `${id}-ayuda` : undefined}
        className={clases(clasesCampo(error), 'pr-8')}
        {...resto}
      >
        {marcador !== undefined && <option value="">{marcador}</option>}
        {opciones.map((opcion) => (
          <option key={opcion.valor} value={opcion.valor}>
            {opcion.texto}
          </option>
        ))}
      </select>
    )}
  </Campo>
)

export const Casilla = ({
  etiqueta,
  error,
  ...resto
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'className'> & {
  etiqueta: string
  error?: string
}) => {
  const id = useId()
  return (
    <div className="flex items-start gap-2">
      <input
        id={id}
        type="checkbox"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-marca-600 focus:ring-marca-500 disabled:opacity-50"
        {...resto}
      />
      <label htmlFor={id} className="text-sm text-slate-700">
        {etiqueta}
      </label>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-rose-600">
          {error}
        </p>
      )}
    </div>
  )
}

// --- Indicadores de estado ------------------------------------------------

export const Etiqueta = ({
  children,
  tono = 'neutro',
}: {
  children: React.ReactNode
  tono?: 'neutro' | 'info' | 'exito' | 'aviso' | 'error'
}) => (
  <span
    className={clases(
      'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
      tono === 'neutro' && 'bg-slate-100 text-slate-700 ring-slate-200',
      tono === 'info' && 'bg-marca-50 text-marca-700 ring-marca-200',
      tono === 'exito' && 'bg-emerald-50 text-emerald-700 ring-emerald-200',
      tono === 'aviso' && 'bg-amber-50 text-amber-800 ring-amber-200',
      tono === 'error' && 'bg-rose-50 text-rose-700 ring-rose-200',
    )}
  >
    {children}
  </span>
)

export const Cargador = ({ texto = 'Cargando…' }: { texto?: string }) => (
  <div className="flex items-center justify-center gap-3 py-12 text-sm text-slate-500" role="status">
    <Girador />
    {texto}
  </div>
)

export const EsquemaCarga = ({ filas = 5 }: { filas?: number }) => (
  <div className="space-y-2 p-4" aria-hidden="true">
    {Array.from({ length: filas }, (_, indice) => (
      <div
        key={indice}
        className="h-9 animate-pulse rounded bg-slate-100"
        // El retardo escalonado simula la llegada escalonada de las filas y
        // evita el efecto de parpadeo cuando aparece la tabla.
        style={{ animationDelay: `${indice * 60}ms` }}
      />
    ))}
  </div>
)

interface VacioProps {
  titulo: string
  descripcion?: string
  accion?: React.ReactNode
}

export const Vacio = ({ titulo, descripcion, accion }: VacioProps) => (
  <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
    <svg className="h-10 w-10 text-slate-300" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 13V7a2 2 0 00-2-2h-3l-2-3h-5a2 2 0 00-2 2v9a2 2 0 002 2h4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18 17a2 2 0 100 4 2 2 0 000-4zM8 17a2 2 0 100 4 2 2 0 000-4zM13 13l3 3 5-5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
    <p className="text-sm font-medium text-slate-800">{titulo}</p>
    {descripcion && <p className="max-w-sm text-sm text-slate-500">{descripcion}</p>}
    {accion && <div className="mt-2">{accion}</div>}
  </div>
)

export const Error_ = ({ error, reintentar }: { error: ErrorApi | Error; reintentar?: () => void }) => {
  const mensaje = error instanceof ErrorApi ? error.message : 'Ocurrió un error inesperado.'
  // Un 403 no es un fallo: significa que el usuario llegó a una sección que
  // no le corresponde. Decirle "error" sería confuso.
  if (error instanceof ErrorApi && error.esSinPermiso) {
    return (
      <Vacio
        titulo="No tiene permisos para ver esta sección"
        descripcion="Si cree que debería tener acceso, solicítelo al administrador del sistema."
      />
    )
  }

  return (
    <div
      role="alert"
      className="mx-auto my-6 flex max-w-lg flex-col items-center gap-3 rounded-lg bg-rose-50 p-6 text-center ring-1 ring-rose-200"
    >
      <svg className="h-8 w-8 text-rose-500" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 8v5M12 16h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <p className="text-sm font-medium text-rose-900">{mensaje}</p>
      {reintentar && (
        <Boton variante="secundario" tamano="sm" onClick={reintentar}>
          Reintentar
        </Boton>
      )}
    </div>
  )
}

// --- Modal ----------------------------------------------------------------

interface ModalProps {
  abierto: boolean
  titulo: string
  descripcion?: string
  ancho?: 'sm' | 'md' | 'lg' | 'xl'
  alCerrar: () => void
  children?: React.ReactNode
  pie?: React.ReactNode
}

const ANCHOS = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }

/**
 * Diálogo modal con cierre por Escape y por clic en el fondo.
 *
 * El bloqueo de scroll del `<body>` evita el efecto famoso de "el modal se
 * desliza hacia atrás" cuando el contenido de la página sigue teniendo scroll
 * detrás de la capa.
 */
export const Modal = ({ abierto, titulo, descripcion, ancho = 'md', alCerrar, children, pie }: ModalProps) => {
  useEffect(() => {
    if (!abierto) return
    const alPresionar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') alCerrar()
    }
    const scrollPrevio = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', alPresionar)
    return () => {
      document.body.style.overflow = scrollPrevio
      document.removeEventListener('keydown', alPresionar)
    }
  }, [abierto, alCerrar])

  // Evita que el modal desaparezca mientras se guarda un formulario: si el
  // estado se actualiza a `false` durante el envío, el usuario perdería todo
  // lo escrito y el error aparecería en una pantalla ya cerrada.
  if (!abierto) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[1px]"
        onClick={alCerrar}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={clases(
          'relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl',
          ANCHOS[ancho],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{titulo}</h2>
            {descripcion && <p className="mt-0.5 text-sm text-slate-500">{descripcion}</p>}
          </div>
          <button
            type="button"
            onClick={alCerrar}
            aria-label="Cerrar"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {pie && (
          <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
            {pie}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

interface ConfirmacionProps {
  abierto: boolean
  titulo: string
  mensaje: string
  textoConfirmar?: string
  procesando?: boolean
  onConfirmar: () => void
  onCancelar: () => void
}

/**
 * Confirmación para acciones irreversibles.
 *
 * Existe como componente y no como `window.confirm` por dos razones: el
 * mensaje necesita poder mostrar qué registro se va a afectar, y el estilo
 * nativo no es personalizable ni accesible de forma consistente.
 */
export const Confirmacion = ({
  abierto,
  titulo,
  mensaje,
  textoConfirmar = 'Confirmar',
  procesando,
  onConfirmar,
  onCancelar,
}: ConfirmacionProps) => (
  <Modal
    abierto={abierto}
    titulo={titulo}
    ancho="sm"
    alCerrar={onCancelar}
    pie={
      <>
        <Boton variante="secundario" onClick={onCancelar} disabled={procesando}>
          Cancelar
        </Boton>
        <Boton variante="peligro" onClick={onConfirmar} cargando={procesando}>
          {textoConfirmar}
        </Boton>
      </>
    }
  >
    <p className="text-sm text-slate-700">{mensaje}</p>
  </Modal>
)

// --- Tabla ----------------------------------------------------------------

interface TablaProps<T> {
  columnas: { clave: string; encabezado: string; clase?: string }[]
  filas: T[]
  claveFila: (fila: T) => string | number
  cargando?: boolean
  error?: ErrorApi | Error | null
  reintentar?: () => void
  vacio?: VacioProps
  alHacerClic?: (fila: T) => void
  renderFila: (fila: T) => React.ReactNode
}

/**
 * Tabla con los tres estados que la apliquen: cargando, error y sin datos.
 *
 * Cada uno reemplaza el cuerpo en lugar de coexistir con él. Mostrar el
 * esqueleto encima de las filas antiguas produce una tabla con dos fuentes de
 * verdad que el usuario no puede distinguir.
 */
export function Tabla<T>({
  columnas,
  filas,
  claveFila,
  cargando,
  error,
  reintentar,
  vacio,
  alHacerClic,
  renderFila,
}: TablaProps<T>) {
  if (error) return <Error_ error={error} reintentar={reintentar} />
  if (cargando) return <EsquemaCarga filas={columnas.length} />
  if (filas.length === 0) {
    return <Vacio titulo="Sin resultados" descripcion="No hay registros que coincidan con el filtro." {...vacio} />
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead>
          <tr>
            {columnas.map((columna) => (
              <th
                key={columna.clave}
                scope="col"
                className={clases(
                  'whitespace-nowrap bg-slate-50 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-600',
                  columna.clase,
                )}
              >
                {columna.encabezado}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {filas.map((fila) => (
            <tr
              key={claveFila(fila)}
              onClick={alHacerClic ? () => alHacerClic(fila) : undefined}
              onKeyDown={
                alHacerClic
                  ? (evento) => {
                      if (evento.key === 'Enter' || evento.key === ' ') {
                        evento.preventDefault()
                        alHacerClic(fila)
                      }
                    }
                  : undefined
              }
              // Una fila clicable debe poder activarse con el teclado; sin
              // `tabIndex` y `role`, no lo está.
              tabIndex={alHacerClic ? 0 : undefined}
              className={clases(alHacerClic && 'cursor-pointer hover:bg-marca-50/40 focus:bg-marca-50/40 focus:outline-none')}
            >
              {renderFila(fila)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Celda estándar. Se exporta para que las tablas de cada módulo sean legibles. */
export const Celda = ({
  children,
  className,
  numerica,
}: {
  children: React.ReactNode
  className?: string
  numerica?: boolean
}) => (
  <td
    className={clases(
      'whitespace-nowrap px-4 py-2.5 text-slate-700',
      numerica && 'text-right tabular-nums',
      className,
    )}
  >
    {children}
  </td>
)

// --- Paginación -----------------------------------------------------------

interface PaginacionProps {
  pagina: number
  totalPaginas: number
  total: number
  limite: number
  alCambiar: (pagina: number) => void
  alCambiarLimite?: (limite: number) => void
}

export const Paginador = ({
  pagina,
  totalPaginas,
  total,
  limite,
  alCambiar,
  alCambiarLimite,
}: PaginacionProps) => {
  if (total === 0) return null

  const desde = (pagina - 1) * limite + 1
  const hasta = Math.min(pagina * limite, total)

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row">
      <p className="text-sm text-slate-600">
        Mostrando <span className="font-medium text-slate-800">{desde}</span>–
        <span className="font-medium text-slate-800">{hasta}</span> de{' '}
        <span className="font-medium text-slate-800">{total}</span>
      </p>

      <div className="flex items-center gap-3">
        {alCambiarLimite && (
          <label className="flex items-center gap-1.5 text-sm text-slate-600">
            Filas
            <select
              value={limite}
              onChange={(evento) => alCambiarLimite(Number(evento.target.value))}
              className="rounded-lg border-0 py-1 pl-2 pr-7 text-sm shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-marca-500"
            >
              {[10, 20, 50, 100].map((valor) => (
                <option key={valor} value={valor}>
                  {valor}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="flex items-center gap-1">
          <Boton
            variante="secundario"
            tamano="sm"
            disabled={pagina <= 1}
            onClick={() => alCambiar(pagina - 1)}
            aria-label="Página anterior"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </Boton>
          <span className="px-2 text-sm text-slate-600">
            Página <span className="font-medium text-slate-800">{pagina}</span> de {totalPaginas}
          </span>
          <Boton
            variante="secundario"
            tamano="sm"
            disabled={pagina >= totalPaginas}
            onClick={() => alCambiar(pagina + 1)}
            aria-label="Página siguiente"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </Boton>
        </div>
      </div>
    </div>
  )
}

// --- Avisos ---------------------------------------------------------------

type Aviso = 'exito' | 'error' | 'info' | 'aviso'

const ESTILOS_AVISO: Record<Aviso, string> = {
  exito: 'bg-emerald-50 text-emerald-900 ring-emerald-200',
  error: 'bg-rose-50 text-rose-900 ring-rose-200',
  info: 'bg-marca-50 text-marca-900 ring-marca-200',
  aviso: 'bg-amber-50 text-amber-900 ring-amber-200',
}

/**
 * Aviso flotante de resultado.
 *
 * Va en un portal para no quedar atrapado dentro de un contenedor con
 * `overflow: hidden` (una tabla, un modal), donde se cortaría.
 */
export const Aviso = ({
  tipo,
  mensaje,
  alCerrar,
}: {
  tipo: Aviso
  mensaje: string
  alCerrar: () => void
}) => {
  useEffect(() => {
    // Los errores no desaparecen solos: un mensaje que se va por tiempo puede
    // borrar la causa antes de que el usuario lo lea.
    if (tipo === 'exito' || tipo === 'info') {
      const temporizador = setTimeout(alCerrar, 5000)
      return () => clearTimeout(temporizador)
    }
  }, [tipo, alCerrar])

  return createPortal(
    <div
      role={tipo === 'error' ? 'alert' : 'status'}
      className="fixed bottom-4 right-4 z-[60] max-w-sm"
    >
      <div
        className={clases(
          'flex items-start gap-3 rounded-lg p-4 text-sm shadow-lg ring-1',
          ESTILOS_AVISO[tipo],
        )}
      >
        <span className="flex-1">{mensaje}</span>
        <button
          type="button"
          onClick={alCerrar}
          aria-label="Cerrar aviso"
          className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100 focus-visible:outline focus-visible:outline-2"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>,
    document.body,
  )
}

/** Contenedor de página: título, descripción, acciones y contenido. */
export const Pagina = ({
  titulo,
  descripcion,
  acciones,
  children,
}: {
  titulo: string
  descripcion?: string
  acciones?: React.ReactNode
  children: React.ReactNode
}) => (
  <div className="space-y-5">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{titulo}</h1>
        {descripcion && <p className="mt-0.5 text-sm text-slate-600">{descripcion}</p>}
      </div>
      {acciones && <div className="flex shrink-0 flex-wrap gap-2">{acciones}</div>}
    </div>
    {children}
  </div>
)

/** Tarjeta blanca con borde, la superficie base de las secciones. */
export const Tarjeta = ({
  titulo,
  descripcion,
  acciones,
  sinRelleno,
  className,
  children,
}: {
  titulo?: string
  descripcion?: string
  acciones?: React.ReactNode
  sinRelleno?: boolean
  className?: string
  children: React.ReactNode
}) => (
  <section
    className={clases(
      'overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200',
      className,
    )}
  >
    {(titulo || acciones) && (
      <header className="flex flex-col justify-between gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center">
        <div>
          {titulo && <h2 className="text-sm font-semibold text-slate-900">{titulo}</h2>}
          {descripcion && <p className="mt-0.5 text-xs text-slate-500">{descripcion}</p>}
        </div>
        {acciones && <div className="flex shrink-0 gap-2">{acciones}</div>}
      </header>
    )}
    {sinRelleno ? children : <div className="p-4">{children}</div>}
  </section>
)
