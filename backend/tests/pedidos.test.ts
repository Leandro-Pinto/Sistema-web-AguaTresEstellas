/**
 * Pruebas del ciclo del pedido.
 *
 * Es el módulo que sostiene la medición de la tesis: si el sistema permitiera
 * saltarse etapas, los tiempos de proceso medidos no serían comparables con
 * el pretest. Por eso aquí se prueba sobre todo la tabla de transiciones.
 */
import request from 'supertest';
import {
  app,
  cabecera,
  cerrarPrisma,
  crearPedidoDePrueba,
  idProducto,
  iniciarSesion,
  limpiarOperativo,
  primerClienteId,
} from './helpers';

afterAll(cerrarPrisma);
beforeEach(limpiarOperativo);

describe('POST /api/pedidos', () => {
  it('registra un pedido con código y marcas de tiempo', async () => {
    const token = await iniciarSesion('vendedor');
    const clienteId = await primerClienteId();
    const bidon = await idProducto('BID20');
    const recibidoEn = new Date(Date.now() - 4 * 60_000);

    const respuesta = await request(app)
      .post('/api/pedidos')
      .set(cabecera(token))
      .send({
        clienteId,
        recibidoEn: recibidoEn.toISOString(),
        canal: 'WHATSAPP',
        modalidadEntrega: 'DOMICILIO',
        direccionEntrega: 'Jr. Bolognesi 120, Iberia',
        detalles: [{ productoId: bidon, cantidad: 4 }],
      })
      .expect(201);

    const pedido = respuesta.body.datos;
    expect(pedido.codigo).toEqual(expect.any(String));
    expect(pedido.estado).toBe('PENDIENTE');
    // Los importes viajan como Decimal de Prisma y llegan serializados.
    expect(Number(pedido.total)).toBeGreaterThan(0);
    // `registradoEn` lo fija el sistema: es el arranque del cronómetro.
    expect(pedido.registradoEn).toBeTruthy();
    expect(new Date(pedido.registradoEn).getTime()).toBeGreaterThan(
      new Date(recibidoEn).getTime(),
    );
  });

  it('confirma en el mismo paso cuando se solicita', async () => {
    const token = await iniciarSesion('vendedor');
    const pedidoId = await crearPedidoDePrueba(token, { confirmar: true });

    const respuesta = await request(app)
      .get(`/api/pedidos/${pedidoId}`)
      .set(cabecera(token))
      .expect(200);

    expect(respuesta.body.datos.estado).toBe('CONFIRMADO');
    expect(respuesta.body.datos.confirmadoEn).toBeTruthy();
  });

  it('rechaza un pedido sin productos', async () => {
    const token = await iniciarSesion('vendedor');
    const clienteId = await primerClienteId();

    const respuesta = await request(app)
      .post('/api/pedidos')
      .set(cabecera(token))
      .send({
        clienteId,
        recibidoEn: new Date().toISOString(),
        direccionEntrega: 'Jr. Bolognesi 120',
        detalles: [],
      })
      .expect(422);

    expect(respuesta.body.codigo).toBe('VALIDACION');
  });

  it('rechaza una fecha de recepción futura', async () => {
    const token = await iniciarSesion('vendedor');
    const clienteId = await primerClienteId();
    const bidon = await idProducto('BID20');

    const respuesta = await request(app)
      .post('/api/pedidos')
      .set(cabecera(token))
      .send({
        clienteId,
        recibidoEn: new Date(Date.now() + 60 * 60_000).toISOString(),
        direccionEntrega: 'Jr. Bolognesi 120',
        detalles: [{ productoId: bidon, cantidad: 2 }],
      })
      .expect(422);

    expect(respuesta.body.codigo).toBe('FECHA_INVALIDA');
  });

  it('rechaza un descuento mayor al subtotal', async () => {
    const token = await iniciarSesion('vendedor');
    const clienteId = await primerClienteId();
    const bidon = await idProducto('BID20');

    const respuesta = await request(app)
      .post('/api/pedidos')
      .set(cabecera(token))
      .send({
        clienteId,
        recibidoEn: new Date().toISOString(),
        direccionEntrega: 'Jr. Bolognesi 120',
        detalles: [{ productoId: bidon, cantidad: 1 }],
        descuento: 9999,
      })
      .expect(422);

    expect(respuesta.body.codigo).toBe('DESCUENTO_INVALIDO');
  });

  it('impide que el repartidor registre pedidos', async () => {
    const token = await iniciarSesion('repartidor');
    const clienteId = await primerClienteId();
    const bidon = await idProducto('BID20');

    await request(app)
      .post('/api/pedidos')
      .set(cabecera(token))
      .send({
        clienteId,
        recibidoEn: new Date().toISOString(),
        direccionEntrega: 'Jr. Bolognesi 120',
        detalles: [{ productoId: bidon, cantidad: 1 }],
      })
      .expect(403);
  });
});

describe('PATCH /api/pedidos/:id/estado', () => {
  it('avanza por las etapas válidas', async () => {
    const token = await iniciarSesion('vendedor');
    const pedidoId = await crearPedidoDePrueba(token, { confirmar: true });

    const respuesta = await request(app)
      .patch(`/api/pedidos/${pedidoId}/estado`)
      .set(cabecera(token))
      .send({ estado: 'ASIGNADO' })
      .expect(200);

    expect(respuesta.body.datos.estado).toBe('ASIGNADO');
    expect(respuesta.body.datos.asignadoEn).toBeTruthy();
  });

  it('no permite saltar de PENDIENTE a ENTREGADO', async () => {
    const token = await iniciarSesion('vendedor');
    const pedidoId = await crearPedidoDePrueba(token, { confirmar: false });

    const respuesta = await request(app)
      .patch(`/api/pedidos/${pedidoId}/estado`)
      .set(cabecera(token))
      .send({ estado: 'ENTREGADO' })
      .expect(422);

    expect(respuesta.body.codigo).toBe('TRANSICION_INVALIDA');
  });

  it('rechaza repetir el estado actual', async () => {
    const token = await iniciarSesion('vendedor');
    const pedidoId = await crearPedidoDePrueba(token, { confirmar: true });

    const respuesta = await request(app)
      .patch(`/api/pedidos/${pedidoId}/estado`)
      .set(cabecera(token))
      .send({ estado: 'CONFIRMADO' })
      .expect(422);

    expect(respuesta.body.codigo).toBe('ESTADO_SIN_CAMBIO');
  });

  it('exige motivo para cancelar', async () => {
    const token = await iniciarSesion('vendedor');
    const pedidoId = await crearPedidoDePrueba(token, { confirmar: true });

    const sinMotivo = await request(app)
      .patch(`/api/pedidos/${pedidoId}/estado`)
      .set(cabecera(token))
      .send({ estado: 'CANCELADO' })
      .expect(422);
    expect(sinMotivo.body.codigo).toBe('MOTIVO_REQUERIDO');

    const conMotivo = await request(app)
      .patch(`/api/pedidos/${pedidoId}/estado`)
      .set(cabecera(token))
      .send({ estado: 'CANCELADO', motivo: 'El cliente no confirmó el pedido' })
      .expect(200);
    expect(conMotivo.body.datos.estado).toBe('CANCELADO');
    expect(conMotivo.body.datos.canceladoEn).toBeTruthy();
  });

  it('devuelve 404 para un pedido inexistente', async () => {
    const token = await iniciarSesion('vendedor');
    await request(app)
      .get('/api/pedidos/999999')
      .set(cabecera(token))
      .expect(404);
  });
});

describe('Historial del pedido', () => {
  it('registra cada cambio de estado con usuario y fecha', async () => {
    const token = await iniciarSesion('vendedor');
    const pedidoId = await crearPedidoDePrueba(token, { confirmar: true });
    await request(app)
      .patch(`/api/pedidos/${pedidoId}/estado`)
      .set(cabecera(token))
      .send({ estado: 'ASIGNADO' })
      .expect(200);

    const respuesta = await request(app)
      .get(`/api/pedidos/${pedidoId}/historial`)
      .set(cabecera(token))
      .expect(200);

    const registros = respuesta.body.datos;
    expect(registros.length).toBeGreaterThanOrEqual(2);
    // El historial es la evidencia de trazabilidad que pide la tesis.
    for (const registro of registros) {
      expect(registro).toEqual(
        expect.objectContaining({
          estadoNuevo: expect.any(String),
          fecha: expect.any(String),
        }),
      );
    }
    const estados = registros.map((r: { estadoNuevo: string }) => r.estadoNuevo);
    expect(estados).toEqual(expect.arrayContaining(['CONFIRMADO', 'ASIGNADO']));
  });
});

describe('Listado y conteo de pedidos', () => {
  it('cuenta por estado', async () => {
    const token = await iniciarSesion('vendedor');
    await crearPedidoDePrueba(token, { confirmar: true });
    await crearPedidoDePrueba(token, { confirmar: false });

    const respuesta = await request(app)
      .get('/api/pedidos/conteo-estados')
      .set(cabecera(token))
      .expect(200);

    // El endpoint responde el `groupBy` de Prisma: una fila por estado.
    const conteo = Object.fromEntries(
      respuesta.body.datos.map((fila: { estado: string; _count: { _all: number } }) => [
        fila.estado,
        fila._count._all,
      ]),
    );
    expect(conteo.PENDIENTE).toBe(1);
    expect(conteo.CONFIRMADO).toBe(1);
  });

  it('respeta la paginación', async () => {
    const token = await iniciarSesion('vendedor');
    for (let i = 0; i < 3; i += 1) {
      await crearPedidoDePrueba(token);
    }

    const respuesta = await request(app)
      .get('/api/pedidos?pagina=2&limite=2')
      .set(cabecera(token))
      .expect(200);

    expect(respuesta.body.datos).toHaveLength(1);
    expect(respuesta.body.meta.paginacion).toEqual(
      expect.objectContaining({ pagina: 2, limite: 2, total: 3 }),
    );
  });
});
