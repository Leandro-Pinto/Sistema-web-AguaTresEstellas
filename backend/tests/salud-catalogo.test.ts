/**
 * Pruebas de salud del sistema y del catálogo.
 *
 * La salud pública sirve a un monitor sin credenciales y comprueba que la base
 * responda con un `SELECT 1`: si no responde, el endpoint devuelve 503 en vez
 * de 200. La salud completa sí expone recuentos y por eso exige sesión de
 * administrador: es la diferencia entre un endpoint de disponibilidad y uno
 * que filtra información.
 *
 * La pública declara además el entorno y el nombre de la base: el frontend usa
 * el entorno para rotular "DATOS DE DEMOSTRACION", y una cinta que se pudiera
 * desactivar sin dejar rastro no valdría como garantía.
 */
import request from 'supertest';
import {
  app,
  cabecera,
  cerrarPrisma,
  idProducto,
  iniciarSesion,
  limpiarOperativo,
  stockDe,
} from './helpers';
import { prisma } from '../src/config/prisma';

afterAll(cerrarPrisma);

describe('GET /salud', () => {
  it('responde sin credenciales y comprueba que la base responda', async () => {
    const respuesta = await request(app).get('/salud').expect(200);

    expect(respuesta.body.exito).toBe(true);
    expect(respuesta.body.datos).toMatchObject({
      estado: 'OK',
      version: expect.any(String),
      entorno: 'test',
      baseDeDatos: expect.stringMatching(/_test$/),
      horaServidor: expect.any(String),
    });
    // Solo el nombre de la base, nunca credenciales ni estado interno.
    expect(typeof respuesta.body.datos.baseDeDatos).toBe('string');
    expect(typeof respuesta.body.datos.latenciaBaseMs).toBe('number');
  });

  it('devuelve 503 cuando el proceso vive pero la base no responde', async () => {
    const consulta = jest
      .spyOn(prisma, '$queryRaw')
      .mockRejectedValueOnce(new Error('sin conexión con MariaDB'));

    const respuesta = await request(app).get('/salud').expect(503);

    expect(respuesta.body).toMatchObject({
      exito: false,
      codigo: 'BASE_NO_DISPONIBLE',
      mensaje: expect.stringContaining('base de datos'),
      datos: {
        estado: 'SIN_BASE',
        // El entorno sigue viajando: sin él la cinta de demostración no se
        // puede mostrar, y el fallo de la base no la desactiva.
        entorno: 'test',
        baseDeDatos: expect.stringMatching(/_test$/),
      },
    });

    consulta.mockRestore();
  });
});

describe('GET /salud/completa', () => {
  it('exige sesión', async () => {
    const respuesta = await request(app).get('/salud/completa').expect(401);
    expect(respuesta.body.codigo).toBe('NO_AUTENTICADO');
  });

  it('rechaza a quien no es administrador', async () => {
    const token = await iniciarSesion('vendedor');
    const respuesta = await request(app)
      .get('/salud/completa')
      .set(cabecera(token))
      .expect(403);
    expect(respuesta.body.codigo).toBe('SIN_PERMISOS');
  });

  it('devuelve el diagnóstico completo al administrador', async () => {
    const token = await iniciarSesion('admin');
    const respuesta = await request(app)
      .get('/salud/completa')
      .set(cabecera(token))
      .expect(200);

    const datos = respuesta.body.datos;
    expect(datos.estado).toBe('OK');
    expect(datos.entorno).toBe('test');
    expect(datos.baseDeDatos).toMatchObject({
      conectado: true,
      nombre: expect.stringMatching(/_test$/),
      servidor: 'MariaDB/MySQL',
    });
    expect(typeof datos.baseDeDatos.latenciaMs).toBe('number');
    expect(datos.registros).toEqual(
      expect.objectContaining({
        pedidos: expect.any(Number),
        ventas: expect.any(Number),
      }),
    );
    expect(datos.memoria.rssMb).toBeGreaterThan(0);
  });
});

describe('Catálogo de productos', () => {
  beforeEach(limpiarOperativo);

  it('lista el catálogo sembrado con su stock', async () => {
    const token = await iniciarSesion('vendedor');
    const respuesta = await request(app)
      .get('/api/productos/activos')
      .set(cabecera(token))
      .expect(200);

    const codigos = respuesta.body.datos.map((p: { codigo: string }) => p.codigo);
    expect(codigos).toEqual(expect.arrayContaining(['BID20', 'PRE15', 'PRE35']));
  });

  it('el inventario distingue el nivel de stock y alerta de reposición', async () => {
    const token = await iniciarSesion('vendedor');
    const respuesta = await request(app)
      .get('/api/productos/inventario')
      .set(cabecera(token))
      .expect(200);

    for (const producto of respuesta.body.datos) {
      expect(producto).toEqual(
        expect.objectContaining({
          codigo: expect.any(String),
          stock: expect.any(Number),
          stockMinimo: expect.any(Number),
          nivelStock: expect.stringMatching(/^(NORMAL|BAJO|AGOTADO)$/),
        }),
      );
    }
  });

  it('el administrador puede registrar una entrada de inventario', async () => {
    const token = await iniciarSesion('admin');
    const antes = await stockDe('BID20');
    const bidon = await idProducto('BID20');

    await request(app)
      .post('/api/productos/inventario/movimientos')
      .set(cabecera(token))
      .send({ productoId: bidon, tipo: 'ENTRADA', cantidad: 25, origen: 'COMPRA' })
      .expect(201);

    expect(await stockDe('BID20')).toBe(antes + 25);
  });

  it('rechaza una entrada de cantidad negativa', async () => {
    const token = await iniciarSesion('admin');
    const bidon = await idProducto('BID20');

    const respuesta = await request(app)
      .post('/api/productos/inventario/movimientos')
      .set(cabecera(token))
      .send({ productoId: bidon, tipo: 'ENTRADA', cantidad: -5, origen: 'COMPRA' })
      .expect(422);
    expect(respuesta.body.codigo).toBe('VALIDACION');
  });
});
