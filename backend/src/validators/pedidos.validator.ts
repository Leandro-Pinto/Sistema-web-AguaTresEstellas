import { z } from 'zod';
import {
  cantidadSchema,
  dineroSchema,
  paginacionSchema,
  textoOpcional,
} from './comunes.validator';

const detalleSchema = z.object({
  productoId: z.coerce.number().int().positive('Debe seleccionar un producto'),
  cantidad: cantidadSchema,
  observaciones: textoOpcional(255),
});

/**
 * Registro de pedido.
 *
 * `recibidoEn` es la hora en que el cliente comunicó el pedido (llamada o
 * WhatsApp). `registradoEn` la calcula el sistema al guardar.
 * La diferencia entre ambas es el indicador "tiempo promedio de registro
 * de un pedido" (TPRP) de la tesis.
 */
export const crearPedidoSchema = z.object({
  clienteId: z.coerce.number().int().positive('Debe seleccionar un cliente'),
  recibidoEn: z.coerce.date({ invalid_type_error: 'Indique la fecha y hora de recepción' }),
  canal: z.enum(['TELEFONO', 'WHATSAPP', 'MOSTRADOR', 'OTRO']).default('WHATSAPP'),
  modalidadEntrega: z.enum(['DOMICILIO', 'RECOJO']).default('DOMICILIO'),
  direccionEntrega: z.string().trim().min(1, 'La dirección de entrega es obligatoria').max(200),
  referenciaEntrega: textoOpcional(200),
  fechaEntregaProgramada: z.coerce.date().optional().nullable(),
  detalles: z
    .array(detalleSchema)
    .min(1, 'Debe incluir al menos un producto en el pedido')
    .max(30, 'Un pedido no puede superar los 30 ítems'),
  descuento: dineroSchema.default(0),
  observaciones: textoOpcional(1000),
  /// Marca de error detectado en el registro; alimenta el indicador
  /// "porcentaje de pedidos con errores de registro".
  incidencias: textoOpcional(500),
  requiereCorreccion: z.boolean().default(false),
  /// Confirmar en el mismo paso reduce el tiempo de proceso.
  confirmar: z.boolean().default(false),
});

export type CrearPedidoInput = z.infer<typeof crearPedidoSchema>;

export const actualizarPedidoSchema = z
  .object({
    modalidadEntrega: z.enum(['DOMICILIO', 'RECOJO']).optional(),
    direccionEntrega: z.string().trim().min(1).max(200).optional(),
    referenciaEntrega: textoOpcional(200),
    fechaEntregaProgramada: z.coerce.date().optional().nullable(),
    detalles: z.array(detalleSchema).min(1).max(30).optional(),
    descuento: dineroSchema.optional(),
    observaciones: textoOpcional(1000),
    incidencias: textoOpcional(500),
    requiereCorreccion: z.boolean().optional(),
  })
  .refine((d) => d !== undefined, { message: 'No hay datos para actualizar' });

export const cambiarEstadoPedidoSchema = z.object({
  estado: z.enum(['PENDIENTE', 'CONFIRMADO', 'ASIGNADO', 'EN_RUTA', 'ENTREGADO', 'CANCELADO']),
  observaciones: textoOpcional(500),
  motivo: textoOpcional(255),
});

export const asignarRepartidorSchema = z.object({
  repartidorId: z.coerce.number().int().positive('Debe seleccionar un repartidor'),
  observaciones: textoOpcional(500),
});

export const listarPedidosSchema = paginacionSchema.extend({
  busqueda: textoOpcional(100),
  clienteId: z.coerce.number().int().positive().optional(),
  estado: z
    .enum(['PENDIENTE', 'CONFIRMADO', 'ASIGNADO', 'EN_RUTA', 'ENTREGADO', 'CANCELADO', 'todos'])
    .default('todos'),
  canal: z.enum(['TELEFONO', 'WHATSAPP', 'MOSTRADOR', 'OTRO', 'todos']).default('todos'),
  repartidorId: z.coerce.number().int().positive().optional(),
  usuarioId: z.coerce.number().int().positive().optional(),
  fechaInicio: z.coerce.date().optional(),
  fechaFin: z.coerce.date().optional(),
  requiereCorreccion: z.enum(['true', 'false', 'todos']).default('todos'),
});

export type ListarPedidosQuery = z.infer<typeof listarPedidosSchema>;
export type ActualizarPedidoInput = z.infer<typeof actualizarPedidoSchema>;
