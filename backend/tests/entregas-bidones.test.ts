/**
 * Pruebas de reparto y control de envases.
 *
 * El saldo de bidones es la deuda de containers del cliente: es el dato más
 * fácil de corromper y el que más se audita. Las pruebas comprueban que la
 * entrega registre automáticamente lo entregado, que la devolución reponga el
 * inventario y que ningún movimiento pueda dejar el saldo en negativo.
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
  otroRepartidorId,
  primerClienteId,
  primerRepartidorId,
  repartidorDelUsuarioId,
  stockDe,
} from './helpers';

afterAll(cerrarPrisma);
beforeEach(limpiarOperativo);

/** Pedido confirmado, vendido y asignado a un repartidor. */
const prepararEntrega = async (cantidad = 5) => {
  const tokenAdmin = await iniciarSesion('admin');
  const pedidoId = await crearPedidoDePrueba(tokenAdmin, { cantidad, confirmar: true });
  await request(app)
    .post('/api/ventas')
    .set(cabecera(tokenAdmin))
    .send({ pedidoId })
    .expect(201);

  const repartidorId = await primerRepartidorId();
  const asignacion = await request(app)
    .post('/api/entregas/entregas')
    .set(cabecera(tokenAdmin))
    .send({ pedidoId, repartidorId })
    .expect(201);

  return { tokenAdmin, pedidoId, repartidorId, entrega: asignacion.body.datos };
};

/**
 * Lleva una entrega hasta `ENTREGADA`, que es el estado que dispara el
 * registro automático de bidones entregados.
 */
const completarEntrega = async (token: string, entregaId: number) => {
  await request(app)
    .put(`/api/entregas/entregas/${entregaId}`)
    .set(cabecera(token))
    .send({ estado: 'EN_RUTA' })
    .expect(200);
  return request(app)
    .put(`/api/entregas/entregas/${entregaId}`)
    .set(cabecera(token))
    .send({ estado: 'ENTREGADA' })
    .expect(200);
};

describe('POST /api/entregas/entregas', () => {
  it('asigna el repartidor y lleva el pedido a ASIGNADO', async () => {
    const { tokenAdmin, pedidoId, entrega } = await prepararEntrega();

    expect(entrega.repartidorId).toBeGreaterThan(0);
    expect(entrega.estado).toBe('ASIGNADA');

    const pedido = await request(app)
      .get(`/api/pedidos/${pedidoId}`)
      .set(cabecera(tokenAdmin))
      .expect(200);
    expect(pedido.body.datos.estado).toBe('ASIGNADO');
  });

  it('no permite asignar dos veces el mismo pedido', async () => {
    const { tokenAdmin, pedidoId, repartidorId } = await prepararEntrega();

    const respuesta = await request(app)
      .post('/api/entregas/entregas')
      .set(cabecera(tokenAdmin))
      .send({ pedidoId, repartidorId })
      .expect(422);

    expect(respuesta.body.codigo).toBe('ENTREGA_DUPLICADA');
  });

  it('exige que el pedido esté confirmado', async () => {
    const token = await iniciarSesion('admin');
    const pedidoId = await crearPedidoDePrueba(token, { confirmar: false });

    const respuesta = await request(app)
      .post('/api/entregas/entregas')
      .set(cabecera(token))
      .send({ pedidoId, repartidorId: await primerRepartidorId() })
      .expect(422);

    expect(respuesta.body.codigo).toBe('PEDIDO_NO_CONFIRMADO');
  });

  it('rechaza un repartidor inexistente', async () => {
    const token = await iniciarSesion('admin');
    const pedidoId = await crearPedidoDePrueba(token, { confirmar: true });

    await request(app)
      .post('/api/entregas/entregas')
      .set(cabecera(token))
      .send({ pedidoId, repartidorId: 999999 })
      .expect(404);
  });
});

describe('PUT /api/entregas/entregas/:id', () => {
  it('lleva la entrega a ENTREGADA y el pedido a ENTREGADO', async () => {
    const { tokenAdmin, pedidoId, entrega } = await prepararEntrega(6);

    // La ruta tiene tres etapas: asignada, en ruta y entregada.
    await request(app)
      .put(`/api/entregas/entregas/${entrega.id}`)
      .set(cabecera(tokenAdmin))
      .send({ estado: 'EN_RUTA' })
      .expect(200);

    const respuesta = await request(app)
      .put(`/api/entregas/entregas/${entrega.id}`)
      .set(cabecera(tokenAdmin))
      .send({ estado: 'ENTREGADA' })
      .expect(200);

    expect(respuesta.body.datos.estado).toBe('ENTREGADA');
    expect(respuesta.body.datos.horaEntrega).toBeTruthy();
    // Los bidones entregados se calculan del detalle del pedido.
    expect(respuesta.body.datos.bidonesEntregados).toBe(6);

    const pedido = await request(app)
      .get(`/api/pedidos/${pedidoId}`)
      .set(cabecera(tokenAdmin))
      .expect(200);
    expect(pedido.body.datos.estado).toBe('ENTREGADO');
    expect(pedido.body.datos.entregadoEn).toBeTruthy();
  });

  it('no permite cerrar la entrega sin haber salido a ruta', async () => {
    const { tokenAdmin, entrega } = await prepararEntrega();

    const respuesta = await request(app)
      .put(`/api/entregas/entregas/${entrega.id}`)
      .set(cabecera(tokenAdmin))
      .send({ estado: 'ENTREGADA' })
      .expect(422);

    expect(respuesta.body.codigo).toBe('TRANSICION_INVALIDA');
  });

  it('registra la salida a ruta con su marca de tiempo', async () => {
    const { tokenAdmin, entrega } = await prepararEntrega();

    const respuesta = await request(app)
      .put(`/api/entregas/entregas/${entrega.id}`)
      .set(cabecera(tokenAdmin))
      .send({ estado: 'EN_RUTA' })
      .expect(200);

    expect(respuesta.body.datos.horaSalida).toBeTruthy();
  });

  it('exige motivo cuando la entrega no se realizó', async () => {
    const { tokenAdmin, entrega } = await prepararEntrega();

    await request(app)
      .put(`/api/entregas/entregas/${entrega.id}`)
      .set(cabecera(tokenAdmin))
      .send({ estado: 'EN_RUTA' })
      .expect(200);

    const sinMotivo = await request(app)
      .put(`/api/entregas/entregas/${entrega.id}`)
      .set(cabecera(tokenAdmin))
      .send({ estado: 'NO_ENTREGADO' })
      .expect(422);
    expect(sinMotivo.body.codigo).toBe('MOTIVO_REQUERIDO');

    const conMotivo = await request(app)
      .put(`/api/entregas/entregas/${entrega.id}`)
      .set(cabecera(tokenAdmin))
      .send({ estado: 'NO_ENTREGADO', motivoNoEntrega: 'El cliente no atendió' })
      .expect(200);
    expect(conMotivo.body.datos.estado).toBe('NO_ENTREGADO');
  });

  it('rechaza una transición de entrega imposible', async () => {
    const { tokenAdmin, entrega } = await prepararEntrega();

    const respuesta = await request(app)
      .put(`/api/entregas/entregas/${entrega.id}`)
      .set(cabecera(tokenAdmin))
      .send({ estado: 'PENDIENTE' })
      .expect(422);

    expect(respuesta.body.codigo).toBe('TRANSICION_INVALIDA');
  });
});

describe('Saldos de bidones', () => {
  it('la entrega registra los bidones a nombre del cliente', async () => {
    const { tokenAdmin, entrega } = await prepararEntrega(9);
    const clienteId = await primerClienteId();

    await completarEntrega(tokenAdmin, entrega.id);

    const respuesta = await request(app)
      .get(`/api/bidones/clientes/${clienteId}/saldo`)
      .set(cabecera(tokenAdmin))
      .expect(200);

    // El endpoint devuelve el saldo total de envases del cliente.
    expect(respuesta.body.datos).toBe(9);

    const saldos = await request(app)
      .get('/api/bidones/saldos?soloConSaldo=true')
      .set(cabecera(tokenAdmin))
      .expect(200);
    expect(saldos.body.datos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          clienteId,
          cliente: expect.objectContaining({
            id: clienteId,
            nombre: expect.any(String),
            documento: expect.any(String),
          }),
          producto: expect.objectContaining({
            id: await idProducto('BID20'),
            nombre: expect.any(String),
            esRetornable: true,
          }),
          saldo: 9,
        }),
      ]),
    );

    const total = await request(app)
      .get('/api/bidones/saldos/total')
      .set(cabecera(tokenAdmin))
      .expect(200);
    expect(total.body.datos.totalBidones).toBe(9);
  });

  it('la devolución reduce el saldo y repone el inventario', async () => {
    const { tokenAdmin, entrega } = await prepararEntrega(4);
    const clienteId = await primerClienteId();
    const bidon = await idProducto('BID20');

    await completarEntrega(tokenAdmin, entrega.id);

    // Tras la entrega el stock bajó 4; la devolución debe devolverlo.
    const stockTrasVenta = await stockDe('BID20');

    const movimiento = await request(app)
      .post('/api/bidones/movimientos')
      .set(cabecera(tokenAdmin))
      .send({ tipo: 'DEVOLUCION', clienteId, productoId: bidon, cantidad: 4 })
      .expect(201);

    expect(movimiento.body.datos.saldoResultante).toBe(0);
    expect(await stockDe('BID20')).toBe(stockTrasVenta + 4);
  });

  it('rechaza devolver más bidones de los que el cliente tiene', async () => {
    const { tokenAdmin, entrega } = await prepararEntrega(3);
    const clienteId = await primerClienteId();
    const bidon = await idProducto('BID20');

    await completarEntrega(tokenAdmin, entrega.id);

    const respuesta = await request(app)
      .post('/api/bidones/movimientos')
      .set(cabecera(tokenAdmin))
      .send({ tipo: 'DEVOLUCION', clienteId, productoId: bidon, cantidad: 5 })
      .expect(422);

    expect(respuesta.body.codigo).toBe('DEVOLUCION_EXCESIVA');
  });

  it('rechaza control de bidones sobre un producto no retornable', async () => {
    const token = await iniciarSesion('admin');
    const clienteId = await primerClienteId();
    const botella = await idProducto('PRE15');

    const respuesta = await request(app)
      .post('/api/bidones/movimientos')
      .set(cabecera(token))
      .send({ tipo: 'ENTREGA', clienteId, productoId: botella, cantidad: 5 })
      .expect(422);

    expect(respuesta.body.codigo).toBe('PRODUCTO_NO_RETORNABLE');
  });

  it('rechaza registrar una pérdida sin explicación', async () => {
    const token = await iniciarSesion('admin');
    const clienteId = await primerClienteId();
    const bidon = await idProducto('BID20');

    const respuesta = await request(app)
      .post('/api/bidones/movimientos')
      .set(cabecera(token))
      .send({ tipo: 'PERDIDA', clienteId, productoId: bidon, cantidad: 1 })
      .expect(422);

    expect(respuesta.body.codigo).toBe('VALIDACION');
  });

  it('la pérdida interna descuenta del stock sin adeudarlo a un cliente', async () => {
    const token = await iniciarSesion('admin');
    const bidon = await idProducto('BID20');
    const stockAntes = await stockDe('BID20');

    await request(app)
      .post('/api/bidones/movimientos')
      .set(cabecera(token))
      .send({
        tipo: 'PERDIDA',
        productoId: bidon,
        cantidad: 2,
        observaciones: 'Se rompieron dos bidones en el vehicle',
      })
      .expect(201);

    expect(await stockDe('BID20')).toBe(stockAntes - 2);
  });

  it('el saldo total de la empresa cuadra con la suma por cliente', async () => {
    const { tokenAdmin, entrega } = await prepararEntrega(5);
    const clienteId = await primerClienteId();

    await completarEntrega(tokenAdmin, entrega.id);

    const total = await request(app)
      .get('/api/bidones/saldos/total')
      .set(cabecera(tokenAdmin))
      .expect(200);
    const delCliente = await request(app)
      .get(`/api/bidones/clientes/${clienteId}/saldo`)
      .set(cabecera(tokenAdmin))
      .expect(200);

    expect(total.body.datos.totalBidones).toBe(delCliente.body.datos);
  });
});

describe('Aislamiento del repartidor', () => {
  it('el repartidor solo ve las entregas de su ficha', async () => {
    const repartidorId = await repartidorDelUsuarioId();
    // La entrega de esta prueba se asigna a una ficha ajena, así que no puede
    // asomarse a la ruta del usuario.
    const ajeno = await otroRepartidorId();
    expect(repartidorId).not.toBe(ajeno);

    const tokenRepartidor = await iniciarSesion('repartidor');
    const antes = await request(app)
      .get('/api/entregas/mis-entregas')
      .set(cabecera(tokenRepartidor))
      .expect(200);
    expect(antes.body.datos).toHaveLength(0);

    const tokenAdmin = await iniciarSesion('admin');
    const pedidoId = await crearPedidoDePrueba(tokenAdmin, { cantidad: 2, confirmar: true });
    await request(app)
      .post('/api/ventas')
      .set(cabecera(tokenAdmin))
      .send({ pedidoId })
      .expect(201);
    await request(app)
      .post('/api/entregas/entregas')
      .set(cabecera(tokenAdmin))
      .send({ pedidoId, repartidorId: ajeno })
      .expect(201);

    const despues = await request(app)
      .get('/api/entregas/mis-entregas')
      .set(cabecera(tokenRepartidor))
      .expect(200);

    // La entrega se asignó a otra persona: no debe aparecer en su ruta.
    expect(despues.body.datos).toHaveLength(0);
  });

  it('el repartidor puede actualizar su propia entrega', async () => {
    const tokenAdmin = await iniciarSesion('admin');
    const pedidoId = await crearPedidoDePrueba(tokenAdmin, { confirmar: true });
    await request(app).post('/api/ventas').set(cabecera(tokenAdmin)).send({ pedidoId }).expect(201);

    const asignacion = await request(app)
      .post('/api/entregas/entregas')
      .set(cabecera(tokenAdmin))
      .send({ pedidoId, repartidorId: await repartidorDelUsuarioId() })
      .expect(201);

    const tokenRepartidor = await iniciarSesion('repartidor');
    const ruta = await request(app)
      .get('/api/entregas/mis-entregas')
      .set(cabecera(tokenRepartidor))
      .expect(200);
    expect(ruta.body.datos).toHaveLength(1);

    const respuesta = await request(app)
      .put(`/api/entregas/entregas/${asignacion.body.datos.id}`)
      .set(cabecera(tokenRepartidor))
      .send({ estado: 'EN_RUTA' })
      .expect(200);
    expect(respuesta.body.datos.estado).toBe('EN_RUTA');
  });
});
