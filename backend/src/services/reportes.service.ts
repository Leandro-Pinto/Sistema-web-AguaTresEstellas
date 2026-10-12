import {
  Prisma,
  MetodoPago,
  EstadoPedido,
  EstadoEntrega,
  TipoMovimientoBidon,
} from '@prisma/client';
import { prisma } from '../config/prisma';
import { medirConsulta } from '../middlewares/logConsultas';
import { filtroOrigenPorPedido, ORIGEN_POR_DEFECTO } from './origen-dato';
import type { OrigenDato } from '@prisma/client';

/**
 * Procedencia de los registros que entran en un reporte.
 *
 * Los reportes son la evidencia que se lleva al libro de análisis de la tesis,
 * así que por defecto solo leen `REAL`: los registros que produjo el simulador
 * para demostraciones no pueden aparecer en una tabla de resultados. Ver
 * `services/origen-dato.ts` para la regla de los tres entornos.
 *
 * Se declara en cada reporte como último argumento opcional: así el valor por
 * omisión es explícito en la firma y quien llame desde el simulador tiene que
 * escribirlo, en lugar de heredar el comportamiento por sorpresa.
 */
export type OrigenReporte = OrigenDato;

export { ORIGEN_POR_DEFECTO };

export interface RangoFechas {
  fechaInicio: Date;
  fechaFin: Date;
}

const rango = (f: RangoFechas) => ({ gte: f.fechaInicio, lte: f.fechaFin });

/**
 * SERVICIO DE REPORTES
 *
 * Cada reporte se mide con `medirConsulta`, que registra la duración real.
 * Esa información alimenta los indicadores "tiempo promedio para obtener el
 * consolidado diario de ventas" y "tiempo promedio de consulta del historial
 * de envases" de la matriz de operacionalización.
 */

export const reporteVentas = async (
  f: RangoFechas,
  usuarioId: number,
  filtros?: { clienteId?: number; usuarioId?: number },
  origen: OrigenDato = ORIGEN_POR_DEFECTO,
) =>
  medirConsulta(
    'REPORTE_VENTAS',
    `Reporte de ventas del ${f.fechaInicio.toISOString().slice(0, 10)} al ${f.fechaFin.toISOString().slice(0, 10)}`,
    usuarioId,
    async () => {
      const where: Prisma.VentaWhereInput = {
        fecha: rango(f),
        estado: { not: 'ANULADA' },
        origen,
        ...(filtros?.clienteId ? { clienteId: filtros.clienteId } : {}),
        ...(filtros?.usuarioId ? { usuarioId: filtros.usuarioId } : {}),
      };

      const [ventas, totales, porMetodo, porDia, topClientes] = await Promise.all([
        prisma.venta.findMany({
          where,
          orderBy: { fecha: 'desc' },
          take: 500,
          select: {
            id: true,
            numero: true,
            fecha: true,
            subtotal: true,
            descuento: true,
            total: true,
            totalPagado: true,
            saldo: true,
            estado: true,
            constanciaEmitida: true,
            cliente: { select: { id: true, nombre: true, documento: true } },
            usuario: { select: { nombreCompleto: true } },
            pedido: { select: { codigo: true } },
            pagos: { where: { estado: 'REGISTRADO' }, select: { metodo: true, monto: true } },
          },
        }),
        prisma.venta.aggregate({
          where,
          _sum: { total: true, totalPagado: true, saldo: true, descuento: true },
          _count: true,
          _avg: { total: true },
        }),
        prisma.pago.groupBy({
          by: ['metodo'],
          where: { estado: 'REGISTRADO', fecha: rango(f) },
          _sum: { monto: true },
          _count: true,
        }),
        prisma.$queryRaw<{ fecha: string; total: number; cantidad: number }[]>`
          SELECT DATE(fecha) AS fecha, SUM(total) AS total, COUNT(*) AS cantidad
          FROM ventas
          WHERE fecha BETWEEN ${f.fechaInicio} AND ${f.fechaFin}
            AND estado <> 'ANULADA' AND origen = ${origen}
          GROUP BY DATE(fecha)
          ORDER BY fecha
        `,
        prisma.venta.groupBy({
          by: ['clienteId'],
          where,
          _sum: { total: true },
          _count: true,
          orderBy: { _sum: { total: 'desc' } },
          take: 10,
        }),
      ]);

      const nombresClientes = await prisma.cliente.findMany({
        where: { id: { in: topClientes.map((c) => c.clienteId) } },
        select: { id: true, nombre: true, documento: true },
      });
      const mapaClientes = new Map(nombresClientes.map((c) => [c.id, c.nombre]));

      return {
        periodo: f,
        resumen: {
          cantidadVentas: totales._count,
          totalVendido: Number(totales._sum.total ?? 0),
          totalCobrado: Number(totales._sum.totalPagado ?? 0),
          porCobrar: Number(totales._sum.saldo ?? 0),
          descuentos: Number(totales._sum.descuento ?? 0),
          ticketPromedio: Number(totales._avg.total ?? 0),
        },
        porMetodoPago: porMetodo.map((m) => ({
          metodo: m.metodo,
          total: Number(m._sum.monto ?? 0),
          cantidad: m._count,
        })),
        porDia: porDia.map((d) => ({
          fecha: d.fecha,
          total: Number(d.total),
          cantidad: Number(d.cantidad),
        })),
        topClientes: topClientes.map((c) => ({
          clienteId: c.clienteId,
          nombre: mapaClientes.get(c.clienteId) ?? `Cliente ${c.clienteId}`,
          total: Number(c._sum.total ?? 0),
          ventas: c._count,
        })),
        ventas,
      };
    },
    (r) => r.ventas.length,
  );

export const reportePedidos = async (
  f: RangoFechas,
  usuarioId: number,
  filtros?: { estado?: EstadoPedido; clienteId?: number; repartidorId?: number; usuarioId?: number },
  origen: OrigenDato = ORIGEN_POR_DEFECTO,
) =>
  medirConsulta(
    'REPORTE_PEDIDOS',
    `Reporte de pedidos del ${f.fechaInicio.toISOString().slice(0, 10)} al ${f.fechaFin.toISOString().slice(0, 10)}`,
    usuarioId,
    async () => {
      const where: Prisma.PedidoWhereInput = {
        registradoEn: rango(f),
        origen,
        ...(filtros?.estado ? { estado: filtros.estado } : {}),
        ...(filtros?.clienteId ? { clienteId: filtros.clienteId } : {}),
        ...(filtros?.repartidorId ? { entrega: { repartidorId: filtros.repartidorId } } : {}),
        ...(filtros?.usuarioId ? { usuarioId: filtros.usuarioId } : {}),
      };

      const [pedidos, porEstado, porCanal, tiempos] = await Promise.all([
        prisma.pedido.findMany({
          where,
          orderBy: { registradoEn: 'desc' },
          take: 500,
          select: {
            id: true,
            codigo: true,
            estado: true,
            canal: true,
            total: true,
            recibidoEn: true,
            registradoEn: true,
            confirmadoEn: true,
            asignadoEn: true,
            entregadoEn: true,
            requiereCorreccion: true,
            cliente: { select: { id: true, nombre: true, documento: true } },
            entrega: { select: { repartidor: { select: { nombre: true } }, horaEntrega: true } },
            venta: { select: { numero: true } },
          },
        }),
        prisma.pedido.groupBy({ by: ['estado'], where, _count: { _all: true } }),
        prisma.pedido.groupBy({ by: ['canal'], where, _count: { _all: true } }),
        // Tiempos reales del proceso, calculados desde las marcas de tiempo.
        prisma.$queryRaw<{ tiempoRegistro: number; tiempoConfirmacion: number; tiempoAsignacion: number; ciclo: number }[]>`
          SELECT
            AVG(TIMESTAMPDIFF(SECOND, recibidoEn, registradoEn)) / 60 AS tiempoRegistro,
            AVG(TIMESTAMPDIFF(SECOND, registradoEn, confirmadoEn)) / 60 AS tiempoConfirmacion,
            AVG(TIMESTAMPDIFF(SECOND, confirmadoEn, asignadoEn)) / 60 AS tiempoAsignacion,
            AVG(TIMESTAMPDIFF(SECOND, registradoEn, entregadoEn)) / 60 AS ciclo
          FROM pedidos
          WHERE registradoEn BETWEEN ${f.fechaInicio} AND ${f.fechaFin}
            AND origen = ${origen}
        `,
      ]);

      return {
        periodo: f,
        resumen: {
          // Suma de los grupos y no `pedidos.length`: el detalle viene recortado
          // a 500 filas y usarla daría un total de pedidos que no es el del
          // periodo, con el desglose por estado sumando más que ese total.
          totalPedidos: porEstado.reduce((suma, e) => suma + e._count._all, 0),
          porEstado: Object.fromEntries(porEstado.map((e) => [e.estado, e._count._all])),
          porCanal: Object.fromEntries(porCanal.map((c) => [c.canal, c._count._all])),
          tiempos: {
            registroMin: Number(Number(tiempos[0]?.tiempoRegistro ?? 0).toFixed(2)),
            confirmacionMin: Number(Number(tiempos[0]?.tiempoConfirmacion ?? 0).toFixed(2)),
            asignacionMin: Number(Number(tiempos[0]?.tiempoAsignacion ?? 0).toFixed(2)),
            cicloCompletoMin: Number(Number(tiempos[0]?.ciclo ?? 0).toFixed(2)),
          },
        },
        pedidos,
      };
    },
    (r) => r.pedidos.length,
  );

export const reportePagos = async (
  f: RangoFechas,
  usuarioId: number,
  filtros?: { metodo?: MetodoPago; clienteId?: number },
  origen: OrigenDato = ORIGEN_POR_DEFECTO,
) =>
  medirConsulta(
    'REPORTE_PAGOS',
    `Reporte de pagos del ${f.fechaInicio.toISOString().slice(0, 10)} al ${f.fechaFin.toISOString().slice(0, 10)}`,
    usuarioId,
    async () => {
      const where: Prisma.PagoWhereInput = {
        fecha: rango(f),
        origen,
        ...(filtros?.metodo ? { metodo: filtros.metodo } : {}),
        ...(filtros?.clienteId ? { venta: { clienteId: filtros.clienteId } } : {}),
      };

      const [pagos, porMetodo, porDia, anulados] = await Promise.all([
        prisma.pago.findMany({
          where,
          orderBy: { fecha: 'desc' },
          take: 500,
          select: {
            id: true,
            monto: true,
            metodo: true,
            referencia: true,
            fecha: true,
            estado: true,
            venta: {
              select: {
                numero: true,
                total: true,
                cliente: { select: { id: true, nombre: true, documento: true } },
              },
            },
            recibidoPor: { select: { nombreCompleto: true } },
          },
        }),
        prisma.pago.groupBy({ by: ['metodo'], where: { ...where, estado: 'REGISTRADO' }, _sum: { monto: true }, _count: true }),
        prisma.$queryRaw<{ fecha: string; total: number }[]>`
          SELECT DATE(fecha) AS fecha, SUM(monto) AS total
          FROM pagos
          WHERE fecha BETWEEN ${f.fechaInicio} AND ${f.fechaFin}
            AND estado = 'REGISTRADO' AND origen = ${origen}
          GROUP BY DATE(fecha)
          ORDER BY fecha
        `,
        prisma.pago.count({ where: { ...where, estado: 'ANULADO' } }),
      ]);

      return {
        periodo: f,
        resumen: {
          totalCobrado: porMetodo.reduce((a, m) => a + Number(m._sum.monto ?? 0), 0),
          // Suma de los grupos por método y no el conteo sobre `pagos`: el
          // detalle está recortado a 500 filas y el conteo quedaría falseado.
          cantidadPagos: porMetodo.reduce((a, m) => a + m._count, 0),
          pagosAnulados: anulados,
        },
        porMetodo: porMetodo.map((m) => ({
          metodo: m.metodo,
          total: Number(m._sum.monto ?? 0),
          cantidad: m._count,
        })),
        porDia: porDia.map((d) => ({ fecha: d.fecha, total: Number(d.total) })),
        pagos,
      };
    },
    (r) => r.pagos.length,
  );

export const reporteEntregas = async (
  f: RangoFechas,
  usuarioId: number,
  filtros?: { repartidorId?: number; resultado?: EstadoEntrega },
  origen: OrigenDato = ORIGEN_POR_DEFECTO,
) =>
  medirConsulta(
    'REPORTE_ENTREGAS',
    `Reporte de entregas del ${f.fechaInicio.toISOString().slice(0, 10)} al ${f.fechaFin.toISOString().slice(0, 10)}`,
    usuarioId,
    async () => {
      const where: Prisma.EntregaWhereInput = {
        fechaAsignacion: rango(f),
        origen,
        ...(filtros?.repartidorId ? { repartidorId: filtros.repartidorId } : {}),
        ...(filtros?.resultado ? { estado: filtros.resultado } : {}),
      };

      const [entregas, porRepartidor, porEstado, tiempos] = await Promise.all([
        prisma.entrega.findMany({
          where,
          orderBy: { fechaAsignacion: 'desc' },
          take: 500,
          select: {
            id: true,
            estado: true,
            fechaAsignacion: true,
            horaSalida: true,
            horaEntrega: true,
            minutosDemora: true,
            bidonesEntregados: true,
            bidonesDevueltos: true,
            montoRecibido: true,
            motivoNoEntrega: true,
            repartidor: { select: { id: true, nombre: true } },
            pedido: { select: { codigo: true, cliente: { select: { nombre: true } } } },
          },
        }),
        prisma.entrega.groupBy({
          by: ['repartidorId'],
          where,
          _count: { _all: true },
          // Es el promedio y no la suma: con la suma, el valor crece con cada
          // entrega y un repartidor con más rutas parecería más lento.
          _avg: { minutosDemora: true },
        }),
        prisma.entrega.groupBy({ by: ['estado'], where, _count: { _all: true } }),
        prisma.$queryRaw<{ salida: number; entrega: number }[]>`
          SELECT
            AVG(TIMESTAMPDIFF(MINUTE, fechaAsignacion, horaSalida)) AS salida,
            AVG(TIMESTAMPDIFF(MINUTE, horaSalida, horaEntrega)) AS entrega
          FROM entregas
          WHERE fechaAsignacion BETWEEN ${f.fechaInicio} AND ${f.fechaFin}
            AND origen = ${origen}
        `,
      ]);

      const repartidores = await prisma.repartidor.findMany({
        where: { id: { in: porRepartidor.map((p) => p.repartidorId) } },
        select: { id: true, nombre: true, zona: true },
      });
      const mapa = new Map(repartidores.map((r) => [r.id, r]));

      const completadas = porEstado.find((e) => e.estado === 'ENTREGADA')?._count._all ?? 0;
      // El total sale de los grupos por estado y no de `entregas.length`: el
      // detalle viene recortado al tope de filas, así que medir con su
      // longitud daría un porcentaje de entregas sobre el número de filas
      // mostradas en vez de sobre las entregas del periodo.
      const total = porEstado.reduce((suma, e) => suma + e._count._all, 0);

      return {
        periodo: f,
        resumen: {
          totalEntregas: total,
          entregadas: completadas,
          noEntregadas: porEstado.find((e) => e.estado === 'NO_ENTREGADO')?._count._all ?? 0,
          porcentajeEntregadas: total ? Number(((completadas / total) * 100).toFixed(2)) : 0,
          minutosPromedioSalida: Number(Number(tiempos[0]?.salida ?? 0).toFixed(2)),
          minutosPromedioEntrega: Number(Number(tiempos[0]?.entrega ?? 0).toFixed(2)),
        },
        porRepartidor: porRepartidor.map((p) => ({
          repartidorId: p.repartidorId,
          nombre: mapa.get(p.repartidorId)?.nombre ?? `Repartidor ${p.repartidorId}`,
          zona: mapa.get(p.repartidorId)?.zona ?? null,
          entregas: p._count._all,
          minutosPromedioDemora:
            p._avg.minutosDemora === null
              ? null
              : Number(Number(p._avg.minutosDemora).toFixed(1)),
        })),
        porEstado: Object.fromEntries(porEstado.map((e) => [e.estado, e._count._all])),
        entregas,
      };
    },
    (r) => r.entregas.length,
  );

export const reporteClientes = async (
  f: RangoFechas,
  usuarioId: number,
  origen: OrigenDato = ORIGEN_POR_DEFECTO,
) =>
  medirConsulta(
    'REPORTE_CLIENTES',
    'Reporte de clientes del periodo',
    usuarioId,
    async () => {
      const clientes = await prisma.cliente.findMany({
        where: { eliminadoEn: null },
        select: {
          id: true,
          tipo: true,
          documento: true,
          nombre: true,
          telefono: true,
          direccion: true,
          distrito: true,
          activo: true,
          fechaRegistro: true,
        },
      });

      const ventas = await prisma.venta.groupBy({
        by: ['clienteId'],
        where: { fecha: rango(f), estado: { not: 'ANULADA' }, origen },
        _sum: { total: true, saldo: true },
        _count: true,
      });
      const pedidos = await prisma.pedido.groupBy({
        by: ['clienteId'],
        where: { registradoEn: rango(f), origen },
        _count: true,
      });

      const mapaVentas = new Map(ventas.map((v) => [v.clienteId, v]));
      const mapaPedidos = new Map(pedidos.map((p) => [p.clienteId, p._count]));

      // Datos completos: sin ellos el personal no puede localizar al cliente.
      const completos = clientes.filter(
        (c) => c.telefono && c.direccion && c.documento && c.nombre.length > 2,
      ).length;

      const filas = clientes.map((c) => {
        const v = mapaVentas.get(c.id);
        return {
          ...c,
          ventasPeriodo: v?._count ?? 0,
          totalComprado: Number(v?._sum.total ?? 0),
          saldoPendiente: Number(v?._sum.saldo ?? 0),
          pedidosPeriodo: mapaPedidos.get(c.id) ?? 0,
        };
      });

      return {
        periodo: f,
        resumen: {
          totalClientes: clientes.length,
          clientesActivos: clientes.filter((c) => c.activo).length,
          clientesInactivos: clientes.filter((c) => !c.activo).length,
          conDatosCompletos: completos,
          porcentajeDatosCompletos: clientes.length
            ? Number(((completos / clientes.length) * 100).toFixed(2))
            : 0,
        },
        clientes: filas,
      };
    },
    (r) => r.clientes.length,
  );

export const reporteBidones = async (
  f: RangoFechas,
  usuarioId: number,
  filtros?: { clienteId?: number; repartidorId?: number },
  origen: OrigenDato = ORIGEN_POR_DEFECTO,
) =>
  medirConsulta(
    'REPORTE_BIDONES',
    'Reporte de control de bidones del periodo',
    usuarioId,
    async () => {
      // El movimiento de bidón no tiene columna de origen: lo que se sabe es el
      // pedido que lo originó, y ese es el que el simulador crea. La regla de
      // los movimientos sin pedido está en `filtroOrigenPorPedido`.
      const where: Prisma.MovimientoBidonWhereInput = {
        fecha: rango(f),
        ...filtroOrigenPorPedido(origen),
        ...(filtros?.clienteId ? { clienteId: filtros.clienteId } : {}),
        ...(filtros?.repartidorId ? { repartidorId: filtros.repartidorId } : {}),
      };

      const [movimientos, porTipo, saldos] = await Promise.all([
        prisma.movimientoBidon.findMany({
          where,
          orderBy: { fecha: 'desc' },
          take: 500,
          select: {
            id: true,
            tipo: true,
            cantidad: true,
            saldoResultante: true,
            fecha: true,
            cliente: { select: { id: true, nombre: true, documento: true, telefono: true } },
            producto: { select: { nombre: true } },
            repartidor: { select: { nombre: true } },
            pedido: { select: { codigo: true } },
          },
        }),
        prisma.movimientoBidon.groupBy({ by: ['tipo'], where, _sum: { cantidad: true }, _count: true }),
        prisma.$queryRaw<{ clienteId: number; nombre: string; documento: string; saldo: number }[]>`
          SELECT c.id AS clienteId, c.nombre AS nombre, c.documento AS documento,
                 SUM(CASE WHEN m.tipo IN ('ENTREGA','AJUSTE') THEN m.cantidad ELSE -m.cantidad END) AS saldo
          FROM clientes c
          JOIN movimientos_bidones m ON m.clienteId = c.id
          LEFT JOIN pedidos p ON p.id = m.pedidoId
          WHERE c.eliminadoEn IS NULL
            AND (m.pedidoId IS NULL OR p.origen = ${origen})
          GROUP BY c.id, c.nombre, c.documento
          HAVING saldo <> 0
          ORDER BY saldo DESC
        `,
      ]);

      const resumenTipo = Object.fromEntries(porTipo.map((t) => [t.tipo, t._sum.cantidad ?? 0]));

      return {
        periodo: f,
        resumen: {
          entregados: resumenTipo.ENTREGA ?? 0,
          devueltos: resumenTipo.DEVOLUCION ?? 0,
          perdidos: resumenTipo.PERDIDA ?? 0,
          saldoPendiente: saldos.reduce((a, s) => a + Number(s.saldo), 0),
          clientesConSaldo: saldos.filter((s) => Number(s.saldo) > 0).length,
          // Suma de los conteos por tipo y no `movimientos.length`: el detalle
          // está recortado a 500 filas.
          movimientos: porTipo.reduce((a, t) => a + t._count, 0),
        },
        saldos: saldos.map((s) => ({ ...s, saldo: Number(s.saldo) })),
        porTipo: porTipo.map((t) => ({
          tipo: t.tipo as TipoMovimientoBidon,
          cantidad: t._sum.cantidad ?? 0,
          movimientos: t._count,
        })),
        movimientos,
      };
    },
    (r) => r.movimientos.length,
  );

export const reporteInventario = async (
  f: RangoFechas,
  usuarioId: number,
  origen: OrigenDato = ORIGEN_POR_DEFECTO,
) =>
  medirConsulta(
    'REPORTE_INVENTARIO',
    'Reporte de movimientos de inventario del periodo',
    usuarioId,
    async () => {
      // Los movimientos de inventario no llevan columna de origen: son
      // entradas y salidas del almacén, no del proceso de ventas. Se filtra por
      // el pedido que causó el movimiento, según `filtroOrigenPorPedido`.
      const soloPedidosDelOrigen = filtroOrigenPorPedido(origen);

      const [productos, movimientos, porTipo, valor, conteoInconsistencias] = await Promise.all([
        prisma.producto.findMany({
          where: { eliminadoEn: null },
          select: {
            id: true,
            codigo: true,
            nombre: true,
            unidadMedida: true,
            stock: true,
            stockMinimo: true,
            costoUnitario: true,
            precioVenta: true,
            esRetornable: true,
          },
        }),
        prisma.movimientoInventario.findMany({
          where: { fecha: rango(f), ...soloPedidosDelOrigen },
          orderBy: { id: 'desc' },
          take: 500,
          select: {
            id: true,
            tipo: true,
            cantidad: true,
            stockAnterior: true,
            stockResultante: true,
            origen: true,
            fecha: true,
            producto: { select: { nombre: true, unidadMedida: true } },
            usuario: { select: { nombreCompleto: true } },
          },
        }),
        prisma.movimientoInventario.groupBy({
          by: ['tipo'],
          where: { fecha: rango(f), ...soloPedidosDelOrigen },
          _sum: { cantidad: true },
          _count: true,
        }),
        prisma.movimientoInventario.aggregate({
          where: { fecha: rango(f), ...soloPedidosDelOrigen },
          _sum: { cantidad: true },
          _count: true,
        }),
        // La coherencia se cuenta en la base y no sobre el detalle de JS: el
        // detalle está recortado a 500 filas, así que filtrarlo en memoria
        // revisaría menos de un tercio de los movimientos del periodo y aun
        // así dividiría entre el total real, dando un 100 % sin comprobarlo.
        prisma.$queryRaw<{ inconsistentes: number }[]>`
          SELECT COUNT(*) AS inconsistentes
          FROM movimientos_inventario mi
          LEFT JOIN pedidos p ON p.id = mi.pedidoId
          WHERE mi.fecha BETWEEN ${f.fechaInicio} AND ${f.fechaFin}
            AND (mi.pedidoId IS NULL OR p.origen = ${origen})
            AND mi.stockResultante <> CASE
              WHEN tipo = 'SALIDA' THEN stockAnterior - cantidad
              ELSE stockAnterior + cantidad
            END
        `,
      ]);

      // Verificación de consistencia: cada movimiento debe coherir con el
      // stock que dejó. Es el indicador "porcentaje de actualización correcta
      // del stock": si todos los movimientos son coherentes, vale 100 %.
      const totalMovimientos = valor._count;
      const inconsistencias = Number(conteoInconsistencias[0]?.inconsistentes ?? 0);

      return {
        periodo: f,
        resumen: {
          totalProductos: productos.length,
          productosAgotados: productos.filter((p) => p.stock === 0).length,
          productosStockBajo: productos.filter((p) => p.stock <= p.stockMinimo).length,
          movimientosRegistrados: totalMovimientos,
          movimientoConsistentes: totalMovimientos - inconsistencias,
          porcentajeActualizacionCorrecta: totalMovimientos
            ? Number((((totalMovimientos - inconsistencias) / totalMovimientos) * 100).toFixed(2))
            : 100,
          valorInventarioCosto: productos.reduce((a, p) => a + (Number(p.costoUnitario ?? 0) * p.stock), 0),
        },
        porTipo: porTipo.map((t) => ({ tipo: t.tipo, cantidad: t._sum.cantidad ?? 0, movimientos: t._count })),
        productos,
        movimientos,
      };
    },
    (r) => r.movimientos.length,
  );

/**
 * Consolidado diario: la respuesta directa a la pregunta "cuánto se vendió
 * hoy", que en el proceso manual obligaba a revisar cuadernos.
 */
export const consolidadoDiario = async (
  fecha: Date,
  usuarioId: number,
  origen: OrigenDato = ORIGEN_POR_DEFECTO,
) =>
  medirConsulta(
    'CONSOLIDADO_DIARIO',
    `Consolidado diario del ${fecha.toISOString().slice(0, 10)}`,
    usuarioId,
    async () => {
      const inicio = new Date(fecha);
      inicio.setHours(0, 0, 0, 0);
      const fin = new Date(fecha);
      fin.setHours(23, 59, 59, 999);

      const [ventas, pagos, pedidos, unidades] = await Promise.all([
        prisma.venta.aggregate({
          where: { fecha: { gte: inicio, lte: fin }, estado: { not: 'ANULADA' }, origen },
          _sum: { total: true, totalPagado: true, saldo: true, descuento: true },
          _count: true,
          _avg: { total: true },
        }),
        prisma.pago.groupBy({
          by: ['metodo'],
          where: { fecha: { gte: inicio, lte: fin }, estado: 'REGISTRADO', origen },
          _sum: { monto: true },
          _count: true,
        }),
        prisma.pedido.groupBy({
          by: ['estado'],
          where: { registradoEn: { gte: inicio, lte: fin }, origen },
          _count: { _all: true },
        }),
        prisma.detalleVenta.aggregate({
          where: { venta: { fecha: { gte: inicio, lte: fin }, estado: { not: 'ANULADA' }, origen } },
          _sum: { cantidad: true },
        }),
      ]);

      return {
        fecha: inicio,
        resumen: {
          ventas: ventas._count,
          totalVendido: Number(ventas._sum.total ?? 0),
          totalCobrado: Number(ventas._sum.totalPagado ?? 0),
          porCobrar: Number(ventas._sum.saldo ?? 0),
          descuentos: Number(ventas._sum.descuento ?? 0),
          ticketPromedio: Number(ventas._avg.total ?? 0),
          unidadesVendidas: unidades._sum.cantidad ?? 0,
        },
        pagosPorMetodo: pagos.map((p) => ({
          metodo: p.metodo,
          total: Number(p._sum.monto ?? 0),
          cantidad: p._count,
        })),
        pedidosPorEstado: Object.fromEntries(pedidos.map((p) => [p.estado, p._count._all])),
      };
    },
  );

/**
 * Consulta del historial de bidones de un cliente.
 * Mide el indicador TPHE de la matriz de operacionalización.
 */
export const consultaHistorialBidones = async (
  clienteId: number,
  usuarioId: number,
  productoId?: number,
  origen: OrigenDato = ORIGEN_POR_DEFECTO,
) => {
  const { historialBidonesCliente } = await import('./bidones.service');
  return medirConsulta(
    'CONSULTA_HISTORIAL_BIDONES',
    `Historial de bidones del cliente ${clienteId}`,
    usuarioId,
    () => historialBidonesCliente(clienteId, productoId, origen),
    (r) => r.movimientos.length,
  );
};

/**
 * Reporte de tiempos del proceso, calculado con SQL sobre las marcas de
 * tiempo reales. Es la fuente del postest para las dimensiones de tiempo.
 */
export const reporteTiemposProceso = async (
  f: RangoFechas,
  usuarioId: number,
  origen: OrigenDato = ORIGEN_POR_DEFECTO,
) =>
  medirConsulta(
    'REPORTE_TIEMPOS_PROCESO',
    'Reporte de tiempos del proceso de ventas',
    usuarioId,
    async () => {
      const filas = await prisma.$queryRaw<
        {
          total: number;
          conRegistro: number;
          conConfirmacion: number;
          conAsignacion: number;
          entregados: number;
          sumaRegistro: number;
          sumaConfirmacion: number;
          sumaAsignacion: number;
          sumaCiclo: number;
          conError: number;
        }[]
      >`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN registradoEn IS NOT NULL THEN 1 ELSE 0 END) AS conRegistro,
          SUM(CASE WHEN confirmadoEn IS NOT NULL THEN 1 ELSE 0 END) AS conConfirmacion,
          SUM(CASE WHEN asignadoEn IS NOT NULL THEN 1 ELSE 0 END) AS conAsignacion,
          SUM(CASE WHEN entregadoEn IS NOT NULL THEN 1 ELSE 0 END) AS entregados,
          SUM(TIMESTAMPDIFF(SECOND, recibidoEn, registradoEn)) AS sumaRegistro,
          SUM(TIMESTAMPDIFF(SECOND, registradoEn, confirmadoEn)) AS sumaConfirmacion,
          SUM(TIMESTAMPDIFF(SECOND, confirmadoEn, asignadoEn)) AS sumaAsignacion,
          SUM(TIMESTAMPDIFF(SECOND, registradoEn, entregadoEn)) AS sumaCiclo,
          SUM(CASE WHEN requiereCorreccion = 1 THEN 1 ELSE 0 END) AS conError
        FROM pedidos
        WHERE registradoEn BETWEEN ${f.fechaInicio} AND ${f.fechaFin}
          AND origen = ${origen}
      `;
      const r = filas[0];
      const div = (a: number | null, b: number | null) => (b ? Number((Number(a ?? 0) / b / 60).toFixed(2)) : 0);

      return {
        periodo: f,
        muestra: Number(r?.total ?? 0),
        indicadores: {
          tiempoPromedioRegistroMin: div(r?.sumaRegistro, r?.conRegistro),
          tiempoPromedioConfirmacionMin: div(r?.sumaConfirmacion, r?.conConfirmacion),
          tiempoPromedioAsignacionMin: div(r?.sumaAsignacion, r?.conAsignacion),
          tiempoPromedioCicloMin: div(r?.sumaCiclo, r?.entregados),
        },
        conteos: {
          pedidos: Number(r?.total ?? 0),
          conErrorRegistro: Number(r?.conError ?? 0),
          entregados: Number(r?.entregados ?? 0),
        },
      };
    },
  );
