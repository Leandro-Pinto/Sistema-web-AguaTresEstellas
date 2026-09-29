/**
 * UTILIDADES DE FECHAS
 *
 * Toda la aplicación maneja fechas en horario local de Lima (UTC-5). Guardar
 * en UTC y convertir al leer evita que un pedido del último día aparezca con
 * la fecha del día siguiente, que es el error clásico de estos sistemas y
 * arruinaría los reportes diarios de la tesis.
 */

export const DIAS_MS = 86_400_000;

/** Devuelve la fecha de hoy a medianoche local. */
export const inicioDelDia = (fecha: Date = new Date()): Date => {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  return d;
};

/** Devuelve el primer instante del día siguiente (exclusivo). */
export const finDelDia = (fecha: Date = new Date()): Date => {
  const d = inicioDelDia(fecha);
  d.setDate(d.getDate() + 1);
  return d;
};

/** Suma (o resta) días a una fecha sin depender de meses de 30 días. */
export const sumarDias = (fecha: Date, dias: number): Date =>
  new Date(fecha.getTime() + dias * DIAS_MS);

/**
 * Interpreta una cadena `YYYY-MM-DD` como medianoche local.
 * `new Date('2026-01-15')` se interpreta en UTC y en Lima retrocede un día,
 * por eso se construye de forma explícita.
 */
export const normalizarFecha = (valor: string | Date): Date => {
  if (valor instanceof Date) return inicioDelDia(valor);
  const soloFecha = /^\d{4}-\d{2}-\d{2}$/.test(valor);
  if (soloFecha) {
    const [anio, mes, dia] = valor.split('-').map(Number);
    return new Date(anio, mes - 1, dia, 0, 0, 0, 0);
  }
  return new Date(valor);
};

/** Rango inclusivo por días completos: [inicio del primer día, fin del último]. */
export const rangoPorDefecto = (dias: number): { fechaInicio: Date; fechaFin: Date } => {
  const hoy = inicioDelDia();
  const primerDia = sumarDias(hoy, -(dias - 1));
  return { fechaInicio: primerDia, fechaFin: finDelDia(hoy) };
};

/**
 * Resuelve un rango pedido por el usuario. Si falta una fecha, se completa
 * con el último día. Se usa en reportes e indicadores.
 */
export const resolverRango = (
  fechaInicio?: string | Date,
  fechaFin?: string | Date,
): { fechaInicio: Date; fechaFin: Date } => {
  const fin = fechaFin ? finDelDia(normalizarFecha(fechaFin)) : finDelDia();
  const inicio = fechaInicio
    ? inicioDelDia(normalizarFecha(fechaInicio))
    : sumarDias(inicioDelDia(fin), -29);
  // Si el usuario invierte las fechas, se corrige en lugar de devolver vacío.
  if (inicio > fin) return { fechaInicio: fin, fechaFin: inicio };
  return { fechaInicio: inicio, fechaFin: fin };
};

/** Formatea una fecha como `YYYY-MM-DD` en hora local (no UTC). */
export const aIsoFecha = (fecha: Date): string => {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
};

/** Formatea fecha y hora local `YYYY-MM-DD HH:mm`. */
export const aIsoFechaHora = (fecha: Date): string =>
  `${aIsoFecha(fecha)} ${String(fecha.getHours()).padStart(2, '0')}:${String(fecha.getMinutes()).padStart(2, '0')}`;

/** Semana ISO-8601, necesario para agrupar el consolidado por semana. */
export const numeroSemanaIso = (fecha: Date): number => {
  const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
  const diaNumero = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - diaNumero);
  const inicioAnio = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - inicioAnio.getTime()) / DIAS_MS + 1) / 7);
};

/** Etiquetas de los últimos `dias` días, para las gráficas del tablero. */
export const ultimosDias = (dias: number): string[] => {
  const hoy = inicioDelDia();
  return Array.from({ length: dias }, (_, i) => aIsoFecha(sumarDias(hoy, -(dias - 1 - i))));
};
