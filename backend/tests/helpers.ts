/**
 * Utilidades compartidas por la suite de pruebas.
 *
 * Concentra lo que todas las suites repiten: levantar la aplicación, iniciar
 * sesión con cada rol, limpiar el estado operativo entre pruebas y crear
 * datos de fábrica. Al vivir en un solo lugar, un cambio de contrato de la
 * API se corrige en un único punto.
 */
import type { Application } from 'express';
import request from 'supertest';
import { crearApp } from '../src/app';
import { prisma } from '../src/config/prisma';

export const app: Application = crearApp();

export const PASSWORD = 'Agua2026*';

export const CREDENCIALES = {
  admin: { email: 'admin@aguarespura.pe', password: PASSWORD },
  vendedor: { email: 'vendedor@aguarespura.pe', password: PASSWORD },
  repartidor: { email: 'repartidor@aguarespura.pe', password: PASSWORD },
} as const;

export type Rol = keyof typeof CREDENCIALES;

/** Copia simple de las credenciales, apta para enviarse como cuerpo JSON. */
export const credenciales = (rol: Rol) => ({
  email: CREDENCIALES[rol].email,
  password: CREDENCIALES[rol].password,
});

/** Inicia sesión y devuelve el token de acceso. */
export const iniciarSesion = async (rol: Rol): Promise<string> => {
  const respuesta = await request(app)
    .post('/api/auth/login')
    .send(credenciales(rol))
    .expect(200);
  return respuesta.body.datos.tokenAcceso as string;
};

export const cabecera = (token: string) => ({ Authorization: `Bearer ${token}` });

/**
 * Elimina los datos operativos para que cada prueba empiece desde el mismo
 * punto. Se respeta el orden de claves foráneas: primero los hijos, después
 * los padres. El catálogo y los usuarios del seed sobreviven, pero la línea
 * base del pretest no: la escribe el investigador y una prueba no debe
 * heredarla de la anterior.
 *
 * Después de borrar, el stock de cada producto se recalcula a partir del
 * último movimiento que quede. Sin este paso, una prueba que agote el
 * inventario dejaría `producto.stock` desfasado y contaminaría las
 * siguientes: el campo es un caché del último movimiento, no la fuente.
 */
export const limpiarOperativo = async (): Promise<void> => {
  await prisma.$transaction([
    prisma.movimientoBidon.deleteMany(),
    prisma.pago.deleteMany(),
    prisma.entrega.deleteMany(),
    prisma.detalleVenta.deleteMany(),
    prisma.venta.deleteMany(),
    prisma.detallePedido.deleteMany(),
    prisma.pedido.deleteMany(),
    prisma.historialEstado.deleteMany(),
    prisma.bitacoraHttp.deleteMany(),
    prisma.logConsulta.deleteMany(),
    prisma.lineaBasePretest.deleteMany(),
  ]);

  // Los movimientos de inventario se conservan: son el historial real del
  // stock. Solo se descarta lo que generó una operación de prueba.
  await prisma.movimientoInventario.deleteMany({
    where: { origen: { notIn: ['CARGA INICIAL', 'COMPRA', 'INVENTARIO FISICO'] } },
  });

  const productos = await prisma.producto.findMany({
    select: { id: true, stock: true },
  });

  for (const producto of productos) {
    const ultimo = await prisma.movimientoInventario.findFirst({
      where: { productoId: producto.id },
      orderBy: { id: 'desc' },
      select: { stockResultante: true },
    });
    const stockReal = ultimo?.stockResultante ?? 0;
    if (stockReal !== producto.stock) {
      await prisma.producto.update({
        where: { id: producto.id },
        data: { stock: stockReal },
      });
    }
  }
};

/**
 * Limpia el contador de intentos fallidos. Sin esto, una prueba que simula
 * contraseñas incorrectas dejaría la cuenta bloqueada y rompería las pruebas
 * que vienen después.
 */
export const desbloquearCuentas = async (): Promise<void> => {
  await prisma.usuario.updateMany({
    data: { intentosFallidos: 0, bloqueadoHasta: null },
  });
};

/** Devuelve el stock actual del producto indicado. */
export const stockDe = async (codigo: string): Promise<number> => {
  const producto = await prisma.producto.findUniqueOrThrow({
    where: { codigo },
    select: { stock: true },
  });
  return producto.stock;
};

/** Id del producto por su código de negocio. */
export const idProducto = async (codigo: string): Promise<number> => {
  const producto = await prisma.producto.findUniqueOrThrow({
    where: { codigo },
    select: { id: true },
  });
  return producto.id;
};

/**
 * Primer cliente sembrado, que sirve de destino de los pedidos.
 *
 * El `orderBy` no es decorativo: `findFirst` sin ordenamiento devuelve la
 * primera fila según el plan de ejecución de InnoDB, que puede cambiar entre
 * ejecuciones. Sin esto, el pedido y la verificación posterior podían acabar
 * en clientes distintos y la prueba fallaba de forma intermitente.
 */
export const primerClienteId = async (): Promise<number> => {
  const cliente = await prisma.cliente.findFirstOrThrow({
    orderBy: { id: 'asc' },
    select: { id: true },
  });
  return cliente.id;
};

/** Primer repartidor sembrado, de forma determinista. */
export const primerRepartidorId = async (): Promise<number> => {
  const repartidor = await prisma.repartidor.findFirstOrThrow({
    orderBy: { id: 'asc' },
    select: { id: true },
  });
  return repartidor.id;
};

/** El id del repartidor enlazado al usuario de rol REPARTIDOR. */
export const repartidorDelUsuarioId = async (): Promise<number> => {
  const usuario = await prisma.usuario.findUniqueOrThrow({
    where: { email: CREDENCIALES.repartidor.email },
    select: { repartidor: { select: { id: true } } },
  });
  if (!usuario.repartidor) throw new Error('El usuario repartidor no está enlazado a su ficha');
  return usuario.repartidor.id;
};

/**
 * Una ficha de repartidor distinta de la del usuario de prueba.
 *
 * El seed enlaza cada repartidor con su propio usuario, así que "el primer
 * repartidor" puede ser o no la ficha del usuario `repartidor`. Para probar el
 * aislamiento hace falta alguien que no sea esa persona, y eso no debe depender
 * del orden con que el seed creó las fichas.
 */
export const otroRepartidorId = async (): Promise<number> => {
  const propio = await repartidorDelUsuarioId();
  const repartidor = await prisma.repartidor.findFirstOrThrow({
    where: { id: { not: propio } },
    orderBy: { id: 'asc' },
    select: { id: true },
  });
  return repartidor.id;
};

/** Crea un pedido válido y devuelve su id. */
export const crearPedidoDePrueba = async (
  token: string,
  opciones: { cantidad?: number; confirmar?: boolean; minutosAtras?: number } = {},
): Promise<number> => {
  const { cantidad = 5, confirmar = true, minutosAtras = 3 } = opciones;
  const idBidon = await idProducto('BID20');
  const clienteId = await primerClienteId();
  const recibidoEn = new Date(Date.now() - minutosAtras * 60_000);

  const respuesta = await request(app)
    .post('/api/pedidos')
    .set(cabecera(token))
    .send({
      clienteId,
      recibidoEn: recibidoEn.toISOString(),
      canal: 'WHATSAPP',
      modalidadEntrega: 'DOMICILIO',
      direccionEntrega: 'Jr. Bolognesi 120, Iberia',
      detalles: [{ productoId: idBidon, cantidad }],
      confirmar,
    })
    .expect(201);

  return respuesta.body.datos.id as number;
};

/**
 * Cierra la conexión de Prisma al terminar la suite del worker. Se llama desde
 * el `afterAll` de cada archivo.
 */
export const cerrarPrisma = async (): Promise<void> => {
  await prisma.$disconnect();
};
