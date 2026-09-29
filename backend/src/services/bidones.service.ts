import { Prisma, AccionHistorial, TipoRegistroHistorial } from '@prisma/client';
import { config, prisma } from '../config';
import { ErrorNoEncontrado, ErrorReglaNegocio } from '../utils/errors';
import { construirPaginacion } from '../utils/paginacion';
import { registrarHistorial } from './historial.service';
import { aplicarMovimientoInventario } from './inventario.service';
import {
  listarSaldosBidonesSchema,
  type ListarMovimientosBidonQuery,
  type MovimientoBidonInput,
} from '../validators/operaciones.validator';
import type { z } from 'zod';

type ClienteTx = Prisma.TransactionClient | typeof prisma;

/**
 * Aplica el signo de cada tipo de movimiento sobre la cantidad agrupada.
 *   ENTREGA    -> +  (el bidón sale de la empresa hacia el cliente)
 *   DEVOLUCION -> -  (el bidón vuelve a la empresa)
 *   PERDIDA    -> -  (baja definitiva)
 *   AJUSTE     -> la cantidad ya viene con signo
 */
const saldoDesdeAgrupacion = (
  agrupacion: { tipo: string; _sum: { cantidad: number | null } }[],
): number =>
  agrupacion.reduce((acc, fila) => {
    const cantidad = fila._sum.cantidad ?? 0;
    if (fila.tipo === 'ENTREGA') return acc + cantidad;
    if (fila.tipo === 'AJUSTE') return acc + cantidad;
    return acc - cantidad;
  }, 0);

/**
 * SALDO DE BIDONES DE UN CLIENTE.
 *
 * El saldo NUNCA se digita: se calcula sumando los movimientos.
 *   saldo = Σ ENTREGAS - Σ DEVOLUCIONES - Σ PERDIDAS ± AJUSTES
 *
 * Además, cada movimiento guarda `saldoAnterior` y `saldoResultante`,
 * de modo que un saldo concreto puede auditarse sin recalcular la historia.
 */
export const calcularSaldoBidones = async (
  clienteId: number,
  productoId?: number,
  tx: ClienteTx = prisma,
): Promise<number> => {
  const agrupacion = await tx.movimientoBidon.groupBy({
    by: ['tipo'],
    where: { clienteId, ...(productoId ? { productoId } : {}) },
    _sum: { cantidad: true },
  });
  return saldoDesdeAgrupacion(agrupacion);
};

/** Saldos de todos los clientes en una sola consulta, agrupando por cliente y producto. */
const saldosPorCliente = async (
  clienteIds: number[],
): Promise<Map<number, Map<number, number>>> => {
  if (clienteIds.length === 0) return new Map();
  const agrupacion = await prisma.movimientoBidon.groupBy({
    by: ['clienteId', 'productoId', 'tipo'],
    where: { clienteId: { in: clienteIds } },
    _sum: { cantidad: true },
  });

  const mapa = new Map<number, Map<number, number>>();
  for (const fila of agrupacion) {
    const cantidad = fila._sum.cantidad ?? 0;
    const clienteId = fila.clienteId;
    if (clienteId === null) continue;
    if (!mapa.has(clienteId)) mapa.set(clienteId, new Map());
    const porProducto = mapa.get(clienteId)!;
    const actual = porProducto.get(fila.productoId) ?? 0;
    const delta = fila.tipo === 'ENTREGA' || fila.tipo === 'AJUSTE' ? cantidad : -cantidad;
    porProducto.set(fila.productoId, actual + delta);
  }
  return mapa;
};

const nombresProductosRetornables = async (): Promise<Map<number, string>> => {
  const productos = await prisma.producto.findMany({
    where: { esRetornable: true },
    select: { id: true, nombre: true },
  });
  return new Map(productos.map((p) => [p.id, p.nombre]));
};

/**
 * Registra un movimiento de bidones y actualiza el saldo del cliente.
 *
 * Reglas aplicadas:
 *  - El producto debe ser retornable.
 *  - Una devolución no puede superar el saldo del cliente, salvo que el
 *    administrador habilite explícitamente esa política.
 *  - Cada movimiento queda en el historial del cliente y asociado a la
 *    operación (pedido y/o entrega) que lo originó.
 */
export const registrarMovimientoBidon = async (
  entrada: MovimientoBidonInput,
  usuarioId: number,
  tx: ClienteTx = prisma,
) => {
  const producto = await tx.producto.findUnique({
    where: { id: entrada.productoId },
    select: { id: true, nombre: true, esRetornable: true },
  });
  if (!producto) throw new ErrorNoEncontrado('Producto');
  if (!producto.esRetornable) {
    throw new ErrorReglaNegocio(
      `"${producto.nombre}" no es un producto retornable, por lo que no admite control de bidones`,
      'PRODUCTO_NO_RETORNABLE',
    );
  }

  const clienteId = entrada.clienteId ?? null;
  let saldoAnterior = 0;
  let nombreCliente: string | null = null;

  if (clienteId) {
    const cliente = await tx.cliente.findUnique({
      where: { id: clienteId },
      select: { id: true, nombre: true, activo: true },
    });
    if (!cliente) throw new ErrorNoEncontrado('Cliente');
    if (!cliente.activo) {
      throw new ErrorReglaNegocio(
        'No se pueden registrar movimientos de bidones de un cliente inactivo',
        'CLIENTE_INACTIVO',
      );
    }
    nombreCliente = cliente.nombre;
    saldoAnterior = await calcularSaldoBidones(clienteId, entrada.productoId, tx);
  }

  // Solo los tipos derivados de un pedido o una entrega llevan esos enlaces.
  // El acceso es discriminado porque `pedidoId` no existe en un AJUSTE.
  const trazabilidad =
    entrada.tipo === 'AJUSTE'
      ? { pedidoId: null, entregaId: null, repartidorId: null }
      : {
          pedidoId: entrada.pedidoId ?? null,
          entregaId: entrada.entregaId ?? null,
          repartidorId: entrada.repartidorId ?? null,
        };

  let cantidad = entrada.cantidad;
  let saldoResultante = saldoAnterior;

  switch (entrada.tipo) {
    case 'ENTREGA':
      // El bidón sale de la empresa. El stock ya se descontó al crear la
      // venta, así que aquí NO se vuelve a tocar el inventario.
      saldoResultante = saldoAnterior + cantidad;
      break;

    case 'DEVOLUCION':
      if (cantidad > saldoAnterior && !config.reglas.permitirDevolucionExcesiva) {
        throw new ErrorReglaNegocio(
          `El cliente tiene ${saldoAnterior} bidón(es) pendiente(s) y se intentan devolver ${cantidad}`,
          'DEVOLUCION_EXCESIVA',
        );
      }
      saldoResultante = saldoAnterior - cantidad;
      // El envase vacío vuelve a estar disponible en planta, así que reaparece
      // en el stock. Sin esta entrada, el inventario se agotaría para siempre
      // aunque los bidones estuvieran físicamente devueltos.
      await aplicarMovimientoInventario(
        {
          productoId: entrada.productoId,
          tipo: 'ENTRADA',
          cantidad,
          usuarioId,
          origen: 'DEVOLUCION BIDON',
          observaciones: entrada.observaciones ?? null,
          pedidoId: trazabilidad.pedidoId,
        },
        tx,
      );
      break;

    case 'PERDIDA':
      // La pérdida solo puede exceder al saldo si hay un cliente implicado.
      // Una pérdida interna no tiene a quién adjudicarle el bidón, así que el
      // saldo es cero por definición y no debe bloquear el registro.
      if (clienteId && cantidad > saldoAnterior && !config.reglas.permitirDevolucionExcesiva) {
        throw new ErrorReglaNegocio(
          `No se puede registrar la pérdida: el cliente solo tiene ${saldoAnterior} bidón(es) a su nombre`,
          'PERDIDA_EXCESIVA',
        );
      }
      saldoResultante = saldoAnterior - cantidad;
      // Si la pérdida corresponde a un bidón ya vendido, el inventario se
      // descontó al crear la venta y descontarlo otra vez sería doble. Solo
      // una pérdida interna (sin cliente) saca el bidón del stock.
      if (!clienteId) {
        await aplicarMovimientoInventario(
          {
            productoId: entrada.productoId,
            tipo: 'SALIDA',
            cantidad,
            usuarioId,
            origen: 'PERDIDA INTERNA',
            observaciones: entrada.observaciones ?? null,
            pedidoId: null,
          },
          tx,
        );
      }
      break;

    case 'AJUSTE': {
      const signo = entrada.signo === '-1' ? -1 : 1;
      cantidad = cantidad * signo;
      saldoResultante = saldoAnterior + cantidad;
      if (saldoResultante < 0 && !config.reglas.permitirDevolucionExcesiva) {
        throw new ErrorReglaNegocio(
          'El ajuste dejaría el saldo de bidones del cliente en negativo',
          'SALDO_NEGATIVO',
        );
      }
      break;
    }
  }

  const movimiento = await tx.movimientoBidon.create({
    // Un movimiento sin cliente es una pérdida interna, por eso `clienteId`
    // se envía como `undefined` y no como null.
    data: {
      clienteId: clienteId ?? undefined,
      productoId: entrada.productoId,
      pedidoId: trazabilidad.pedidoId,
      entregaId: trazabilidad.entregaId,
      repartidorId: trazabilidad.repartidorId,
      usuarioId,
      tipo: entrada.tipo,
      cantidad,
      saldoAnterior,
      saldoResultante,
      observaciones: entrada.observaciones ?? null,
    },
    include: {
      producto: { select: { id: true, nombre: true } },
      cliente: { select: { id: true, nombre: true } },
    },
  });

  if (clienteId) {
    await registrarHistorial(
      {
        tipo: TipoRegistroHistorial.BIDON,
        entidadId: movimiento.id,
        codigo: nombreCliente?.slice(0, 20) ?? null,
        estadoAnterior: `Saldo ${saldoAnterior}`,
        estadoNuevo: `Saldo ${saldoResultante}`,
        accion: AccionHistorial.BIDON_MOVIMIENTO,
        descripcion: `${entrada.tipo} de ${entrada.cantidad} bidón(es) de ${producto.nombre}`,
        observaciones: entrada.observaciones ?? null,
        usuarioId,
        pedidoId: trazabilidad.pedidoId ?? undefined,
      },
      tx,
    );
  }

  return movimiento;
};

/**
 * Historial de bidones de un cliente con su saldo actual.
 * Alimenta el indicador "tiempo promedio de consulta del historial de
 * envases" (TPHE): el servicio de reportes mide y registra esta consulta.
 */
export const historialBidonesCliente = async (clienteId: number, productoId?: number) => {
  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    select: { id: true, nombre: true, telefono: true, direccion: true, activo: true },
  });
  if (!cliente) throw new ErrorNoEncontrado('Cliente');

  const movimientos = await prisma.movimientoBidon.findMany({
    where: { clienteId, ...(productoId ? { productoId } : {}) },
    orderBy: { fecha: 'desc' },
    include: {
      producto: { select: { id: true, nombre: true } },
      pedido: { select: { id: true, codigo: true } },
      repartidor: { select: { id: true, nombre: true } },
      usuario: { select: { id: true, nombreCompleto: true } },
    },
  });

  const saldos = await prisma.movimientoBidon.groupBy({
    by: ['productoId', 'tipo'],
    where: { clienteId, ...(productoId ? { productoId } : {}) },
    _sum: { cantidad: true },
  });

  const porProducto = new Map<number, number>();
  for (const fila of saldos) {
    porProducto.set(fila.productoId, (porProducto.get(fila.productoId) ?? 0) + saldoDesdeAgrupacion([fila]));
  }

  const nombres = await nombresProductosRetornables();
  const saldoPorProducto = [...porProducto.entries()].map(([pid, saldo]) => ({
    productoId: pid,
    nombre: nombres.get(pid) ?? `Producto ${pid}`,
    saldo,
  }));

  return {
    cliente,
    saldoTotal: saldoPorProducto.reduce((a, s) => a + s.saldo, 0),
    saldoPorProducto,
    movimientos,
  };
};

export const listarMovimientosBidon = async (filtros: ListarMovimientosBidonQuery) => {
  const where: Prisma.MovimientoBidonWhereInput = {
    ...(filtros.clienteId ? { clienteId: filtros.clienteId } : {}),
    ...(filtros.productoId ? { productoId: filtros.productoId } : {}),
    ...(filtros.pedidoId ? { pedidoId: filtros.pedidoId } : {}),
    ...(filtros.repartidorId ? { repartidorId: filtros.repartidorId } : {}),
    ...(filtros.tipo !== 'todos' ? { tipo: filtros.tipo } : {}),
    ...(filtros.fechaInicio || filtros.fechaFin
      ? {
          fecha: {
            ...(filtros.fechaInicio ? { gte: filtros.fechaInicio } : {}),
            ...(filtros.fechaFin ? { lte: filtros.fechaFin } : {}),
          },
        }
      : {}),
  };

  const [total, datos] = await prisma.$transaction([
    prisma.movimientoBidon.count({ where }),
    prisma.movimientoBidon.findMany({
      where,
      orderBy: { id: filtros.orden },
      skip: (filtros.pagina - 1) * filtros.limite,
      take: filtros.limite,
      include: {
        cliente: { select: { id: true, nombre: true, telefono: true } },
        producto: { select: { id: true, nombre: true } },
        pedido: { select: { id: true, codigo: true } },
        repartidor: { select: { id: true, nombre: true } },
        usuario: { select: { id: true, nombreCompleto: true } },
      },
    }),
  ]);

  return construirPaginacion(datos, total, filtros.pagina, filtros.limite);
};

/**
 * Saldos de todos los clientes. Responde a la pregunta operativa:
 * "¿quién me debe bidones y cuántos?".
 */
export const listarSaldosBidones = async (
  filtros: z.infer<typeof listarSaldosBidonesSchema>,
) => {
  const clientes = await prisma.cliente.findMany({
    where: {
      eliminadoEn: null,
      ...(filtros.busqueda
        ? {
            OR: [
              { nombre: { contains: filtros.busqueda } },
              { documento: { contains: filtros.busqueda } },
            ],
          }
        : {}),
    },
    orderBy: { nombre: 'asc' },
    select: { id: true, nombre: true, telefono: true, direccion: true, tipo: true },
  });

  const ids = clientes.map((c) => c.id);
  const mapa = await saldosPorCliente(ids);
  const nombres = await nombresProductosRetornables();

  let filas = clientes.map((c) => {
    const porProducto = mapa.get(c.id) ?? new Map<number, number>();
    const detalle = [...porProducto.entries()]
      .map(([productoId, saldo]) => ({
        productoId,
        nombre: nombres.get(productoId) ?? `Producto ${productoId}`,
        saldo,
      }))
      .filter((d) => d.saldo !== 0);
    return {
      ...c,
      saldo: detalle.reduce((a, d) => a + d.saldo, 0),
      detalle,
    };
  });

  if (filtros.soloConSaldo === 'true') {
    filas = filas.filter((f) => f.saldo > 0);
  }

  const inicio = (filtros.pagina - 1) * filtros.limite;
  return construirPaginacion(
    filas.slice(inicio, inicio + filtros.limite),
    filas.length,
    filtros.pagina,
    filtros.limite,
  );
};

/** Saldo total de bidones en manos de los clientes (deuda de envases). */
export const saldoTotalBidones = async (): Promise<number> => {
  const clientes = await prisma.cliente.findMany({
    where: { eliminadoEn: null },
    select: { id: true },
  });
  const mapa = await saldosPorCliente(clientes.map((c) => c.id));
  let total = 0;
  for (const porProducto of mapa.values()) {
    for (const saldo of porProducto.values()) total += saldo;
  }
  return total;
};
