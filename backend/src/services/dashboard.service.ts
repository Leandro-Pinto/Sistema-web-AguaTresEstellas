import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { saldoTotalBidones } from './bidones.service';
import { resumenInventario } from './inventario.service';

const inicioDelDia = (): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const finDelDia = (): Date => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
};

/**
 * DASHBOARD OPERATIVO.
 *
 * Todos los valores provienen de la base de datos real: no hay datos
 * simulados ni valores por defecto. Es el requisito explícito del
 * proyecto para que el personal pueda consultar el estado del negocio
 * en el momento.
 */
export const obtenerDashboard = async () => {
  const hoy = inicioDelDia();
  const fin = finDelDia();
  const ayer = new Date(hoy);
  ayer.setDate(ayer.getDate() - 1);

  const [
    ventasHoy,
    ventasAyer,
    pedidosHoy,
    pedidosAyer,
    pedidosPorEstado,
    ventasPorMetodo,
    productosVendidos,
    inventario,
    saldoBidones,
    cartera,
    ultimasVentas,
    ultimosPedidos,
    entregasPendientes,
  ] = await Promise.all([
    prisma.venta.aggregate({
      where: { fecha: { gte: hoy, lte: fin }, estado: { not: 'ANULADA' } },
      _sum: { total: true, totalPagado: true },
      _count: true,
    }),
    prisma.venta.aggregate({
      where: { fecha: { gte: ayer, lte: hoy }, estado: { not: 'ANULADA' } },
      _sum: { total: true },
      _count: true,
    }),
    prisma.pedido.count({ where: { registradoEn: { gte: hoy, lte: fin } } }),
    prisma.pedido.count({ where: { registradoEn: { gte: ayer, lte: hoy } } }),
    prisma.pedido.groupBy({ by: ['estado'], _count: { _all: true } }),
    prisma.pago.groupBy({
      by: ['metodo'],
      where: { estado: 'REGISTRADO', fecha: { gte: hoy, lte: fin } },
      _sum: { monto: true },
      _count: true,
    }),
    prisma.detalleVenta.groupBy({
      by: ['productoId'],
      where: { venta: { fecha: { gte: hoy, lte: fin }, estado: { not: 'ANULADA' } } },
      _sum: { cantidad: true },
    }),
    resumenInventario(),
    saldoTotalBidones(),
    prisma.venta.aggregate({
      where: { estado: { in: ['PENDIENTE', 'COMPLETADA'] } },
      _sum: { saldo: true },
      _count: true,
    }),
    prisma.venta.findMany({
      orderBy: { id: 'desc' },
      take: 5,
      select: {
        id: true,
        numero: true,
        total: true,
        totalPagado: true,
        saldo: true,
        estado: true,
        fecha: true,
        cliente: { select: { nombre: true } },
      },
    }),
    prisma.pedido.findMany({
      orderBy: { id: 'desc' },
      take: 5,
      select: {
        id: true,
        codigo: true,
        estado: true,
        total: true,
        registradoEn: true,
        canal: true,
        cliente: { select: { nombre: true } },
      },
    }),
    prisma.entrega.count({ where: { estado: { in: ['ASIGNADA', 'EN_RUTA'] } } }),
  ]);

  return {
    fecha: hoy,
    ventas: {
      hoy: {
        cantidad: ventasHoy._count,
        total: Number(ventasHoy._sum.total ?? 0),
        cobrado: Number(ventasHoy._sum.totalPagado ?? 0),
      },
      ayer: {
        cantidad: ventasAyer._count,
        total: Number(ventasAyer._sum.total ?? 0),
      },
    },
    pedidos: {
      hoy: pedidosHoy,
      ayer: pedidosAyer,
      porEstado: Object.fromEntries(pedidosPorEstado.map((p) => [p.estado, p._count._all])) as Record<string, number>,
      pendientes: pedidosPorEstado
        .filter((p) => ['PENDIENTE', 'CONFIRMADO', 'ASIGNADO', 'EN_RUTA'].includes(p.estado))
        .reduce((a, p) => a + p._count._all, 0),
      entregados: pedidosPorEstado.find((p) => p.estado === 'ENTREGADO')?._count._all ?? 0,
      cancelados: pedidosPorEstado.find((p) => p.estado === 'CANCELADO')?._count._all ?? 0,
    },
    ingresos: {
      cobradoHoy: Number(ventasHoy._sum.totalPagado ?? 0),
      porCobrar: Number(cartera._sum.saldo ?? 0),
      ventasConSaldo: cartera._count,
    },
    pagosPorMetodo: ventasPorMetodo.map((p) => ({
      metodo: p.metodo,
      total: Number(p._sum.monto ?? 0),
      cantidad: p._count,
    })),
    productosVendidosHoy: productosVendidos.reduce((a, p) => a + (p._sum.cantidad ?? 0), 0),
    inventario,
    bidones: {
      pendientesDeDevolucion: saldoBidones,
    },
    entregas: {
      enCurso: entregasPendientes,
    },
    ultimasVentas,
    ultimosPedidos,
  };
};

/** Series temporales para los gráficos del dashboard. */
export const obtenerSeriesVentas = async (dias = 14) => {
  const desde = new Date();
  desde.setDate(desde.getDate() - dias);
  desde.setHours(0, 0, 0, 0);

  const ventas = await prisma.venta.findMany({
    where: { fecha: { gte: desde }, estado: { not: 'ANULADA' } },
    select: { fecha: true, total: true, totalPagado: true },
  });

  const pedidos = await prisma.pedido.findMany({
    where: { registradoEn: { gte: desde } },
    select: { registradoEn: true, estado: true },
  });

  const mapa = new Map<string, { fecha: string; ventas: number; cobrado: number; pedidos: number; entregados: number }>();
  for (let i = 0; i <= dias; i += 1) {
    const d = new Date(desde);
    d.setDate(d.getDate() + i);
    mapa.set(d.toISOString().slice(0, 10), {
      fecha: d.toISOString().slice(0, 10),
      ventas: 0,
      cobrado: 0,
      pedidos: 0,
      entregados: 0,
    });
  }

  for (const v of ventas) {
    const clave = v.fecha.toISOString().slice(0, 10);
    const fila = mapa.get(clave);
    if (!fila) continue;
    fila.ventas += Number(v.total);
    fila.cobrado += Number(v.totalPagado);
  }
  for (const p of pedidos) {
    const clave = p.registradoEn.toISOString().slice(0, 10);
    const fila = mapa.get(clave);
    if (!fila) continue;
    fila.pedidos += 1;
    if (p.estado === 'ENTREGADO') fila.entregados += 1;
  }

  return [...mapa.values()];
};

/** Productos más vendidos en el periodo indicado. */
export const obtenerProductosMasVendidos = async (dias = 30) => {
  const desde = new Date();
  desde.setDate(desde.getDate() - dias);
  desde.setHours(0, 0, 0, 0);

  const filas = await prisma.detalleVenta.groupBy({
    by: ['productoId'],
    where: { venta: { fecha: { gte: desde }, estado: { not: 'ANULADA' } } },
    _sum: { cantidad: true, subtotal: true },
    orderBy: { _sum: { cantidad: 'desc' } },
    take: 10,
  });

  const productos = await prisma.producto.findMany({
    where: { id: { in: filas.map((f) => f.productoId) } },
    select: { id: true, nombre: true, unidadMedida: true },
  });
  const nombres = new Map(productos.map((p) => [p.id, p.nombre]));

  return filas.map((f) => ({
    productoId: f.productoId,
    nombre: nombres.get(f.productoId) ?? `Producto ${f.productoId}`,
    cantidad: f._sum.cantidad ?? 0,
    importe: Number(f._sum.subtotal ?? 0),
  }));
};

/** Indicadores de proceso del día, con datos reales de la base. */
export const obtenerIndicadoresProceso = async () => {
  const hoy = inicioDelDia();
  const fin = finDelDia();

  const pedidos = await prisma.pedido.findMany({
    where: { registradoEn: { gte: hoy, lte: fin } },
    select: {
      id: true,
      recibidoEn: true,
      registradoEn: true,
      confirmadoEn: true,
      asignadoEn: true,
      entregadoEn: true,
      estado: true,
      requiereCorreccion: true,
    },
  });

  const minutos = (desde: Date, hasta: Date) => (hasta.getTime() - desde.getTime()) / 60000;
  const promedio = (lista: number[]) => (lista.length ? lista.reduce((a, b) => a + b, 0) / lista.length : 0);

  const tiemposRegistro: number[] = [];
  const tiemposConfirmacion: number[] = [];
  const tiemposAsignacion: number[] = [];
  const tiemposTotal: number[] = [];

  for (const p of pedidos) {
    tiemposRegistro.push(minutos(p.recibidoEn, p.registradoEn));
    if (p.confirmadoEn) tiemposConfirmacion.push(minutos(p.registradoEn, p.confirmadoEn));
    if (p.asignadoEn) tiemposAsignacion.push(minutos(p.confirmadoEn ?? p.registradoEn, p.asignadoEn));
    if (p.entregadoEn) tiemposTotal.push(minutos(p.registradoEn, p.entregadoEn));
  }

  return {
    pedidosAnalizados: pedidos.length,
    tiempoPromedioRegistroMin: Number(promedio(tiemposRegistro).toFixed(2)),
    tiempoPromedioConfirmacionMin: Number(promedio(tiemposConfirmacion).toFixed(2)),
    tiempoPromedioAsignacionMin: Number(promedio(tiemposAsignacion).toFixed(2)),
    tiempoPromedioCicloCompletoMin: Number(promedio(tiemposTotal).toFixed(2)),
    pedidosConErrorRegistro: pedidos.filter((p) => p.requiereCorreccion).length,
  };
};

export const productosRecientes = (limite: number) =>
  prisma.producto.findMany({
    where: { eliminadoEn: null },
    orderBy: { stock: 'asc' },
    take: limite,
    select: { id: true, codigo: true, nombre: true, stock: true, stockMinimo: true, unidadMedida: true },
  });
