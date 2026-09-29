import { z } from 'zod';
import { dineroSchema, paginacionSchema, textoObligatorio, textoOpcional } from './comunes.validator';

export const crearProductoSchema = z.object({
  codigo: textoObligatorio(30, 'El código').transform((v) => v.toUpperCase()),
  nombre: textoObligatorio(150, 'El nombre'),
  descripcion: textoOpcional(1000),
  /// Obligatoria con valor por defecto: es NOT NULL en la base y de ella
  /// depende la lectura correcta de los reportes por unidad. Se convierte un
  /// null explícito en el valor por defecto para no romper la actualización.
  unidadMedida: textoOpcional(20)
    .transform((v) => v ?? 'UNIDAD')
    .default('UNIDAD'),
  precioVenta: dineroSchema.refine((v) => v > 0, {
    message: 'El precio de venta debe ser mayor que cero',
  }),
  costoUnitario: dineroSchema.optional().nullable(),
  stockInicial: z.coerce.number().int().min(0).default(0),
  stockMinimo: z.coerce.number().int().min(0).default(0),
  esRetornable: z.boolean().default(false),
  activo: z.boolean().default(true),
});

export const actualizarProductoSchema = crearProductoSchema
  .omit({ stockInicial: true })
  .partial();

export const listarProductosSchema = paginacionSchema.extend({
  busqueda: textoOpcional(100),
  activo: z.enum(['true', 'false', 'todos']).default('todos'),
  esRetornable: z.enum(['true', 'false', 'todos']).default('todos'),
  soloStockBajo: z.enum(['true', 'false']).default('false'),
  incluirEliminados: z.enum(['true', 'false']).default('false'),
});

/**
 * Movimiento de inventario. El stock NUNCA se edita desde el frontend:
 * solo se registra un movimiento, y el servicio recalcula el stock.
 */
export const movimientoInventarioSchema = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('ENTRADA'),
    productoId: z.coerce.number().int().positive(),
    cantidad: z.coerce.number().int().positive('La cantidad debe ser mayor que cero'),
    origen: textoObligatorio(40, 'El origen'),
    observaciones: textoOpcional(255),
  }),
  z.object({
    tipo: z.literal('SALIDA'),
    productoId: z.coerce.number().int().positive(),
    cantidad: z.coerce.number().int().positive('La cantidad debe ser mayor que cero'),
    origen: textoObligatorio(40, 'El origen'),
    observaciones: textoOpcional(255),
  }),
  z.object({
    tipo: z.literal('AJUSTE'),
    productoId: z.coerce.number().int().positive(),
    /// Para el ajuste se indica el stock final deseado; el sistema calcula
    /// la diferencia y guarda stockAnterior y stockResultante.
    stockFinal: z.coerce.number().int().min(0, 'El stock final no puede ser negativo'),
    origen: z.literal('AJUSTE MANUAL'),
    observaciones: textoObligatorio(255, 'Explique el motivo del ajuste'),
  }),
]);

export const listarMovimientosInventarioSchema = paginacionSchema.extend({
  productoId: z.coerce.number().int().positive().optional(),
  tipo: z.enum(['ENTRADA', 'SALIDA', 'AJUSTE', 'todos']).default('todos'),
  fechaInicio: z.coerce.date().optional(),
  fechaFin: z.coerce.date().optional(),
});

export type CrearProductoInput = z.infer<typeof crearProductoSchema>;
export type ActualizarProductoInput = z.infer<typeof actualizarProductoSchema>;
export type MovimientoInventarioInput = z.infer<typeof movimientoInventarioSchema>;
