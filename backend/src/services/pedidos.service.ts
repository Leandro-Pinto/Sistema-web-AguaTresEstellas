import {
  Prisma,
  AccionHistorial,
  TipoRegistroHistorial,
  EstadoPedido,
  CanalPedido,
} from '@prisma/client';
import { prisma } from '../config/prisma';
import { ErrorConflicto, ErrorNoEncontrado, ErrorReglaNegocio } from '../utils/errors';
import { construirPaginacion } from '../utils/paginacion';
import { generarCorrelativo } from '../utils/correlativos';
import { registrarHistorial } from './historial.service';
import { origenDe, type OpcionesOrigen } from './origen-dato';
import type {
  ActualizarPedidoInput,
  CrearPedidoInput,
  ListarPedidosQuery,
} from '../validators/pedidos.validator';

const SELECT_DETALLE = {
  id: true,
  productoId: true,
  cantidad: true,
  precioUnitario: true,
  subtotal: true,
  observaciones: true,
  producto: {
    select: { id: true, codigo: true, nombre: true, unidadMedida: true, esRetornable: true, stock: true },
  },
} satisfies Prisma.DetallePedidoSelect;

const SELECT_PEDIDO = {
  id: true,
  codigo: true,
  clienteId: true,
  recibidoEn: true,
  registradoEn: true,
  confirmadoEn: true,
  asignadoEn: true,
  enRutaEn: true,
  entregadoEn: true,
  canceladoEn: true,
  canal: true,
  modalidadEntrega: true,
  direccionEntrega: true,
  referenciaEntrega: true,
  fechaEntregaProgramada: true,
  estado: true,
  subtotal: true,
  descuento: true,
  total: true,
  observaciones: true,
  incidencias: true,
  requiereCorreccion: true,
  cliente: {
    select: { id: true, nombre: true, documento: true, telefono: true, direccion: true, referencia: true },
  },
  usuario: { select: { id: true, nombreCompleto: true } },
  detalles: { select: SELECT_DETALLE, orderBy: { id: 'asc' } },
  venta: { select: { id: true, numero: true, total: true, totalPagado: true, saldo: true, estado: true } },
  entrega: {
    select: {
      id: true,
      repartidorId: true,
      estado: true,
      fechaAsignacion: true,
      horaSalida: true,
      horaEntrega: true,
      repartidor: { select: { id: true, nombre: true, telefono: true } },
    },
  },
} satisfies Prisma.PedidoSelect;

/**
 * Transiciones de estado permitidas.
 * Declararlas como mapa evita que el frontend invente estados y garantiza
 * que el recorrido del proceso sea siempre el mismo.
 */
const TRANSICIONES: Record<EstadoPedido, EstadoPedido[]> = {
  PENDIENTE: ['CONFIRMADO', 'CANCELADO'],
  CONFIRMADO: ['ASIGNADO', 'CANCELADO'],
  ASIGNADO: ['EN_RUTA', 'CANCELADO'],
  EN_RUTA: ['ENTREGADO', 'CANCELADO'],
  ENTREGADO: [],
  CANCELADO: ['PENDIENTE'],
};

const columnaMarcaTiempo: Partial<Record<EstadoPedido, 'confirmadoEn' | 'asignadoEn' | 'enRutaEn' | 'entregadoEn' | 'canceladoEn'>> = {
  CONFIRMADO: 'confirmadoEn',
  ASIGNADO: 'asignadoEn',
  EN_RUTA: 'enRutaEn',
  ENTREGADO: 'entregadoEn',
  CANCELADO: 'canceladoEn',
};

const calcularTotales = (detalles: { precioUnitario: number; cantidad: number }[], descuento: number) => {
  const subtotal = detalles.reduce((a, d) => a + d.precioUnitario * d.cantidad, 0);
  const total = Math.max(0, subtotal - descuento);
  return { subtotal: Number(subtotal.toFixed(2)), total: Number(total.toFixed(2)) };
};

/**
 * REGISTRO DE PEDIDO.
 *
 * Aquí se produce la evidencia principal del postest:
 *  - `recibidoEn`   : momento en que el cliente comunicó el pedido.
 *  - `registradoEn` : momento en que el pedido quedó registrado.
 *  La diferencia es el "tiempo promedio de registro de un pedido" (TPRP).
 *
 * Todo ocurre en una sola transacción: o se guarda el pedido completo con su
 * historial, o no se guarda nada. Nunca quedan pedidos a medias.
 */
export const crearPedido = async (
  entrada: CrearPedidoInput,
  usuarioId: number,
  opciones?: OpcionesOrigen,
) => {
  const origen = origenDe(opciones);
  const cliente = await prisma.cliente.findUnique({
    where: { id: entrada.clienteId },
    select: { id: true, nombre: true, activo: true, eliminadoEn: true, direccion: true },
  });
  if (!cliente) throw new ErrorNoEncontrado('Cliente');
  if (!cliente.activo || cliente.eliminadoEn) {
    throw new ErrorReglaNegocio('No se pueden registrar pedidos para un cliente inactivo', 'CLIENTE_INACTIVO');
  }

  // Se congelan los precios del catálogo en el momento del registro.
  const productos = await prisma.producto.findMany({
    where: { id: { in: entrada.detalles.map((d) => d.productoId) }, activo: true, eliminadoEn: null },
    select: { id: true, nombre: true, precioVenta: true, stock: true, esRetornable: true },
  });
  if (productos.length !== new Set(entrada.detalles.map((d) => d.productoId)).size) {
    throw new ErrorReglaNegocio('Uno o más productos del pedido no están disponibles', 'PRODUCTO_NO_DISPONIBLE');
  }

  const mapaProductos = new Map(productos.map((p) => [p.id, p]));
  const detalles = entrada.detalles.map((d) => {
    const producto = mapaProductos.get(d.productoId)!;
    return {
      productoId: d.productoId,
      cantidad: d.cantidad,
      precioUnitario: Number(producto.precioVenta),
      subtotal: Number((Number(producto.precioVenta) * d.cantidad).toFixed(2)),
      observaciones: d.observaciones ?? null,
    };
  });

  if (entrada.descuento > calcularTotales(detalles, 0).subtotal) {
    throw new ErrorReglaNegocio('El descuento no puede ser mayor al subtotal del pedido', 'DESCUENTO_INVALIDO');
  }

  const { subtotal, total } = calcularTotales(detalles, entrada.descuento);
  const ahora = new Date();

  if (entrada.recibidoEn > ahora) {
    throw new ErrorReglaNegocio('La fecha de recepción no puede ser futura', 'FECHA_INVALIDA');
  }

  return prisma.$transaction(async (tx) => {
    const codigo = await generarCorrelativo('pedido', 'PED', tx);

    const estadoInicial: EstadoPedido = entrada.confirmar ? 'CONFIRMADO' : 'PENDIENTE';

    const pedido = await tx.pedido.create({
      data: {
        codigo,
        clienteId: entrada.clienteId,
        recibidoEn: entrada.recibidoEn,
        registradoEn: ahora,
        confirmadoEn: entrada.confirmar ? ahora : null,
        canal: entrada.canal as CanalPedido,
        modalidadEntrega: entrada.modalidadEntrega,
        direccionEntrega: entrada.direccionEntrega,
        referenciaEntrega: entrada.referenciaEntrega ?? null,
        fechaEntregaProgramada: entrada.fechaEntregaProgramada ?? null,
        estado: estadoInicial,
        subtotal,
        descuento: entrada.descuento,
        total,
        observaciones: entrada.observaciones ?? null,
        incidencias: entrada.incidencias ?? null,
        requiereCorreccion: entrada.requiereCorreccion,
        origen,
        usuarioId,
        detalles: { create: detalles },
      },
      select: SELECT_PEDIDO,
    });

    await registrarHistorial(
      {
        tipo: TipoRegistroHistorial.PEDIDO,
        entidadId: pedido.id,
        codigo: pedido.codigo,
        estadoNuevo: 'PENDIENTE',
        accion: AccionHistorial.CREADO,
        descripcion: `Pedido ${pedido.codigo} registrado para ${cliente.nombre} (${pedido.canal}) por S/ ${pedido.total}`,
        observaciones: entrada.observaciones ?? null,
        incidencia: entrada.incidencias ?? null,
        usuarioId,
        pedidoId: pedido.id,
        fecha: ahora,
        origen,
      },
      tx,
    );

    if (entrada.confirmar) {
      await registrarHistorial(
        {
          tipo: TipoRegistroHistorial.PEDIDO,
          entidadId: pedido.id,
          codigo: pedido.codigo,
          estadoAnterior: 'PENDIENTE',
          estadoNuevo: 'CONFIRMADO',
          accion: AccionHistorial.CAMBIO_ESTADO,
          descripcion: `Pedido ${pedido.codigo} confirmado al momento del registro`,
          usuarioId,
          pedidoId: pedido.id,
          fecha: ahora,
          origen,
        },
        tx,
      );
    }

    return pedido;
  });
};

export const listarPedidos = async (filtros: ListarPedidosQuery) => {
  const where: Prisma.PedidoWhereInput = {
    ...(filtros.estado !== 'todos' ? { estado: filtros.estado as EstadoPedido } : {}),
    ...(filtros.canal !== 'todos' ? { canal: filtros.canal as CanalPedido } : {}),
    ...(filtros.clienteId ? { clienteId: filtros.clienteId } : {}),
    ...(filtros.usuarioId ? { usuarioId: filtros.usuarioId } : {}),
    ...(filtros.repartidorId ? { entrega: { repartidorId: filtros.repartidorId } } : {}),
    ...(filtros.requiereCorreccion !== 'todos'
      ? { requiereCorreccion: filtros.requiereCorreccion === 'true' }
      : {}),
    ...(filtros.fechaInicio || filtros.fechaFin
      ? {
          registradoEn: {
            ...(filtros.fechaInicio ? { gte: filtros.fechaInicio } : {}),
            ...(filtros.fechaFin ? { lte: filtros.fechaFin } : {}),
          },
        }
      : {}),
    ...(filtros.busqueda
      ? {
          OR: [
            { codigo: { contains: filtros.busqueda.toUpperCase() } },
            { cliente: { nombre: { contains: filtros.busqueda } } },
            { cliente: { documento: { contains: filtros.busqueda } } },
            { direccionEntrega: { contains: filtros.busqueda } },
          ],
        }
      : {}),
  };

  const campo = filtros.ordenarPor ?? 'registradoEn';
  const orderBy = {
    total: { total: filtros.orden },
    codigo: { codigo: filtros.orden },
    cliente: { cliente: { nombre: filtros.orden } },
  }[campo] ?? { [campo]: filtros.orden };

  const [total, datos] = await prisma.$transaction([
    prisma.pedido.count({ where }),
    prisma.pedido.findMany({
      where,
      orderBy,
      skip: (filtros.pagina - 1) * filtros.limite,
      take: filtros.limite,
      select: SELECT_PEDIDO,
    }),
  ]);

  return construirPaginacion(datos, total, filtros.pagina, filtros.limite);
};

export const obtenerPedido = async (id: number) => {
  const pedido = await prisma.pedido.findUnique({
    where: { id },
    select: {
      ...SELECT_PEDIDO,
      historial: {
        orderBy: { fecha: 'asc' },
        include: { usuario: { select: { nombreCompleto: true, rol: { select: { nombre: true } } } } },
      },
      movimientosBidon: {
        orderBy: { id: 'asc' },
        include: { producto: { select: { nombre: true } } },
      },
      // El pago cuelga de la venta, no del pedido: el circuito es
      // pedido -> venta -> pagos, y un pedido puede no tener venta aún.
      venta: {
        select: {
          id: true,
          numero: true,
          total: true,
          totalPagado: true,
          saldo: true,
          estado: true,
          pagos: {
            orderBy: { id: 'asc' },
            select: {
              id: true,
              monto: true,
              metodo: true,
              referencia: true,
              fecha: true,
              estado: true,
            },
          },
        },
      },
    },
  });
  if (!pedido) throw new ErrorNoEncontrado('Pedido');
  return pedido;
};

export const actualizarPedido = async (
  id: number,
  entrada: ActualizarPedidoInput,
  usuarioId: number,
) => {
  const actual = await prisma.pedido.findUnique({ where: { id }, select: SELECT_PEDIDO });
  if (!actual) throw new ErrorNoEncontrado('Pedido');

  if (['ASIGNADO', 'EN_RUTA', 'ENTREGADO'].includes(actual.estado)) {
    throw new ErrorReglaNegocio(
      `El pedido ya está en estado ${actual.estado} y no puede modificarse.`,
      'PEDIDO_NO_EDITABLE',
    );
  }
  if (actual.venta && ['PEDIDO', 'CONFIRMADO'].includes(actual.estado)) {
    throw new ErrorReglaNegocio(
      'El pedido ya tiene una venta asociada y no puede modificarse.',
      'PEDIDO_CON_VENTA',
    );
  }

  // Los importes viajan como Decimal en Prisma y como number en el resto del
  // cálculo; se normaliza una sola vez para no arrastrar la conversión.
  const aNumero = (valor: Prisma.Decimal | number): number => Number(valor);

  const detallesActuales = actual.detalles.map((d) => ({
    productoId: d.productoId,
    cantidad: d.cantidad,
    precioUnitario: aNumero(d.precioUnitario),
    subtotal: aNumero(d.subtotal),
    observaciones: d.observaciones,
  }));

  let detalles = detallesActuales;
  if (entrada.detalles) {
    const productos = await prisma.producto.findMany({
      where: { id: { in: entrada.detalles.map((d) => d.productoId) }, activo: true, eliminadoEn: null },
      select: { id: true, precioVenta: true },
    });
    if (productos.length !== new Set(entrada.detalles.map((d) => d.productoId)).size) {
      throw new ErrorReglaNegocio('Uno o más productos no están disponibles', 'PRODUCTO_NO_DISPONIBLE');
    }
    const mapa = new Map(productos.map((p) => [p.id, aNumero(p.precioVenta)]));
    detalles = entrada.detalles.map((d) => {
      const precioUnitario = mapa.get(d.productoId)!;
      return {
        productoId: d.productoId,
        cantidad: d.cantidad,
        precioUnitario,
        subtotal: Number((precioUnitario * d.cantidad).toFixed(2)),
        observaciones: d.observaciones ?? null,
      };
    });
  }

  const descuento = entrada.descuento ?? aNumero(actual.descuento);
  const { subtotal, total } = calcularTotales(detalles, descuento);

  return prisma.$transaction(async (tx) => {
    if (entrada.detalles) {
      await tx.detallePedido.deleteMany({ where: { pedidoId: id } });
      await tx.detallePedido.createMany({
        data: detalles.map((d) => ({
          pedidoId: id,
          productoId: d.productoId,
          cantidad: d.cantidad,
          precioUnitario: d.precioUnitario,
          subtotal: d.subtotal,
          observaciones: d.observaciones,
        })),
      });
    }

    const pedido = await tx.pedido.update({
      where: { id },
      data: {
        ...(entrada.modalidadEntrega !== undefined ? { modalidadEntrega: entrada.modalidadEntrega } : {}),
        ...(entrada.direccionEntrega !== undefined ? { direccionEntrega: entrada.direccionEntrega } : {}),
        ...(entrada.referenciaEntrega !== undefined ? { referenciaEntrega: entrada.referenciaEntrega } : {}),
        ...(entrada.fechaEntregaProgramada !== undefined
          ? { fechaEntregaProgramada: entrada.fechaEntregaProgramada }
          : {}),
        ...(entrada.observaciones !== undefined ? { observaciones: entrada.observaciones } : {}),
        ...(entrada.incidencias !== undefined ? { incidencias: entrada.incidencias } : {}),
        ...(entrada.requiereCorreccion !== undefined ? { requiereCorreccion: entrada.requiereCorreccion } : {}),
        subtotal,
        descuento,
        total,
      },
      select: SELECT_PEDIDO,
    });

    await registrarHistorial(
      {
        tipo: TipoRegistroHistorial.PEDIDO,
        entidadId: id,
        codigo: pedido.codigo,
        accion: AccionHistorial.ACTUALIZADO,
        descripcion: `Pedido ${pedido.codigo} actualizado. Nuevo total: S/ ${pedido.total}`,
        observaciones: entrada.observaciones ?? null,
        incidencia: entrada.incidencias ?? null,
        usuarioId,
        pedidoId: id,
      },
      tx,
    );

    return pedido;
  });
};

/**
 * CAMBIO DE ESTADO DEL PEDIDO.
 *
 * Cada cambio escribe su marca de tiempo y su entrada en el historial.
 * Se respeta la tabla de transiciones: no se puede saltar de PENDIENTE
 * a ENTREGADO, porque eso falsearía la medición de tiempos del proceso.
 */
export const cambiarEstadoPedido = async (
  id: number,
  estado: EstadoPedido,
  usuarioId: number,
  opciones: { observaciones?: string | null; motivo?: string | null } & OpcionesOrigen = {},
) => {
  const origen = origenDe(opciones);
  const actual = await prisma.pedido.findUnique({
    where: { id },
    select: { id: true, codigo: true, estado: true, entregadoEn: true, canceladoEn: true, clienteId: true },
  });
  if (!actual) throw new ErrorNoEncontrado('Pedido');

  if (actual.estado === estado) {
    throw new ErrorReglaNegocio(`El pedido ya se encuentra en estado ${estado}`, 'ESTADO_SIN_CAMBIO');
  }

  const permitidos = TRANSICIONES[actual.estado];
  if (!permitidos.includes(estado)) {
    throw new ErrorReglaNegocio(
      `No se puede pasar de ${actual.estado} a ${estado}. Transiciones válidas: ${permitidos.length ? permitidos.join(', ') : 'ninguna (estado final)'}`,
      'TRANSICION_INVALIDA',
    );
  }

  if (estado === 'CANCELADO' && !opciones.motivo) {
    throw new ErrorReglaNegocio('Debe indicar el motivo de la cancelación', 'MOTIVO_REQUERIDO');
  }

  if (estado === 'ENTREGADO' && !actual.entregadoEn) {
    throw new ErrorReglaNegocio(
      'El pedido debe marcarse como entregado desde el módulo de Entregas, para registrar repartidor y hora de entrega.',
      'USAR_MODULO_ENTREGAS',
    );
  }

  const ahora = new Date();
  const columna = columnaMarcaTiempo[estado];

  return prisma.$transaction(async (tx) => {
    const pedido = await tx.pedido.update({
      where: { id },
      data: {
        estado,
        ...(columna ? { [columna]: ahora } : {}),
      },
      select: SELECT_PEDIDO,
    });

    await registrarHistorial(
      {
        tipo: TipoRegistroHistorial.PEDIDO,
        entidadId: id,
        codigo: pedido.codigo,
        estadoAnterior: actual.estado,
        estadoNuevo: estado,
        accion: estado === 'CANCELADO' ? AccionHistorial.CANCELACION : AccionHistorial.CAMBIO_ESTADO,
        descripcion: `Pedido ${pedido.codigo}: ${actual.estado} → ${estado}`,
        observaciones: opciones.observaciones ?? null,
        incidencia: estado === 'CANCELADO' ? opciones.motivo ?? null : null,
        usuarioId,
        pedidoId: id,
        fecha: ahora,
        origen,
      },
      tx,
    );

    return pedido;
  });
};

/** Valida que un pedido pueda pasar a CONFIRMADO (uso interno de ventas). */
export const assertPuedeConfirmar = (estado: EstadoPedido): void => {
  if (estado === 'PENDIENTE') return;
  if (estado === 'CANCELADO') {
    throw new ErrorReglaNegocio('El pedido está cancelado', 'PEDIDO_CANCELADO');
  }
};

/** Valida que un pedido pueda recibir una venta. */
export const assertPuedeVender = (estado: EstadoPedido, tieneVenta: boolean): void => {
  if (tieneVenta) {
    throw new ErrorConflicto('El pedido ya tiene una venta registrada', 'VENTA_DUPLICADA');
  }
  if (estado === 'PENDIENTE') {
    throw new ErrorReglaNegocio('El pedido debe estar confirmado antes de registrar la venta', 'PEDIDO_NO_CONFIRMADO');
  }
  if (estado === 'CANCELADO') {
    throw new ErrorReglaNegocio('El pedido está cancelado', 'PEDIDO_CANCELADO');
  }
};

export const contarPorEstado = async () =>
  prisma.pedido.groupBy({ by: ['estado'], _count: { _all: true } });
