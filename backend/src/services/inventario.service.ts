import {
  Prisma,
  TipoMovimientoInventario,
  AccionHistorial,
  TipoRegistroHistorial,
} from '@prisma/client';
import { config, prisma } from '../config';
import { ErrorConflicto, ErrorNoEncontrado, ErrorReglaNegocio } from '../utils/errors';
import { construirPaginacion } from '../utils/paginacion';
import { registrarHistorial } from './historial.service';
import {
  listarMovimientosInventarioSchema,
  type MovimientoInventarioInput,
} from '../validators/productosInventario.validator';
import type { z } from 'zod';

type ClienteTx = Prisma.TransactionClient | typeof prisma;

export interface AplicarMovimientoInput {
  productoId: number;
  tipo: TipoMovimientoInventario;
  cantidad: number;
  usuarioId: number;
  origen: string;
  observaciones?: string | null;
  pedidoId?: number | null;
  ventaId?: number | null;
  movimientoBidonId?: number | null;
}

/**
 * ÚNICO punto del sistema capaz de modificar `producto.stock`.
 *
 * El frontend nunca escribe stock: registra una intención de movimiento y
 * este servicio valida, calcula stockAnterior / stockResultante y deja
 * constancia. Así se cumple la regla: "una venta de 5 unidades produce una
 * salida de inventario de 5 unidades", siempre con trazabilidad.
 *
 * Se ejecuta con bloqueo de fila (SELECT ... FOR UPDATE) implícito mediante
 * update condicional, para que dos ventas simultáneas no descuadren el stock.
 */
export const aplicarMovimientoInventario = async (
  entrada: AplicarMovimientoInput,
  tx: ClienteTx = prisma,
): Promise<{ id: number; stockAnterior: number; stockResultante: number }> => {
  const producto = await tx.producto.findUnique({
    where: { id: entrada.productoId },
    select: { id: true, nombre: true, stock: true },
  });
  if (!producto) throw new ErrorNoEncontrado('Producto');

  const stockAnterior = producto.stock;
  let cantidadEfectiva: number;
  let stockResultante: number;

  switch (entrada.tipo) {
    case 'ENTRADA':
      cantidadEfectiva = entrada.cantidad;
      stockResultante = stockAnterior + cantidadEfectiva;
      break;
    case 'SALIDA':
      cantidadEfectiva = entrada.cantidad;
      stockResultante = stockAnterior - cantidadEfectiva;
      if (stockResultante < 0 && !config.reglas.permitirStockNegativo) {
        throw new ErrorReglaNegocio(
          `Stock insuficiente de "${producto.nombre}". Disponible: ${stockAnterior}, requerido: ${entrada.cantidad}`,
          'STOCK_INSUFICIENTE',
        );
      }
      break;
    case 'AJUSTE':
      // En el ajuste el service recibe la diferencia ya calculada.
      cantidadEfectiva = entrada.cantidad;
      stockResultante = stockAnterior + cantidadEfectiva;
      if (stockResultante < 0 && !config.reglas.permitirStockNegativo) {
        throw new ErrorReglaNegocio(
          `El ajuste dejaría el stock de "${producto.nombre}" en negativo`,
          'STOCK_NEGATIVO',
        );
      }
      break;
    default:
      throw new ErrorReglaNegocio('Tipo de movimiento no válido', 'MOVIMIENTO_INVALIDO');
  }

  const movimiento = await tx.movimientoInventario.create({
    data: {
      productoId: entrada.productoId,
      usuarioId: entrada.usuarioId,
      tipo: entrada.tipo,
      cantidad: entrada.cantidad,
      stockAnterior,
      stockResultante,
      pedidoId: entrada.pedidoId ?? null,
      ventaId: entrada.ventaId ?? null,
      movimientoBidonId: entrada.movimientoBidonId ?? null,
      origen: entrada.origen,
      observaciones: entrada.observaciones ?? null,
    },
  });

  // Update condicional: si otra transacción movió el stock entre la lectura y
  // la escritura, el where no se cumple y se aborta con conflicto explícito.
  const actualizado = await tx.producto.updateMany({
    where: { id: entrada.productoId, stock: stockAnterior },
    data: { stock: stockResultante },
  });
  if (actualizado.count === 0) {
    throw new ErrorConflicto(
      'El stock del producto cambió mientras se realizaba la operación. Intente nuevamente.',
      'STOCK_CONCURRENTE',
    );
  }

  await registrarHistorial(
    {
      tipo: TipoRegistroHistorial.INVENTARIO,
      entidadId: movimiento.id,
      codigo: producto.nombre.slice(0, 20),
      estadoAnterior: String(stockAnterior),
      estadoNuevo: String(stockResultante),
      accion: AccionHistorial.INVENTARIO_MOVIMIENTO,
      descripcion: `Movimiento de inventario ${entrada.tipo} de ${entrada.cantidad} unidad(es) en ${producto.nombre}`,
      observaciones: entrada.observaciones ?? null,
      usuarioId: entrada.usuarioId,
    },
    tx,
  );

  return { id: movimiento.id, stockAnterior, stockResultante };
};

/**
 * Entrada de stock desde el punto de vista del usuario (compra, producción,
 * devolución de mercadería). Única acción de inventario accessible desde la
 * interfaz de forma manual, además del ajuste.
 */
export const registrarMovimientoManual = async (
  entrada: MovimientoInventarioInput,
  usuarioId: number,
) => {
  return prisma.$transaction(async (tx) => {
    if (entrada.tipo === 'AJUSTE') {
      const producto = await tx.producto.findUnique({
        where: { id: entrada.productoId },
        select: { stock: true },
      });
      if (!producto) throw new ErrorNoEncontrado('Producto');
      const diferencia = entrada.stockFinal - producto.stock;
      if (diferencia === 0) {
        throw new ErrorReglaNegocio('El stock indicado es igual al stock actual', 'AJUSTE_SIN_CAMBIO');
      }
      return aplicarMovimientoInventario(
        {
          productoId: entrada.productoId,
          tipo: 'AJUSTE',
          cantidad: diferencia,
          usuarioId,
          origen: 'AJUSTE MANUAL',
          observaciones: entrada.observaciones,
        },
        tx,
      );
    }
    return aplicarMovimientoInventario(
      {
        productoId: entrada.productoId,
        tipo: entrada.tipo,
        cantidad: entrada.cantidad,
        usuarioId,
        origen: entrada.origen,
        observaciones: entrada.observaciones,
      },
      tx,
    );
  });
};

export const listarMovimientosInventario = async (
  filtros: z.infer<typeof listarMovimientosInventarioSchema>,
) => {
  const where: Prisma.MovimientoInventarioWhereInput = {
    ...(filtros.productoId ? { productoId: filtros.productoId } : {}),
    ...(filtros.tipo !== 'todos' ? { tipo: filtros.tipo as TipoMovimientoInventario } : {}),
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
    prisma.movimientoInventario.count({ where }),
    prisma.movimientoInventario.findMany({
      where,
      orderBy: filtros.ordenarPor === 'stock' ? { stockResultante: filtros.orden } : { id: filtros.orden },
      skip: (filtros.pagina - 1) * filtros.limite,
      take: filtros.limite,
      include: {
        producto: { select: { id: true, nombre: true, unidadMedida: true } },
        usuario: { select: { id: true, nombreCompleto: true } },
        venta: { select: { id: true, numero: true } },
        pedido: { select: { id: true, codigo: true } },
      },
    }),
  ]);

  return construirPaginacion(datos, total, filtros.pagina, filtros.limite);
};

/**
 * Estado actual del inventario: stock, stock mínimo y alerta de reposición.
 * Es la fuente del módulo de inventario del frontend.
 */
export const obtenerInventario = async () => {
  const productos = await prisma.producto.findMany({
    where: { eliminadoEn: null },
    orderBy: { nombre: 'asc' },
    select: {
      id: true,
      codigo: true,
      nombre: true,
      unidadMedida: true,
      stock: true,
      stockMinimo: true,
      esRetornable: true,
      precioVenta: true,
      costoUnitario: true,
      activo: true,
      _count: { select: { movimientosInventario: true } },
    },
  });

  return productos.map((p) => ({
    ...p,
    valorInventarioCosto: Number(p.costoUnitario ?? 0) * p.stock,
    stockBajo: p.stock <= p.stockMinimo,
    nivelStock: p.stock === 0 ? 'AGOTADO' : p.stock <= p.stockMinimo ? 'BAJO' : 'NORMAL',
  }));
};

/** Valorización del inventario y alertas, para el dashboard. */
export const resumenInventario = async () => {
  const productos = await obtenerInventario();
  const enAlerta = productos.filter((p) => p.stockBajo);
  return {
    totalProductos: productos.length,
    productosAgotados: productos.filter((p) => p.stock === 0).length,
    productosStockBajo: enAlerta.length,
    valorTotalCosto: enAlerta.reduce((a, p) => a + p.valorInventarioCosto, 0),
    alertas: enAlerta.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      stock: p.stock,
      stockMinimo: p.stockMinimo,
    })),
  };
};

export const obtenerMovimiento = async (id: number) => {
  const movimiento = await prisma.movimientoInventario.findUnique({
    where: { id },
    include: {
      producto: { select: { id: true, nombre: true, unidadMedida: true } },
      usuario: { select: { id: true, nombreCompleto: true } },
    },
  });
  if (!movimiento) throw new ErrorNoEncontrado('Movimiento de inventario');
  return movimiento;
};
