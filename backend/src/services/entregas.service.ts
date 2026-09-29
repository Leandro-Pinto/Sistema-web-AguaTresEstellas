import { Prisma, AccionHistorial, TipoRegistroHistorial, EstadoEntrega, EstadoPedido } from '@prisma/client';
import { prisma } from '../config/prisma';
import { ErrorNoEncontrado, ErrorReglaNegocio } from '../utils/errors';
import { construirPaginacion } from '../utils/paginacion';
import { registrarHistorial } from './historial.service';
import { registrarMovimientoBidon } from './bidones.service';
import type {
  ActualizarEntregaInput,
  ListarEntregasQuery,
  RegistrarEntregaInput,
} from '../validators/operaciones.validator';

const SELECT_ENTREGA = {
  id: true,
  pedidoId: true,
  repartidorId: true,
  fechaAsignacion: true,
  horaSalida: true,
  horaEntrega: true,
  minutosDemora: true,
  estado: true,
  bidonesEntregados: true,
  bidonesDevueltos: true,
  montoRecibido: true,
  observaciones: true,
  motivoNoEntrega: true,
  recibeFirma: true,
  repartidor: { select: { id: true, nombre: true, documento: true, telefono: true, zona: true } },
  pedido: {
    select: {
      id: true,
      codigo: true,
      estado: true,
      total: true,
      modalidadEntrega: true,
      direccionEntrega: true,
      referenciaEntrega: true,
      cliente: { select: { id: true, nombre: true, telefono: true, direccion: true } },
      detalles: {
        select: {
          productoId: true,
          cantidad: true,
          producto: { select: { id: true, nombre: true, esRetornable: true, unidadMedida: true } },
        },
      },
    },
  },
} satisfies Prisma.EntregaSelect;

const TRANSICIONES_ENTREGA: Record<EstadoEntrega, EstadoEntrega[]> = {
  PENDIENTE: ['ASIGNADA', 'CANCELADA'],
  ASIGNADA: ['EN_RUTA', 'CANCELADA'],
  EN_RUTA: ['ENTREGADA', 'NO_ENTREGADO', 'CANCELADA'],
  ENTREGADA: [],
  NO_ENTREGADO: ['EN_RUTA', 'CANCELADA'],
  CANCELADA: ['PENDIENTE'],
};

/**
 * ASIGNACIÓN DE REPARTIDOR.
 *
 * Los pasos se registran por separado (asignado, salida, entrega) porque
 * la diferencia entre esas marcas de tiempo es lo que permite medir
 * "tiempo promedio de confirmación y asignación del pedido" y analizar
 * el desempeño de la distribución.
 */
export const registrarEntrega = async (entrada: RegistrarEntregaInput, usuarioId: number) => {
  const pedido = await prisma.pedido.findUnique({
    where: { id: entrada.pedidoId },
    select: { id: true, codigo: true, estado: true, clienteId: true, entrega: { select: { id: true } } },
  });
  if (!pedido) throw new ErrorNoEncontrado('Pedido');
  if (pedido.entrega) {
    throw new ErrorReglaNegocio('El pedido ya tiene una entrega asignada', 'ENTREGA_DUPLICADA');
  }
  if (pedido.estado === 'CANCELADO') {
    throw new ErrorReglaNegocio('No se puede asignar reparto a un pedido cancelado', 'PEDIDO_CANCELADO');
  }
  if (pedido.estado === 'PENDIENTE') {
    throw new ErrorReglaNegocio('Confirme el pedido antes de asignar el repartidor', 'PEDIDO_NO_CONFIRMADO');
  }

  const repartidor = await prisma.repartidor.findUnique({
    where: { id: entrada.repartidorId },
    select: { id: true, nombre: true, activo: true, eliminadoEn: true },
  });
  if (!repartidor) throw new ErrorNoEncontrado('Repartidor');
  if (!repartidor.activo || repartidor.eliminadoEn) {
    throw new ErrorReglaNegocio('El repartidor seleccionado no está activo', 'REPARTIDOR_INACTIVO');
  }

  const ahora = new Date();

  return prisma.$transaction(async (tx) => {
    const entrega = await tx.entrega.create({
      data: {
        pedidoId: pedido.id,
        repartidorId: repartidor.id,
        estado: 'ASIGNADA',
        fechaAsignacion: ahora,
        asignadoPorId: usuarioId,
        observaciones: entrada.observaciones ?? null,
      },
      select: SELECT_ENTREGA,
    });

    if (pedido.estado === 'CONFIRMADO') {
      await tx.pedido.update({
        where: { id: pedido.id },
        data: { estado: 'ASIGNADO', asignadoEn: ahora },
      });
      await registrarHistorial(
        {
          tipo: TipoRegistroHistorial.PEDIDO,
          entidadId: pedido.id,
          codigo: pedido.codigo,
          estadoAnterior: 'CONFIRMADO',
          estadoNuevo: 'ASIGNADO',
          accion: AccionHistorial.ASIGNACION,
          descripcion: `Pedido ${pedido.codigo} asignado a ${repartidor.nombre}`,
          observaciones: entrada.observaciones ?? null,
          usuarioId,
          pedidoId: pedido.id,
          fecha: ahora,
        },
        tx,
      );
    }

    await registrarHistorial(
      {
        tipo: TipoRegistroHistorial.ENTREGA,
        entidadId: entrega.id,
        codigo: pedido.codigo,
        estadoNuevo: 'ASIGNADA',
        accion: AccionHistorial.ASIGNACION,
        descripcion: `Repartidor ${repartidor.nombre} asignado al pedido ${pedido.codigo}`,
        observaciones: entrada.observaciones ?? null,
        usuarioId,
        pedidoId: pedido.id,
        fecha: ahora,
      },
      tx,
    );

    return entrega;
  });
};

export const listarEntregas = async (filtros: ListarEntregasQuery) => {
  const where: Prisma.EntregaWhereInput = {
    ...(filtros.repartidorId ? { repartidorId: filtros.repartidorId } : {}),
    ...(filtros.pedidoId ? { pedidoId: filtros.pedidoId } : {}),
    ...(filtros.estado !== 'todos' ? { estado: filtros.estado as EstadoEntrega } : {}),
    ...(filtros.fechaInicio || filtros.fechaFin
      ? {
          fechaAsignacion: {
            ...(filtros.fechaInicio ? { gte: filtros.fechaInicio } : {}),
            ...(filtros.fechaFin ? { lte: filtros.fechaFin } : {}),
          },
        }
      : {}),
    ...(filtros.busqueda
      ? {
          OR: [
            { pedido: { codigo: { contains: filtros.busqueda.toUpperCase() } } },
            { repartidor: { nombre: { contains: filtros.busqueda } } },
            { pedido: { cliente: { nombre: { contains: filtros.busqueda } } } },
          ],
        }
      : {}),
  };

  const [total, datos] = await prisma.$transaction([
    prisma.entrega.count({ where }),
    prisma.entrega.findMany({
      where,
      orderBy: { [filtros.ordenarPor ?? 'fechaAsignacion']: filtros.orden },
      skip: (filtros.pagina - 1) * filtros.limite,
      take: filtros.limite,
      select: SELECT_ENTREGA,
    }),
  ]);

  return construirPaginacion(datos, total, filtros.pagina, filtros.limite);
};

export const obtenerEntrega = async (id: number) => {
  const entrega = await prisma.entrega.findUnique({
    where: { id },
    select: {
      ...SELECT_ENTREGA,
      movimientosBidon: {
        orderBy: { id: 'desc' },
        include: {
          producto: { select: { nombre: true } },
          cliente: { select: { nombre: true } },
        },
      },
      pedido: {
        select: {
          historial: {
            orderBy: { fecha: 'asc' },
            select: {
              id: true,
              fecha: true,
              accion: true,
              descripcion: true,
              estadoAnterior: true,
              estadoNuevo: true,
              usuario: { select: { nombreCompleto: true } },
            },
          },
        },
      },
    },
  });
  if (!entrega) throw new ErrorNoEncontrado('Entrega');
  return entrega;
};

/**
 * ACTUALIZACIÓN DE LA ENTREGA.
 *
 * Concentra el trabajo físico de la ruta:
 *  - hora de salida  → el repartidor salió;
 *  - hora de entrega → el repartidor llegó y entregó;
 *  - devoluciones    → se registran los bidones que el cliente devuelve,
 *                      generándose los movimientos correspondientes.
 *
 * Regla: no se permite marcar ENTREGADA sin hora de entrega; el personal
 * puede indicar la hora real si la registra después de Returning.
 */
export const actualizarEntrega = async (
  id: number,
  entrada: ActualizarEntregaInput,
  usuarioId: number,
) => {
  const actual = await prisma.entrega.findUnique({
    where: { id },
    select: {
      id: true,
      estado: true,
      pedidoId: true,
      pedido: { select: { codigo: true, clienteId: true, estado: true, total: true } },
    },
  });
  if (!actual) throw new ErrorNoEncontrado('Entrega');

  if (entrada.estado) {
    if (entrada.estado === actual.estado) {
      throw new ErrorReglaNegocio(`La entrega ya se encuentra en estado ${entrada.estado}`, 'ESTADO_SIN_CAMBIO');
    }
    const permitidos = TRANSICIONES_ENTREGA[actual.estado];
    if (!permitidos.includes(entrada.estado)) {
      throw new ErrorReglaNegocio(
        `No se puede pasar de ${actual.estado} a ${entrada.estado}. Transiciones válidas: ${permitidos.join(', ')}`,
        'TRANSICION_INVALIDA',
      );
    }
  }

  const estadoDestino = entrada.estado ?? actual.estado;

  if (estadoDestino === 'ENTREGADA' && entrada.motivoNoEntrega) {
    throw new ErrorReglaNegocio('Una entrega realizada no puede tener motivo de no entrega', 'DATO_CONTRADICTORIO');
  }

  if (estadoDestino === 'NO_ENTREGADO' && !entrada.motivoNoEntrega) {
    throw new ErrorReglaNegocio('Indique el motivo por el que no se pudo entregar', 'MOTIVO_REQUERIDO');
  }

  // Los bidones que el cliente recibe se registran como movimiento ENTREGA
  // automáticamente al marcar la entrega como realizada, tomando la cantidad
  // del propio detalle del pedido. Las devoluciones de la ruta se registran
  // aparte. El saldo del cliente resulta de la diferencia entre ambos.
  const productoRetornable = entrada.estado === 'ENTREGADA'
    ? await prisma.pedido.findUnique({
        where: { id: actual.pedidoId },
        select: {
          detalles: {
            where: { producto: { esRetornable: true } },
            select: { productoId: true, cantidad: true, producto: { select: { nombre: true } } },
          },
        },
      })
    : null;

  const ahora = new Date();
  const horaEntrega = entrada.horaEntrega ?? (estadoDestino === 'ENTREGADA' ? ahora : undefined);
  const horaSalida = entrada.horaSalida ?? (estadoDestino === 'EN_RUTA' && !entrada.horaEntrega ? ahora : undefined);

  return prisma.$transaction(async (tx) => {
    const entrega = await tx.entrega.update({
      where: { id },
      data: {
        ...(entrada.estado !== undefined ? { estado: entrada.estado } : {}),
        ...(horaSalida !== undefined ? { horaSalida } : {}),
        ...(horaEntrega !== undefined ? { horaEntrega } : {}),
        ...(entrada.minutosDemora !== undefined ? { minutosDemora: entrada.minutosDemora } : {}),
        ...(entrada.bidonesEntregados !== undefined
          ? { bidonesEntregados: entrada.bidonesEntregados }
          : productoRetornable && productoRetornable.detalles.length > 0
            ? {
                bidonesEntregados: productoRetornable.detalles.reduce((a, d) => a + d.cantidad, 0),
              }
            : {}),
        ...(entrada.bidonesDevueltos !== undefined
          ? { bidonesDevueltos: entrada.bidonesDevueltos }
          : entrada.devoluciones && entrada.devoluciones.length > 0
            ? {
                bidonesDevueltos: entrada.devoluciones.reduce((a, d) => a + d.cantidad, 0),
              }
            : {}),
        ...(entrada.montoRecibido !== undefined ? { montoRecibido: entrada.montoRecibido } : {}),
        ...(entrada.motivoNoEntrega !== undefined ? { motivoNoEntrega: entrada.motivoNoEntrega } : {}),
        ...(entrada.observaciones !== undefined ? { observaciones: entrada.observaciones } : {}),
        ...(entrada.recibeFirma !== undefined ? { recibeFirma: entrada.recibeFirma } : {}),
      },
      select: SELECT_ENTREGA,
    });

    // El estado del pedido sigue a la entrega: son el mismo proceso.
    const nuevoEstadoPedido = mapearEstadoPedido(estadoDestino);
    if (nuevoEstadoPedido && nuevoEstadoPedido !== actual.pedido.estado) {
      await tx.pedido.update({
        where: { id: actual.pedidoId },
        data: {
          estado: nuevoEstadoPedido,
          ...(nuevoEstadoPedido === 'EN_RUTA' ? { enRutaEn: horaSalida ?? ahora } : {}),
          ...(nuevoEstadoPedido === 'ENTREGADO' ? { entregadoEn: horaEntrega ?? ahora } : {}),
        },
      });

      await registrarHistorial(
        {
          tipo: TipoRegistroHistorial.PEDIDO,
          entidadId: actual.pedidoId,
          codigo: actual.pedido.codigo,
          estadoAnterior: actual.pedido.estado,
          estadoNuevo: nuevoEstadoPedido,
          accion:
            nuevoEstadoPedido === 'ENTREGADO'
              ? AccionHistorial.ENTREGA
              : nuevoEstadoPedido === 'EN_RUTA'
                ? AccionHistorial.SALIDA_RUTA
                : AccionHistorial.CAMBIO_ESTADO,
          descripcion: `Pedido ${actual.pedido.codigo}: ${actual.pedido.estado} → ${nuevoEstadoPedido}`,
          observaciones: entrada.observaciones ?? entrada.motivoNoEntrega ?? null,
          usuarioId,
          pedidoId: actual.pedidoId,
          fecha: ahora,
        },
        tx,
      );
    }

    // Bidones entregados al cliente en esta entrega.
    if (productoRetornable && productoRetornable.detalles.length > 0) {
      for (const detalle of productoRetornable.detalles) {
        await registrarMovimientoBidon(
          {
            tipo: 'ENTREGA',
            clienteId: actual.pedido.clienteId,
            productoId: detalle.productoId,
            cantidad: detalle.cantidad,
            pedidoId: actual.pedidoId,
            entregaId: id,
            repartidorId: entrega.repartidorId,
            observaciones: `Bidones entregados con el pedido ${actual.pedido.codigo}`,
          },
          usuarioId,
          tx,
        );
      }
    }

    // Devoluciones de bidones registradas en la ruta.
    if (entrada.devoluciones && entrada.devoluciones.length > 0) {
      for (const devolucion of entrada.devoluciones) {
        if (devolucion.cantidad === 0) continue;
        await registrarMovimientoBidon(
          {
            tipo: 'DEVOLUCION',
            clienteId: devolucion.clienteId,
            productoId: devolucion.productoId,
            cantidad: devolucion.cantidad,
            pedidoId: actual.pedidoId,
            entregaId: id,
            repartidorId: entrega.repartidorId,
            observaciones: devolucion.observaciones ?? 'Devolución registrada en ruta',
          },
          usuarioId,
          tx,
        );
      }
    }

    if (entrada.estado) {
      await registrarHistorial(
        {
          tipo: TipoRegistroHistorial.ENTREGA,
          entidadId: id,
          codigo: actual.pedido.codigo,
          estadoAnterior: actual.estado,
          estadoNuevo: entrada.estado,
          accion: entrada.estado === 'ENTREGADA' ? AccionHistorial.ENTREGA : AccionHistorial.CAMBIO_ESTADO,
          descripcion: `Entrega del pedido ${actual.pedido.codigo}: ${actual.estado} → ${entrada.estado}`,
          observaciones: entrada.observaciones ?? null,
          incidencia: entrada.motivoNoEntrega ?? null,
          usuarioId,
          pedidoId: actual.pedidoId,
          fecha: ahora,
        },
        tx,
      );
    }

    return entrega;
  });
};

const mapearEstadoPedido = (estado: EstadoEntrega): EstadoPedido | null => {
  switch (estado) {
    case 'EN_RUTA':
      return 'EN_RUTA';
    case 'ENTREGADA':
      return 'ENTREGADO';
    case 'CANCELADA':
      return 'CANCELADO';
    default:
      return null;
  }
};

/**
 * Pedidos asignados a un repartidor.
 * Es lo que el repartidor ve en su sesión: solo sus entregas.
 */
export const listarEntregasDeRepartidor = async (
  repartidorId: number,
  filtros: { estado?: string; pagina: number; limite: number },
) => {
  const where: Prisma.EntregaWhereInput = {
    repartidorId,
    ...(filtros.estado && filtros.estado !== 'todos' ? { estado: filtros.estado as EstadoEntrega } : {}),
  };
  const [total, datos] = await prisma.$transaction([
    prisma.entrega.count({ where }),
    prisma.entrega.findMany({
      where,
      orderBy: { fechaAsignacion: 'desc' },
      skip: (filtros.pagina - 1) * filtros.limite,
      take: filtros.limite,
      select: SELECT_ENTREGA,
    }),
  ]);
  return construirPaginacion(datos, total, filtros.pagina, filtros.limite);
};

/**
 * Repartidor asociado a un usuario del sistema.
 *
 * Un usuario con rol REPARTIDOR no es un repartidor por sí mismo: es la
 * persona que usa la aplicación y realiza la entrega física. Para que el
 * repartidor vea "sus" entregas, se vincula por documento, que es el único
 * dato compartido entre el usuario y el repartidor.
 */
export const obtenerRepartidorDeUsuario = async (usuarioId: number) => {
  const usuario = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    select: { documento: true },
  });
  // Sin documento no hay forma de vincular: el administrador debe registrarlo.
  if (!usuario?.documento) return null;
  const repartidor = await prisma.repartidor.findFirst({
    where: { documento: usuario.documento, eliminadoEn: null },
    select: { id: true, nombre: true, telefono: true, zona: true, activo: true },
  });
  return repartidor;
};

/** Resumen de carga de trabajo por repartidor: útil para asignar. */
export const cargaPorRepartidor = async () => {
  const repartidores = await prisma.repartidor.findMany({
    where: { activo: true, eliminadoEn: null },
    orderBy: { nombre: 'asc' },
    select: { id: true, nombre: true, zona: true, telefono: true },
  });
  const conteo = await prisma.entrega.groupBy({
    by: ['repartidorId', 'estado'],
    _count: { _all: true },
  });

  return repartidores.map((r) => {
    const suyos = conteo.filter((c) => c.repartidorId === r.id);
    const porEstado = Object.fromEntries(
      suyos.map((c) => [c.estado, c._count._all]),
    ) as Partial<Record<EstadoEntrega, number>>;
    return {
      ...r,
      entregasAsignadas: (porEstado.ASIGNADA ?? 0) + (porEstado.EN_RUTA ?? 0),
      entregasCompletadas: porEstado.ENTREGADA ?? 0,
      entregasNoEntregadas: porEstado.NO_ENTREGADO ?? 0,
      detalle: porEstado,
    };
  });
};
