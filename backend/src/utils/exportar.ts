import type { Response } from 'express';
import { aIsoFechaHora } from './fechas';

/**
 * EXPORTACIÓN CSV
 *
 * Los reportes se pueden descargar como CSV porque así se abren en Excel sin
 * instalar nada, lo que importa en una PYME. Se genera en memoria (sin
 * librerías externas) y se envía como archivo adjunto.
 */

const BOM = '\uFEFF';

const escaparCelda = (valor: unknown): string => {
  if (valor === null || valor === undefined) return '';
  if (valor instanceof Date) return aIsoFechaHora(valor);
  // Los importes de Prisma llegan como Decimal. Sin esta conversión el
  // aplanado los desarmaba en `.s`, `.e` y `.d`, y el archivo resultante no
  // servía ni para abrirlo en Excel.
  if (esDecimal(valor)) return String(valor.toNumber());
  if (typeof valor === 'object') return escaparCelda(JSON.stringify(valor));
  const texto = String(valor);
  // El separador de la configuración regional puede ser ";" en Excel en
  // español; se entrecomilla cualquier valor que lo contenga.
  return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
};

/**
 * ¿Es un Decimal de Prisma?
 *
 * Se reconoce por su método `toNumber` en lugar de por `instanceof`, para no
 * atar este archivo a una versión concreta del runtime de Prisma.
 */
const esDecimal = (valor: unknown): valor is { toNumber(): number } =>
  typeof valor === 'object' &&
  valor !== null &&
  !(valor instanceof Date) &&
  !Array.isArray(valor) &&
  'toNumber' in valor &&
  typeof (valor as { toNumber?: unknown }).toNumber === 'function';

/** ¿Es un objeto simple, apto para desarmarse en columnas? */
const esObjetoSimple = (valor: unknown): valor is Record<string, unknown> => {
  if (typeof valor !== 'object' || valor === null) return false;
  if (valor instanceof Date || Array.isArray(valor) || esDecimal(valor)) return false;
  const prototipo = Object.getPrototypeOf(valor);
  return prototipo === Object.prototype || prototipo === null;
};

/** Aplana objetos anidados con notación de punto (cliente.nombre -> columna). */
const aplanar = (
  fila: Record<string, unknown>,
  prefijo = '',
): Record<string, string> => {
  const salida: Record<string, string> = {};
  for (const [clave, valor] of Object.entries(fila)) {
    const nombre = prefijo ? `${prefijo}.${clave}` : clave;
    if (esObjetoSimple(valor)) {
      Object.assign(salida, aplanar(valor, nombre));
    } else {
      salida[nombre] = escaparCelda(valor);
    }
  }
  return salida;
};

/**
 * Convierte un reporte en CSV.
 *
 * Un reporte no es una sola tabla: trae un resumen y varias listas. Se exporta
 * la lista más extensa, que es el detalle que el usuario está mirando en
 * pantalla, y no la primera que aparezca en el objeto.Tomar la primera hacía
 * que "ventas" se descargara con el cuadro por método de pago (4 filas) en
 * lugar de las ventas del periodo.
 *
 * Cuando el reporte no tiene ninguna lista (los tiempos de proceso son solo
 * indicadores), se exporta en dos columnas: indicador y valor.
 */
export const aCsv = (contenido: unknown): string => {
  const filas = extraerFilas(contenido);
  if (filas.length === 0) {
    const indicadores = extraerEscalares(contenido);
    if (indicadores.length === 0) return `${BOM}sin registros`;
    return [
      BOM,
      'indicador;valor',
      ...indicadores.map(([clave, valor]) => `${escaparCelda(clave)};${escaparCelda(valor)}`),
    ].join('\r\n');
  }

  const cabeceras = [...new Set(filas.flatMap((f) => Object.keys(f)))];
  const cuerpo = filas.map((fila) => cabeceras.map((c) => fila[c] ?? '').join(';'));
  return [BOM, cabeceras.join(';'), ...cuerpo].join('\r\n');
};

/** Devuelve la lista más extensa dentro de una estructura anidada. */
const extraerFilas = (contenido: unknown, profundidad = 0): Record<string, string>[] => {
  if (profundidad > 4) return [];
  if (Array.isArray(contenido)) {
    const objetos = contenido.filter(
      (v): v is Record<string, unknown> => !!v && typeof v === 'object' && !(v instanceof Date),
    );
    return objetos.map((o) => aplanar(o));
  }
  if (contenido && typeof contenido === 'object') {
    let mejor: Record<string, string>[] = [];
    for (const valor of Object.values(contenido as Record<string, unknown>)) {
      const encontradas = extraerFilas(valor, profundidad + 1);
      if (encontradas.length > mejor.length) mejor = encontradas;
    }
    return mejor;
  }
  return [];
};

/** Recolecta los valores escalares con su ruta, para reportes sin listas. */
const extraerEscalares = (contenido: unknown, prefijo = '', profundidad = 0): [string, unknown][] => {
  if (profundidad > 4 || contenido === null || contenido === undefined) return [];
  if (contenido instanceof Date) return [[prefijo, aIsoFechaHora(contenido)]];
  if (esDecimal(contenido)) return [[prefijo, contenido.toNumber()]];
  if (Array.isArray(contenido)) return [];
  if (typeof contenido === 'object') {
    return Object.entries(contenido as Record<string, unknown>).flatMap(([clave, valor]) =>
      extraerEscalares(valor, prefijo ? `${prefijo}.${clave}` : clave, profundidad + 1),
    );
  }
  return [[prefijo, contenido]];
};

/** Nombre de archivo normalizado: `reporte_ventas_2026-01-15.csv`. */
export const nombreArchivo = (prefijo: string, sufijo = 'csv'): string => {
  const marca = aIsoFechaHora(new Date()).replace(/[: ]/g, '-');
  return `${prefijo.replace(/\s+/g, '_')}_${marca}.${sufijo}`;
};

/** Envía un CSV como descarga y termina la respuesta. */
export const responderCsv = (res: Response, prefijo: string, contenido: unknown): Response => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo(prefijo)}"`);
  return res.status(200).send(aCsv(contenido));
};

/**
 * Resuelve un valor de money de Prisma (Decimal) u otros tipos de forma
 * segura para serializar a JSON sin perder precisión.
 */
export const serializarDinero = (valor: unknown): number =>
  typeof valor === 'object' && valor !== null && 'toNumber' in valor
    ? (valor as { toNumber(): number }).toNumber()
    : Number(valor ?? 0);
