import { z } from 'zod';
import {
  dineroSchema,
  documentoSchema,
  paginacionSchema,
  textoObligatorio,
  textoOpcional,
} from './comunes.validator';

// --- VENTAS ---------------------------------------------------------

/**
 * Una venta nace de un pedido confirmado. El servicio copia los precios
 * ya congelados del detalle del pedido, de modo que un cambio posterior en
 * el catálogo no altera la historia.
 */
export const crearVentaSchema = z.object({
  pedidoId: z.coerce.number().int().positive('Debe indicar el pedido'),
  descuento: dineroSchema.default(0),
  observaciones: textoOpcional(1000),
  /// Registra el pago en el mismo paso (frecuente: el cliente paga al recibir).
  pagoInicial: z
    .object({
      monto: dineroSchema,
      metodo: z.enum(['EFECTIVO', 'YAPE', 'TRANSFERENCIA', 'OTRO']),
      referencia: textoOpcional(60),
      observaciones: textoOpcional(500),
    })
    .optional(),
});

export const anularVentaSchema = z.object({
  motivo: textoObligatorio(255, 'Debe indicar el motivo de la anulación'),
  /// Al anular hay que reponer el inventario del producto.
  reponerInventario: z.boolean().default(true),
});

export const emitirConstanciaSchema = z.object({
  observaciones: textoOpcional(500),
});

export const listarVentasSchema = paginacionSchema.extend({
  busqueda: textoOpcional(100),
  clienteId: z.coerce.number().int().positive().optional(),
  pedidoId: z.coerce.number().int().positive().optional(),
  usuarioId: z.coerce.number().int().positive().optional(),
  estado: z.enum(['PENDIENTE', 'COMPLETADA', 'ANULADA', 'todos']).default('todos'),
  soloConSaldo: z.enum(['true', 'false']).default('false'),
  soloSinConstancia: z.enum(['true', 'false']).default('false'),
  fechaInicio: z.coerce.date().optional(),
  fechaFin: z.coerce.date().optional(),
});

export type CrearVentaInput = z.infer<typeof crearVentaSchema>;
export type ListarVentasQuery = z.infer<typeof listarVentasSchema>;

// --- PAGOS ----------------------------------------------------------

export const crearPagoSchema = z.object({
  ventaId: z.coerce.number().int().positive('Debe indicar la venta'),
  monto: dineroSchema.refine((v) => v > 0, {
    message: 'El monto del pago debe ser mayor que cero',
  }),
  metodo: z.enum(['EFECTIVO', 'YAPE', 'TRANSFERENCIA', 'OTRO']),
  referencia: textoOpcional(60),
  observaciones: textoOpcional(500),
  fecha: z.coerce.date().optional(),
});

export const anularPagoSchema = z.object({
  motivo: textoObligatorio(255, 'Debe indicar el motivo de la anulación'),
});

export const listarPagosSchema = paginacionSchema.extend({
  busqueda: textoOpcional(100),
  ventaId: z.coerce.number().int().positive().optional(),
  clienteId: z.coerce.number().int().positive().optional(),
  metodo: z.enum(['EFECTIVO', 'YAPE', 'TRANSFERENCIA', 'OTRO', 'todos']).default('todos'),
  estado: z.enum(['PENDIENTE', 'REGISTRADO', 'ANULADO', 'todos']).default('todos'),
  fechaInicio: z.coerce.date().optional(),
  fechaFin: z.coerce.date().optional(),
});

export type CrearPagoInput = z.infer<typeof crearPagoSchema>;
export type ListarPagosQuery = z.infer<typeof listarPagosSchema>;

// --- REPARTIDORES ---------------------------------------------------

export const crearRepartidorSchema = z.object({
  nombres: textoObligatorio(100, 'Los nombres'),
  apellidos: textoObligatorio(100, 'Los apellidos'),
  documento: documentoSchema,
  telefono: z
    .string()
    .trim()
    .min(6, 'El teléfono es obligatorio')
    .max(20)
    .transform((v) => v.replace(/\s+/g, '')),
  direccion: textoOpcional(200),
  zona: textoOpcional(100),
  activo: z.boolean().default(true),
});

export const actualizarRepartidorSchema = crearRepartidorSchema.partial();

export const listarRepartidoresSchema = paginacionSchema.extend({
  busqueda: textoOpcional(100),
  activo: z.enum(['true', 'false', 'todos']).default('todos'),
  zona: textoOpcional(100),
  incluirEliminados: z.enum(['true', 'false']).default('false'),
});

export type CrearRepartidorInput = z.infer<typeof crearRepartidorSchema>;
export type ListarRepartidoresQuery = z.infer<typeof listarRepartidoresSchema>;

// --- ENTREGAS -------------------------------------------------------

export const registrarEntregaSchema = z.object({
  pedidoId: z.coerce.number().int().positive('Debe indicar el pedido'),
  repartidorId: z.coerce.number().int().positive('Debe seleccionar un repartidor'),
  observaciones: textoOpcional(500),
});

export const actualizarEntregaSchema = z.object({
  estado: z.enum(['PENDIENTE', 'ASIGNADA', 'EN_RUTA', 'ENTREGADA', 'NO_ENTREGADO', 'CANCELADA']),
  horaSalida: z.coerce.date().optional().nullable(),
  horaEntrega: z.coerce.date().optional().nullable(),
  minutosDemora: z.coerce.number().int().min(0).max(1440).optional().nullable(),
  bidonesEntregados: z.coerce.number().int().min(0).optional(),
  bidonesDevueltos: z.coerce.number().int().min(0).optional(),
  montoRecibido: dineroSchema.optional(),
  motivoNoEntrega: textoOpcional(200),
  observaciones: textoOpcional(500),
  recibeFirma: z.boolean().optional(),
  /**
   * Bidones devueltos en la ruta. Genera los movimientos de devolución
   * asociados a la entrega, para no tener que registrarlos aparte.
   */
  devoluciones: z
    .array(
      z.object({
        clienteId: z.coerce.number().int().positive(),
        productoId: z.coerce.number().int().positive(),
        cantidad: z.coerce.number().int().min(0),
        observaciones: textoOpcional(255),
      }),
    )
    .optional(),
});

export const listarEntregasSchema = paginacionSchema.extend({
  busqueda: textoOpcional(100),
  repartidorId: z.coerce.number().int().positive().optional(),
  pedidoId: z.coerce.number().int().positive().optional(),
  estado: z
    .enum(['PENDIENTE', 'ASIGNADA', 'EN_RUTA', 'ENTREGADA', 'NO_ENTREGADO', 'CANCELADA', 'todos'])
    .default('todos'),
  fechaInicio: z.coerce.date().optional(),
  fechaFin: z.coerce.date().optional(),
});

/**
 * Filtros de la ruta propia del repartidor.
 *
 * Deliberadamente más estrecha que `listarEntregasSchema`: el repartidor no
 * puede filtrar por cliente ni por fecha, y la paginación sí es obligatoria
 * porque el servicio la necesita para armar `skip`/`take` de Prisma.
 */
export const misEntregasSchema = paginacionSchema
  .pick({ pagina: true, limite: true })
  .extend({
    estado: z
      .enum(['PENDIENTE', 'ASIGNADA', 'EN_RUTA', 'ENTREGADA', 'NO_ENTREGADO', 'CANCELADA', 'todos'])
      .default('todos'),
  });

export type RegistrarEntregaInput = z.infer<typeof registrarEntregaSchema>;
export type ActualizarEntregaInput = z.infer<typeof actualizarEntregaSchema>;
export type ListarEntregasQuery = z.infer<typeof listarEntregasSchema>;
export type MisEntregasQuery = z.infer<typeof misEntregasSchema>;

// --- BIDONES --------------------------------------------------------

export const movimientoBidonSchema = z
  .discriminatedUnion('tipo', [
    z.object({
      tipo: z.literal('ENTREGA'),
      clienteId: z.coerce.number().int().positive(),
      productoId: z.coerce.number().int().positive(),
      cantidad: z.coerce.number().int().positive('La cantidad debe ser mayor que cero'),
      pedidoId: z.coerce.number().int().positive().optional(),
      entregaId: z.coerce.number().int().positive().optional(),
      repartidorId: z.coerce.number().int().positive().optional(),
      observaciones: textoOpcional(255),
    }),
    z.object({
      tipo: z.literal('DEVOLUCION'),
      clienteId: z.coerce.number().int().positive(),
      productoId: z.coerce.number().int().positive(),
      cantidad: z.coerce.number().int().positive('La cantidad debe ser mayor que cero'),
      pedidoId: z.coerce.number().int().positive().optional(),
      entregaId: z.coerce.number().int().positive().optional(),
      repartidorId: z.coerce.number().int().positive().optional(),
      observaciones: textoOpcional(255),
    }),
    z.object({
      tipo: z.literal('PERDIDA'),
      clienteId: z.coerce.number().int().positive().optional().nullable(),
      productoId: z.coerce.number().int().positive(),
      cantidad: z.coerce.number().int().positive('La cantidad debe ser mayor que cero'),
      pedidoId: z.coerce.number().int().positive().optional(),
      entregaId: z.coerce.number().int().positive().optional(),
      repartidorId: z.coerce.number().int().positive().optional(),
      observaciones: textoObligatorio(255, 'Explique la pérdida del bidón'),
    }),
    z.object({
      tipo: z.literal('AJUSTE'),
      clienteId: z.coerce.number().int().positive().optional().nullable(),
      productoId: z.coerce.number().int().positive(),
      cantidad: z.coerce.number().int().min(1),
      /// Positivo suma al saldo del cliente; negativo lo reduce.
      signo: z.enum(['1', '-1']).default('1'),
      observaciones: textoObligatorio(255, 'Explique el ajuste'),
    }),
  ]);

export const listarMovimientosBidonSchema = paginacionSchema.extend({
  clienteId: z.coerce.number().int().positive().optional(),
  productoId: z.coerce.number().int().positive().optional(),
  pedidoId: z.coerce.number().int().positive().optional(),
  repartidorId: z.coerce.number().int().positive().optional(),
  tipo: z.enum(['ENTREGA', 'DEVOLUCION', 'PERDIDA', 'AJUSTE', 'todos']).default('todos'),
  fechaInicio: z.coerce.date().optional(),
  fechaFin: z.coerce.date().optional(),
});

export const listarSaldosBidonesSchema = paginacionSchema.extend({
  busqueda: textoOpcional(100),
  productoId: z.coerce.number().int().positive().optional(),
  soloConSaldo: z.enum(['true', 'false']).default('true'),
});

export type MovimientoBidonInput = z.infer<typeof movimientoBidonSchema>;
export type ListarMovimientosBidonQuery = z.infer<typeof listarMovimientosBidonSchema>;
export type ListarSaldosBidonesQuery = z.infer<typeof listarSaldosBidonesSchema>;

// --- HISTORIAL ------------------------------------------------------

export const listarHistorialSchema = paginacionSchema.extend({
  tipo: z
    .enum(['PEDIDO', 'VENTA', 'PAGO', 'ENTREGA', 'CLIENTE', 'PRODUCTO', 'REPARTIDOR', 'INVENTARIO', 'BIDON', 'USUARIO', 'todos'])
    .default('todos'),
  entidadId: z.coerce.number().int().positive().optional(),
  codigo: textoOpcional(20),
  usuarioId: z.coerce.number().int().positive().optional(),
  accion: textoOpcional(40),
  fechaInicio: z.coerce.date().optional(),
  fechaFin: z.coerce.date().optional(),
});

export type ListarHistorialQuery = z.infer<typeof listarHistorialSchema>;
