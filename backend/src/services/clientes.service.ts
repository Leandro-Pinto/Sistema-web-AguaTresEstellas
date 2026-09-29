import { Prisma, AccionHistorial, TipoRegistroHistorial, TipoCliente } from '@prisma/client';
import { prisma } from '../config/prisma';
import { ErrorConflicto, ErrorNoEncontrado, ErrorReglaNegocio } from '../utils/errors';
import { construirPaginacion } from '../utils/paginacion';
import { registrarHistorial } from './historial.service';
import { calcularSaldoBidones } from './bidones.service';
import type {
  ActualizarClienteInput,
  CrearClienteInput,
  ListarClientesQuery,
} from '../validators/clientes.validator';

const SELECT_CLIENTE = {
  id: true,
  tipo: true,
  documento: true,
  nombres: true,
  razonSocial: true,
  nombre: true,
  telefono: true,
  telefonoAlt: true,
  email: true,
  direccion: true,
  referencia: true,
  distrito: true,
  limiteCredito: true,
  notas: true,
  activo: true,
  fechaRegistro: true,
  creadoEn: true,
  eliminadoEn: true,
} satisfies Prisma.ClienteSelect;

/**
 * Nombre mostrable del cliente.
 * Las personas se muestran por nombre; las empresas e instituciones por
 * razón social. Evita tener un campo ambiguo en toda la base.
 */
const construirNombre = (tipo: TipoCliente, nombres?: string | null, razonSocial?: string | null) => {
  if (tipo === 'PERSONA') return (nombres ?? '').replace(/\s+/g, ' ').trim();
  return (razonSocial ?? '').replace(/\s+/g, ' ').trim();
};

/**
 * Alta de clientes.
 *
 * Regla de negocio: no se admiten duplicados. La clave de unicidad es
 * (tipo, documento) y además se revisa el teléfono, porque en el proceso
 * manual la misma persona solía anotarse varias veces con el mismo número.
 */
export const crearCliente = async (entrada: CrearClienteInput, usuarioId: number) => {
  const documento = entrada.documento.toUpperCase();

  const duplicado = await prisma.cliente.findUnique({
    where: { tipo_documento: { tipo: entrada.tipo, documento } },
    select: { id: true, nombre: true, activo: true, eliminadoEn: true },
  });
  if (duplicado && !duplicado.eliminadoEn) {
    throw new ErrorConflicto(
      `Ya existe un cliente registrado con el documento ${documento}: ${duplicado.nombre}`,
      'CLIENTE_DUPLICADO',
    );
  }

  const porTelefono = await prisma.cliente.findFirst({
    where: { telefono: entrada.telefono, eliminadoEn: null },
    select: { id: true, nombre: true, documento: true },
  });

  const nombre = construirNombre(entrada.tipo, entrada.nombres, entrada.razonSocial);

  return prisma.$transaction(async (tx) => {
    const cliente = await tx.cliente.create({
      data: {
        tipo: entrada.tipo,
        documento,
        nombres: entrada.nombres ?? null,
        razonSocial: entrada.razonSocial ?? null,
        nombre,
        telefono: entrada.telefono,
        telefonoAlt: entrada.telefonoAlt ?? null,
        email: entrada.email ?? null,
        direccion: entrada.direccion,
        referencia: entrada.referencia ?? null,
        distrito: entrada.distrito ?? null,
        limiteCredito: entrada.limiteCredito,
        notas: entrada.notas ?? null,
        activo: entrada.activo,
      },
      select: SELECT_CLIENTE,
    });

    await registrarHistorial(
      {
        tipo: TipoRegistroHistorial.CLIENTE,
        entidadId: cliente.id,
        codigo: cliente.documento,
        estadoNuevo: cliente.activo ? 'ACTIVO' : 'INACTIVO',
        accion: AccionHistorial.CREADO,
        descripcion: `Cliente registrado: ${cliente.nombre}`,
        observaciones: porTelefono
          ? `Existe otro cliente con el mismo teléfono: ${porTelefono.nombre} (${porTelefono.documento})`
          : null,
        usuarioId,
      },
      tx,
    );

    return cliente;
  });
};

export const listarClientes = async (filtros: ListarClientesQuery) => {
  const where: Prisma.ClienteWhereInput = {
    ...(filtros.incluirEliminados === 'true' ? {} : { eliminadoEn: null }),
    ...(filtros.activo !== 'todos' ? { activo: filtros.activo === 'true' } : {}),
    ...(filtros.tipo !== 'todos' ? { tipo: filtros.tipo as TipoCliente } : {}),
    ...(filtros.distrito ? { distrito: filtros.distrito } : {}),
    ...(filtros.busqueda
      ? {
          OR: [
            { nombre: { contains: filtros.busqueda } },
            { documento: { contains: filtros.busqueda } },
            { telefono: { contains: filtros.busqueda } },
            { razonSocial: { contains: filtros.busqueda } },
          ],
        }
      : {}),
  };

  if (filtros.soloConSaldo === 'true') {
    // El saldo se calcula con agregación SQL sobre los movimientos:
    // no existe una columna "saldo" que pueda desincronizarse.
    const saldos = await prisma.$queryRaw<{ clienteId: number; saldo: number }[]>`
      SELECT clienteId,
             SUM(CASE
                   WHEN tipo IN ('ENTREGA','AJUSTE') THEN cantidad
                   ELSE -cantidad
                 END) AS saldo
      FROM movimientos_bidones
      WHERE clienteId IS NOT NULL
      GROUP BY clienteId
      HAVING saldo > 0
    `;
    const ids = saldos.map((s) => s.clienteId);
    if (ids.length === 0) {
      return construirPaginacion<Prisma.ClienteGetPayload<{ select: typeof SELECT_CLIENTE }>>(
        [],
        0,
        filtros.pagina,
        filtros.limite,
      );
    }
    where.id = { in: ids };
  }

  const campoOrden = filtros.ordenarPor ?? 'nombre';
  const orderBy: Prisma.ClienteOrderByWithRelationInput =
    campoOrden === 'fechaRegistro' ? { fechaRegistro: filtros.orden } : { nombre: filtros.orden };

  const [total, datos] = await prisma.$transaction([
    prisma.cliente.count({ where }),
    prisma.cliente.findMany({
      where,
      orderBy,
      skip: (filtros.pagina - 1) * filtros.limite,
      take: filtros.limite,
      select: SELECT_CLIENTE,
    }),
  ]);

  return construirPaginacion(datos, total, filtros.pagina, filtros.limite);
};

export const obtenerCliente = async (id: number) => {
  const cliente = await prisma.cliente.findUnique({ where: { id }, select: SELECT_CLIENTE });
  if (!cliente) throw new ErrorNoEncontrado('Cliente');
  return cliente;
};

/**
 * Ficha completa del cliente: datos, saldo de bidones, deuda de ventas,
 * últimos pedidos y actividad. Es la fuente principal de información
 * para el módulo de pedidos: al elegir un cliente se recuperan sus datos
 * sin volver a escribirlos.
 */
export const obtenerFichaCliente = async (id: number) => {
  const cliente = await prisma.cliente.findUnique({
    where: { id },
    select: {
      ...SELECT_CLIENTE,
      _count: { select: { pedidos: true, ventas: true } },
    },
  });
  if (!cliente) throw new ErrorNoEncontrado('Cliente');

  const [saldoBidones, deuda, ultimosPedidos] = await Promise.all([
    calcularSaldoBidones(id),
    prisma.venta.aggregate({
      where: { clienteId: id, estado: { in: ['PENDIENTE', 'COMPLETADA'] } },
      _sum: { saldo: true },
      _count: true,
    }),
    prisma.pedido.findMany({
      where: { clienteId: id },
      orderBy: { id: 'desc' },
      take: 10,
      select: {
        id: true,
        codigo: true,
        estado: true,
        total: true,
        registradoEn: true,
        entregadoEn: true,
        canal: true,
        venta: { select: { id: true, numero: true, totalPagado: true, saldo: true } },
      },
    }),
  ]);

  return {
    ...cliente,
    saldoBidones,
    deudaTotal: Number(deuda._sum.saldo ?? 0),
    ventasRegistradas: deuda._count,
    ultimosPedidos,
  };
};

/**
 * Búsqueda ligera para autocompletado al registrar un pedido.
 * Se limita deliberadamente a 10 resultados porque el objetivo es
 * elegir un cliente, no listar el padrón completo.
 */
export const buscarClientesRapido = async (termino: string, limite = 10) => {
  if (!termino || termino.trim().length < 2) return [];
  return prisma.cliente.findMany({
    where: {
      eliminadoEn: null,
      activo: true,
      OR: [
        { nombre: { contains: termino } },
        { documento: { contains: termino } },
        { telefono: { contains: termino.replace(/\s+/g, '') } },
      ],
    },
    take: limite,
    orderBy: { nombre: 'asc' },
    select: {
      id: true,
      tipo: true,
      documento: true,
      nombre: true,
      telefono: true,
      direccion: true,
      referencia: true,
    },
  });
};

export const actualizarCliente = async (
  id: number,
  entrada: ActualizarClienteInput,
  usuarioId: number,
) => {
  const actual = await prisma.cliente.findUnique({ where: { id }, select: SELECT_CLIENTE });
  if (!actual) throw new ErrorNoEncontrado('Cliente');

  if (entrada.activo === false) {
    const pedidosAbiertos = await prisma.pedido.count({
      where: { clienteId: id, estado: { in: ['PENDIENTE', 'CONFIRMADO', 'ASIGNADO', 'EN_RUTA'] } },
    });
    if (pedidosAbiertos > 0) {
      throw new ErrorReglaNegocio(
        `El cliente tiene ${pedidosAbiertos} pedido(s) en proceso. Debe cerrarlos antes de desactivarlo.`,
        'CLIENTE_CON_PEDIDOS_ACTIVOS',
      );
    }
  }

  if (entrada.tipo || entrada.documento) {
    const tipo = entrada.tipo ?? actual.tipo;
    const documento = (entrada.documento ?? actual.documento).toUpperCase();
    const dup = await prisma.cliente.findUnique({
      where: { tipo_documento: { tipo, documento } },
      select: { id: true },
    });
    if (dup && dup.id !== id) {
      throw new ErrorConflicto(`Ya existe otro cliente con el documento ${documento}`, 'CLIENTE_DUPLICADO');
    }
    entrada = { ...entrada, tipo, documento };
  }

  const tipo = entrada.tipo ?? actual.tipo;
  const nombre = construirNombre(
    tipo,
    entrada.nombres !== undefined ? entrada.nombres : actual.nombres,
    entrada.razonSocial !== undefined ? entrada.razonSocial : actual.razonSocial,
  );

  return prisma.$transaction(async (tx) => {
    const cliente = await tx.cliente.update({
      where: { id },
      data: {
        ...(entrada.tipo !== undefined ? { tipo: entrada.tipo } : {}),
        ...(entrada.documento !== undefined ? { documento: entrada.documento } : {}),
        ...(entrada.nombres !== undefined ? { nombres: entrada.nombres } : {}),
        ...(entrada.razonSocial !== undefined ? { razonSocial: entrada.razonSocial } : {}),
        ...(entrada.telefono !== undefined ? { telefono: entrada.telefono } : {}),
        ...(entrada.telefonoAlt !== undefined ? { telefonoAlt: entrada.telefonoAlt } : {}),
        ...(entrada.email !== undefined ? { email: entrada.email } : {}),
        ...(entrada.direccion !== undefined ? { direccion: entrada.direccion } : {}),
        ...(entrada.referencia !== undefined ? { referencia: entrada.referencia } : {}),
        ...(entrada.distrito !== undefined ? { distrito: entrada.distrito } : {}),
        ...(entrada.limiteCredito !== undefined ? { limiteCredito: entrada.limiteCredito } : {}),
        ...(entrada.notas !== undefined ? { notas: entrada.notas } : {}),
        ...(entrada.activo !== undefined ? { activo: entrada.activo } : {}),
        nombre,
      },
      select: SELECT_CLIENTE,
    });

    await registrarHistorial(
      {
        tipo: TipoRegistroHistorial.CLIENTE,
        entidadId: id,
        codigo: cliente.documento,
        estadoAnterior: actual.activo ? 'ACTIVO' : 'INACTIVO',
        estadoNuevo: cliente.activo ? 'ACTIVO' : 'INACTIVO',
        accion: AccionHistorial.ACTUALIZADO,
        descripcion: `Datos del cliente actualizados: ${cliente.nombre}`,
        usuarioId,
      },
      tx,
    );

    return cliente;
  });
};

export const cambiarEstadoCliente = async (id: number, activo: boolean, usuarioId: number) => {
  return actualizarCliente(id, { activo }, usuarioId);
};

/** Baja lógica: el historial y los pedidos asociados nunca se pierden. */
export const eliminarCliente = async (id: number, usuarioId: number) => {
  const cliente = await prisma.cliente.findUnique({ where: { id }, select: SELECT_CLIENTE });
  if (!cliente) throw new ErrorNoEncontrado('Cliente');

  const pedidos = await prisma.pedido.count({ where: { clienteId: id } });
  if (pedidos > 0) {
    throw new ErrorReglaNegocio(
      `El cliente tiene ${pedidos} pedido(s) registrado(s). No puede eliminarse; desactívelo para retirarlo de los listados.`,
      'CLIENTE_CON_PEDIDOS',
    );
  }

  const actualizado = await prisma.cliente.update({
    where: { id },
    data: { eliminadoEn: new Date(), activo: false },
    select: SELECT_CLIENTE,
  });

  await registrarHistorial({
    tipo: TipoRegistroHistorial.CLIENTE,
    entidadId: id,
    codigo: cliente.documento,
    estadoAnterior: 'ACTIVO',
    estadoNuevo: 'ELIMINADO',
    accion: AccionHistorial.ELIMINADO,
    descripcion: `Cliente eliminado (baja lógica): ${cliente.nombre}`,
    usuarioId,
  });

  return actualizado;
};

export const restaurarCliente = async (id: number, usuarioId: number) => {
  const cliente = await prisma.cliente.findUnique({ where: { id } });
  if (!cliente) throw new ErrorNoEncontrado('Cliente');

  const documento = cliente.documento;
  // La unicidad es (tipo, documento): un DNI de persona y una RUC de empresa
  // pueden coincidir en cifras sin ser el mismo cliente.
  const dup = await prisma.cliente.findFirst({
    where: { tipo: cliente.tipo, documento, id: { not: id }, eliminadoEn: null },
    select: { id: true },
  });
  if (dup) {
    throw new ErrorConflicto(
      'Existe otro cliente activo con el mismo documento. Resuelva ese registro antes de restaurar.',
      'CLIENTE_DUPLICADO',
    );
  }

  const actualizado = await prisma.cliente.update({
    where: { id },
    data: { eliminadoEn: null, activo: true },
    select: SELECT_CLIENTE,
  });

  await registrarHistorial({
    tipo: TipoRegistroHistorial.CLIENTE,
    entidadId: id,
    codigo: cliente.documento,
    estadoAnterior: 'ELIMINADO',
    estadoNuevo: 'ACTIVO',
    accion: AccionHistorial.RESTAURADO,
    descripcion: `Cliente restaurado: ${cliente.nombre}`,
    usuarioId,
  });

  return actualizado;
};

/** Distritos existentes, para el filtro del listado. */
export const listarDistritos = async (): Promise<string[]> => {
  const resultados = await prisma.cliente.groupBy({
    by: ['distrito'],
    where: { eliminadoEn: null, distrito: { not: null } },
  });
  return resultados
    .map((r) => r.distrito)
    .filter((d): d is string => d !== null)
    .sort();
};
