import type { EstadoEntrega, EstadoPedido, EstadoVenta, MetodoPago } from '@/types/dominio'

/** Formatea un importe en soles con dos decimales. */
export const dinero = (valor: number | null | undefined): string =>
  new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    minimumFractionDigits: 2,
  }).format(Number(valor ?? 0))

export const numero = (valor: number | null | undefined, decimales = 0): string =>
  new Intl.NumberFormat('es-PE', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(Number(valor ?? 0))

export const porcentaje = (valor: number | null | undefined, decimales = 1): string =>
  `${numero(valor, decimales)} %`

/**
 * Formatea una fecha y hora.
 *
 * Se usa `es-PE` con zona horaria explícita. Sin esto, una fecha guardada en
 * UTC se mostraría desplazada y un pedido registrado a las 8 de la mañana
 * podría aparecer del día anterior.
 */
export const fechaHora = (valor: string | Date | null | undefined): string => {
  if (!valor) return '—'
  const fecha = valor instanceof Date ? valor : new Date(valor)
  if (Number.isNaN(fecha.getTime())) return '—'
  return new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Lima',
  }).format(fecha)
}

export const soloFecha = (valor: string | Date | null | undefined): string => {
  if (!valor) return '—'
  const fecha = valor instanceof Date ? valor : new Date(valor)
  if (Number.isNaN(fecha.getTime())) return '—'
  return new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'medium',
    timeZone: 'America/Lima',
  }).format(fecha)
}

export const hora = (valor: string | Date | null | undefined): string => {
  if (!valor) return '—'
  const fecha = valor instanceof Date ? valor : new Date(valor)
  if (Number.isNaN(fecha.getTime())) return '—'
  return new Intl.DateTimeFormat('es-PE', {
    timeStyle: 'short',
    timeZone: 'America/Lima',
  }).format(fecha)
}

/** Devuelve "hace 5 min", "hace 2 h", "hace 3 días". */
export const desdeHace = (valor: string | Date | null | undefined): string => {
  if (!valor) return '—'
  const fecha = valor instanceof Date ? valor : new Date(valor)
  if (Number.isNaN(fecha.getTime())) return '—'

  const segundos = Math.floor((Date.now() - fecha.getTime()) / 1000)
  if (segundos < 60) return 'hace un momento'
  if (segundos < 3600) return `hace ${Math.floor(segundos / 60)} min`
  if (segundos < 86400) return `hace ${Math.floor(segundos / 3600)} h`
  if (segundos < 2592000) return `hace ${Math.floor(segundos / 86400)} días`
  return soloFecha(fecha)
}

/** Duración legible a partir de minutos. */
export const duracion = (minutos: number | null | undefined): string => {
  const total = Math.max(0, Math.round(Number(minutos ?? 0)))
  if (total === 0) return '0 min'
  if (total < 60) return `${total} min`
  const horas = Math.floor(total / 60)
  const resto = total % 60
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`
}

/** Fecha en formato `AAAA-MM-DD` para los campos de los formularios. */
export const paraCampoFecha = (fecha: Date = new Date()): string => {
  const d = new Date(fecha)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}

export const paraCampoFechaHora = (fecha: Date = new Date()): string => {
  const d = new Date(fecha)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

// --- Presentación de estados --------------------------------------------

type Estilo = 'neutro' | 'info' | 'exito' | 'aviso' | 'error'

const CLASES: Record<Estilo, string> = {
  neutro: 'bg-slate-100 text-slate-700 ring-slate-200',
  info: 'bg-marca-50 text-marca-700 ring-marca-200',
  exito: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  aviso: 'bg-amber-50 text-amber-800 ring-amber-200',
  error: 'bg-rose-50 text-rose-700 ring-rose-200',
}

export interface PresentacionEstado {
  etiqueta: string
  estilo: Estilo
}

const ESTADOS_PEDIDO: Record<EstadoPedido, PresentacionEstado> = {
  PENDIENTE: { etiqueta: 'Pendiente', estilo: 'neutro' },
  CONFIRMADO: { etiqueta: 'Confirmado', estilo: 'info' },
  ASIGNADO: { etiqueta: 'Asignado', estilo: 'info' },
  EN_RUTA: { etiqueta: 'En ruta', estilo: 'aviso' },
  ENTREGADO: { etiqueta: 'Entregado', estilo: 'exito' },
  CANCELADO: { etiqueta: 'Cancelado', estilo: 'error' },
}

const ESTADOS_ENTREGA: Record<EstadoEntrega, PresentacionEstado> = {
  PENDIENTE: { etiqueta: 'Pendiente', estilo: 'neutro' },
  ASIGNADA: { etiqueta: 'Asignada', estilo: 'info' },
  EN_RUTA: { etiqueta: 'En ruta', estilo: 'aviso' },
  ENTREGADA: { etiqueta: 'Entregada', estilo: 'exito' },
  NO_ENTREGADO: { etiqueta: 'No entregado', estilo: 'error' },
  CANCELADA: { etiqueta: 'Cancelada', estilo: 'error' },
}

const ESTADOS_VENTA: Record<EstadoVenta, PresentacionEstado> = {
  PENDIENTE: { etiqueta: 'Pendiente de cobro', estilo: 'aviso' },
  COMPLETADA: { etiqueta: 'Completada', estilo: 'exito' },
  ANULADA: { etiqueta: 'Anulada', estilo: 'error' },
}

const METODOS: Record<MetodoPago, string> = {
  EFECTIVO: 'Efectivo',
  YAPE: 'Yape',
  TRANSFERENCIA: 'Transferencia',
  OTRO: 'Otro',
}

/**
 * Un único punto de traducción de estados a presentación.
 *
 * Repartir estas etiquetas por cada pantalla es como aparecen dos colores
 * distintos para el mismo estado, o uno que el usuario no reconoce.
 */
export const presentacionPedido = (estado: EstadoPedido): PresentacionEstado =>
  ESTADOS_PEDIDO[estado] ?? { etiqueta: estado, estilo: 'neutro' }

export const presentacionEntrega = (estado: EstadoEntrega): PresentacionEstado =>
  ESTADOS_ENTREGA[estado] ?? { etiqueta: estado, estilo: 'neutro' }

export const presentacionVenta = (estado: EstadoVenta): PresentacionEstado =>
  ESTADOS_VENTA[estado] ?? { etiqueta: estado, estilo: 'neutro' }

export const presentacionEstadoVenta = (estado: string): PresentacionEstado =>
  ESTADOS_VENTA[estado as EstadoVenta] ?? { etiqueta: estado, estilo: 'neutro' }

export const nombreMetodoPago = (metodo: string): string =>
  METODOS[metodo as MetodoPago] ?? metodo

export const clasesEstado = (estilo: Estilo): string => CLASES[estilo]

/** Convierte "ADMINISTRADOR" en "Administrador" para mostrarlo. */
export const tituloRol = (rol: string): string =>
  rol.charAt(0) + rol.slice(1).toLowerCase().replace(/_/g, ' ')

/** Junta clases descartando las vacías. */
export const clases = (...valores: (string | false | null | undefined)[]): string =>
  valores.filter(Boolean).join(' ')
