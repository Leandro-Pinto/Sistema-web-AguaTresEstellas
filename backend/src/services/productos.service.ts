import { Prisma, AccionHistorial, TipoRegistroHistorial } from '@prisma/client';
import { prisma } from '../config/prisma';
import { ErrorConflicto, ErrorNoEncontrado, ErrorReglaNegocio } from '../utils/errors';
import { construirPaginacion } from '../utils/paginacion';
import { registrarHistorial } from './historial.service';
import { aplicarMovimientoInventario } from './inventario.service';
import {
  listarProductosSchema,
  type ActualizarProductoInput,
  type CrearProductoInput,
} from '../validators/productosInventario.validator';
import type { z } from 'zod';

const SELECT_PRODUCTO = {
  id: true,
  codigo: true,
  nombre: true,
  descripcion: true,
  unidadMedida: true,
  precioVenta: true,
  costoUnitario: true,
  stock: true,
  stockMinimo: true,
  esRetornable: true,
  activo: true,
  creadoEn: true,
  eliminadoEn: true,
} satisfies Prisma.ProductoSelect;

export const crearProducto = async (entrada: CrearProductoInput, usuarioId: number) => {
  const codigo = entrada.codigo.toUpperCase();
  const existente = await prisma.producto.findUnique({ where: { codigo } });
  if (existente) throw new ErrorConflicto(`Ya existe un producto con el código ${codigo}`, 'PRODUCTO_DUPLICADO');

  return prisma.$transaction(async (tx) => {
    const producto = await tx.producto.create({
      data: {
        codigo,
        nombre: entrada.nombre,
        descripcion: entrada.descripcion ?? null,
        unidadMedida: entrada.unidadMedida ?? 'UNIDAD',
        precioVenta: entrada.precioVenta,
        costoUnitario: entrada.costoUnitario ?? null,
        stock: 0,
        stockMinimo: entrada.stockMinimo,
        esRetornable: entrada.esRetornable,
        activo: entrada.activo,
      },
      select: SELECT_PRODUCTO,
    });

    // El stock inicial se registra como movimiento ENTRADA, nunca como
    // una escritura directa: el inventario siempre nace trazable.
    if (entrada.stockInicial > 0) {
      await aplicarMovimientoInventario(
        {
          productoId: producto.id,
          tipo: 'ENTRADA',
          cantidad: entrada.stockInicial,
          usuarioId,
          origen: 'STOCK INICIAL',
          observaciones: 'Stock inicial al registrar el producto',
        },
        tx,
      );
    }

    const actualizado = await tx.producto.findUniqueOrThrow({
      where: { id: producto.id },
      select: SELECT_PRODUCTO,
    });

    await registrarHistorial(
      {
        tipo: TipoRegistroHistorial.PRODUCTO,
        entidadId: producto.id,
        codigo: producto.codigo,
        estadoNuevo: producto.activo ? 'ACTIVO' : 'INACTIVO',
        accion: AccionHistorial.CREADO,
        descripcion: `Producto registrado: ${producto.nombre} (stock inicial ${entrada.stockInicial})`,
        usuarioId,
      },
      tx,
    );

    return actualizado;
  });
};

export const listarProductos = async (filtros: z.infer<typeof listarProductosSchema>) => {
  const where: Prisma.ProductoWhereInput = {
    ...(filtros.incluirEliminados === 'true' ? {} : { eliminadoEn: null }),
    ...(filtros.activo !== 'todos' ? { activo: filtros.activo === 'true' } : {}),
    ...(filtros.esRetornable !== 'todos' ? { esRetornable: filtros.esRetornable === 'true' } : {}),
    ...(filtros.busqueda
      ? { OR: [{ nombre: { contains: filtros.busqueda } }, { codigo: { contains: filtros.busqueda } }] }
      : {}),
  };

  // `soloStockBajo` compara stock contra stockMinimo, dos columnas del mismo
  // registro: Prisma no lo expresa en el where, por eso se resuelve con SQL.
  if (filtros.soloStockBajo === 'true') {
    const filas = await prisma.$queryRaw<{ id: number }[]>`
      SELECT id FROM productos
      WHERE eliminadoEn IS NULL AND stock <= stockMinimo
    `;
    if (filas.length === 0) {
      return construirPaginacion<Prisma.ProductoGetPayload<{ select: typeof SELECT_PRODUCTO }>>(
        [],
        0,
        filtros.pagina,
        filtros.limite,
      );
    }
    where.id = { in: filas.map((f) => f.id) };
  }

  const campo = filtros.ordenarPor ?? 'nombre';
  const orderBy: Prisma.ProductoOrderByWithRelationInput =
    campo === 'stock' ? { stock: filtros.orden } : campo === 'precio' ? { precioVenta: filtros.orden } : { nombre: filtros.orden };

  const [total, datos] = await prisma.$transaction([
    prisma.producto.count({ where }),
    prisma.producto.findMany({
      where,
      orderBy,
      skip: (filtros.pagina - 1) * filtros.limite,
      take: filtros.limite,
      select: SELECT_PRODUCTO,
    }),
  ]);

  return construirPaginacion(datos, total, filtros.pagina, filtros.limite);
};

export const obtenerProducto = async (id: number) => {
  const producto = await prisma.producto.findUnique({
    where: { id },
    select: {
      ...SELECT_PRODUCTO,
      movimientosInventario: {
        orderBy: { id: 'desc' },
        take: 10,
        select: {
          id: true,
          tipo: true,
          cantidad: true,
          stockAnterior: true,
          stockResultante: true,
          origen: true,
          fecha: true,
          usuario: { select: { nombreCompleto: true } },
        },
      },
    },
  });
  if (!producto) throw new ErrorNoEncontrado('Producto');
  return producto;
};

/** Listado ligero para los formularios de pedido y venta. */
export const listarProductosActivos = async () =>
  prisma.producto.findMany({
    where: { activo: true, eliminadoEn: null },
    orderBy: { nombre: 'asc' },
    select: {
      id: true,
      codigo: true,
      nombre: true,
      unidadMedida: true,
      precioVenta: true,
      stock: true,
      stockMinimo: true,
      esRetornable: true,
    },
  });

export const actualizarProducto = async (
  id: number,
  entrada: ActualizarProductoInput,
  usuarioId: number,
) => {
  const actual = await prisma.producto.findUnique({ where: { id }, select: SELECT_PRODUCTO });
  if (!actual) throw new ErrorNoEncontrado('Producto');

  if (entrada.codigo && entrada.codigo.toUpperCase() !== actual.codigo) {
    const dup = await prisma.producto.findUnique({ where: { codigo: entrada.codigo.toUpperCase() } });
    if (dup) throw new ErrorConflicto('Ese código ya pertenece a otro producto', 'PRODUCTO_DUPLICADO');
  }

  return prisma.$transaction(async (tx) => {
    const producto = await tx.producto.update({
      where: { id },
      data: {
        ...(entrada.codigo !== undefined ? { codigo: entrada.codigo.toUpperCase() } : {}),
        ...(entrada.nombre !== undefined ? { nombre: entrada.nombre } : {}),
        ...(entrada.descripcion !== undefined ? { descripcion: entrada.descripcion } : {}),
        ...(entrada.unidadMedida !== undefined ? { unidadMedida: entrada.unidadMedida } : {}),
        ...(entrada.precioVenta !== undefined ? { precioVenta: entrada.precioVenta } : {}),
        ...(entrada.costoUnitario !== undefined ? { costoUnitario: entrada.costoUnitario } : {}),
        ...(entrada.stockMinimo !== undefined ? { stockMinimo: entrada.stockMinimo } : {}),
        ...(entrada.esRetornable !== undefined ? { esRetornable: entrada.esRetornable } : {}),
        ...(entrada.activo !== undefined ? { activo: entrada.activo } : {}),
      },
      select: SELECT_PRODUCTO,
    });

    await registrarHistorial(
      {
        tipo: TipoRegistroHistorial.PRODUCTO,
        entidadId: id,
        codigo: producto.codigo,
        estadoAnterior: `${actual.precioVenta}`,
        estadoNuevo: `${producto.precioVenta}`,
        accion: AccionHistorial.ACTUALIZADO,
        descripcion: `Producto actualizado: ${producto.nombre}`,
        observaciones:
          actual.precioVenta.toString() !== producto.precioVenta.toString()
            ? `Precio modificado de S/ ${actual.precioVenta} a S/ ${producto.precioVenta}. Las ventas existentes conservan su precio histórico.`
            : null,
        usuarioId,
      },
      tx,
    );

    return producto;
  });
};

export const cambiarEstadoProducto = async (id: number, activo: boolean, usuarioId: number) =>
  actualizarProducto(id, { activo }, usuarioId);

export const eliminarProducto = async (id: number, usuarioId: number) => {
  const producto = await prisma.producto.findUnique({
    where: { id },
    select: { ...SELECT_PRODUCTO, _count: { select: { detallesPedido: true, detallesVenta: true } } },
  });
  if (!producto) throw new ErrorNoEncontrado('Producto');

  if (producto._count.detallesPedido > 0 || producto._count.detallesVenta > 0) {
    throw new ErrorReglaNegocio(
      'El producto tiene pedidos o ventas registradas. No puede eliminarse; desactívelo para retirarlo de los listados.',
      'PRODUCTO_EN_USO',
    );
  }

  const actualizado = await prisma.producto.update({
    where: { id },
    data: { eliminadoEn: new Date(), activo: false },
    select: SELECT_PRODUCTO,
  });

  await registrarHistorial({
    tipo: TipoRegistroHistorial.PRODUCTO,
    entidadId: id,
    codigo: producto.codigo,
    estadoAnterior: 'ACTIVO',
    estadoNuevo: 'ELIMINADO',
    accion: AccionHistorial.ELIMINADO,
    descripcion: `Producto eliminado (baja lógica): ${producto.nombre}`,
    usuarioId,
  });

  return actualizado;
};

export const restaurarProducto = async (id: number, usuarioId: number) => {
  const producto = await prisma.producto.findUnique({ where: { id } });
  if (!producto) throw new ErrorNoEncontrado('Producto');

  const dup = await prisma.producto.findFirst({
    where: { codigo: producto.codigo, id: { not: id }, eliminadoEn: null },
    select: { id: true },
  });
  if (dup) throw new ErrorConflicto('Ya existe otro producto activo con ese código', 'PRODUCTO_DUPLICADO');

  const actualizado = await prisma.producto.update({
    where: { id },
    data: { eliminadoEn: null, activo: true },
    select: SELECT_PRODUCTO,
  });

  await registrarHistorial({
    tipo: TipoRegistroHistorial.PRODUCTO,
    entidadId: id,
    codigo: producto.codigo,
    estadoNuevo: 'ACTIVO',
    accion: AccionHistorial.RESTAURADO,
    descripcion: `Producto restaurado: ${producto.nombre}`,
    usuarioId,
  });

  return actualizado;
};
