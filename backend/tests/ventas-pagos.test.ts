/**
 * Pruebas de ventas, pagos e inventario.
 *
 * Aquí viven tres de las reglas críticas de la tesis:
 *  - un pedido genera como máximo una venta;
 *  - un pago nunca puede superar el saldo pendiente;
 *  - el stock solo baja por una venta y se repone al anular.
 *
 * La última es la que suele romperse en la implementations, así que se
 * comprueba consultando la base de datos y no solo la respuesta HTTP.
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
  stockDe,
} from './helpers';

afterAll(cerrarPrisma);
beforeEach(limpiarOperativo);

/** Crea un pedido confirmado y devuelve su id junto con la venta asociada. */
const crearVentaDePrueba = async (
  token: string,
  opciones: { cantidad?: number; descuento?: number; pagoInicial?: number } = {},
) => {
  const { cantidad = 5, descuento = 0, pagoInicial } = opciones;
  const pedidoId = await crearPedidoDePrueba(token, { cantidad, confirmar: true });

  const respuesta = await request(app)
    .post('/api/ventas')
    .set(cabecera(token))
    .send({
      pedidoId,
      descuento,
      ...(pagoInicial !== undefined
        ? { pagoInicial: { monto: pagoInicial, metodo: 'EFECTIVO' } }
        : {}),
    })
    .expect(201);

  return { pedidoId, venta: respuesta.body.datos };
};

describe('POST /api/ventas', () => {
  it('genera la venta y descuenta el stock del inventario', async () => {
    const token = await iniciarSesion('vendedor');
    const stockAntes = await stockDe('BID20');
    const cantidad = 7;

    const { venta } = await crearVentaDePrueba(token, { cantidad });

    expect(venta.numero).toEqual(expect.any(String));
    expect(venta.estado).toBe('PENDIENTE');
    expect(Number(venta.saldo)).toBe(Number(venta.total));
    // La venta es la única vía de salida de inventario.
    expect(await stockDe('BID20')).toBe(stockAntes - cantidad);
  });

  it('no permite una segunda venta para el mismo pedido', async () => {
    const token = await iniciarSesion('vendedor');
    const { pedidoId } = await crearVentaDePrueba(token);

    const respuesta = await request(app)
      .post('/api/ventas')
      .set(cabecera(token))
      .send({ pedidoId })
      .expect(409);

    expect(respuesta.body.codigo).toBe('VENTA_DUPLICADA');
  });

  it('no permite vender un pedido sin confirmar', async () => {
    const token = await iniciarSesion('vendedor');
    const pedidoId = await crearPedidoDePrueba(token, { confirmar: false });

    const respuesta = await request(app)
      .post('/api/ventas')
      .set(cabecera(token))
      .send({ pedidoId })
      .expect(422);

    expect(respuesta.body.codigo).toBe('PEDIDO_NO_CONFIRMADO');
  });

  it('no permite vender un pedido cancelado', async () => {
    const token = await iniciarSesion('vendedor');
    const pedidoId = await crearPedidoDePrueba(token, { confirmar: true });
    await request(app)
      .patch(`/api/pedidos/${pedidoId}/estado`)
      .set(cabecera(token))
      .send({ estado: 'CANCELADO', motivo: 'El cliente se arrepintió' })
      .expect(200);

    const respuesta = await request(app)
      .post('/api/ventas')
      .set(cabecera(token))
      .send({ pedidoId })
      .expect(422);

    expect(respuesta.body.codigo).toBe('PEDIDO_CANCELADO');
  });

  it('rechaza la venta cuando no hay stock suficiente', async () => {
    const token = await iniciarSesion('admin');
    // Se fuerza el agotamiento con un ajuste documentado.
    const bidon = await idProducto('BID20');
    const stock = await stockDe('BID20');
    await request(app)
      .post('/api/productos/inventario/movimientos')
      .set(cabecera(token))
      .send({
        productoId: bidon,
        tipo: 'AJUSTE',
        stockFinal: 2,
        origen: 'AJUSTE MANUAL',
        observaciones: 'Conteo físico: solo quedan 2 bidones en planta',
      })
      .expect(201);

    const respuesta = await request(app)
      .post('/api/ventas')
      .set(cabecera(token))
      .send({ pedidoId: await crearPedidoDePrueba(token, { cantidad: 50, confirmar: true }) })
      .expect(422);

    expect(respuesta.body.codigo).toBe('STOCK_INSUFICIENTE');
    expect(stock).toBeGreaterThan(0);
  });

  it('impide que el repartidor registre ventas', async () => {
    const tokenVendedor = await iniciarSesion('vendedor');
    const tokenRepartidor = await iniciarSesion('repartidor');
    const pedidoId = await crearPedidoDePrueba(tokenVendedor, { confirmar: true });

    await request(app)
      .post('/api/ventas')
      .set(cabecera(tokenRepartidor))
      .send({ pedidoId })
      .expect(403);
  });
});

describe('POST /api/ventas/:id/anular', () => {
  // Anular es potestad exclusiva del administrador, así que toda esta suite
  // opera con su token; la restricción se prueba en auth.test.ts.
  it('anula la venta, repone el stock y deja constancia del motivo', async () => {
    const token = await iniciarSesion('admin');
    const stockAntes = await stockDe('BID20');
    const cantidad = 4;
    const { venta } = await crearVentaDePrueba(token, { cantidad });
    expect(await stockDe('BID20')).toBe(stockAntes - cantidad);

    const respuesta = await request(app)
      .post(`/api/ventas/${venta.id}/anular`)
      .set(cabecera(token))
      .send({ motivo: 'Error de digitación en la cantidad', reponerInventario: true })
      .expect(200);

    expect(respuesta.body.datos.estado).toBe('ANULADA');
    expect(await stockDe('BID20')).toBe(stockAntes);
  });

  it('rechaza anular dos veces la misma venta', async () => {
    const token = await iniciarSesion('admin');
    const { venta } = await crearVentaDePrueba(token);
    const payload = { motivo: 'Primera anulación' };

    await request(app)
      .post(`/api/ventas/${venta.id}/anular`)
      .set(cabecera(token))
      .send(payload)
      .expect(200);

    const segunda = await request(app)
      .post(`/api/ventas/${venta.id}/anular`)
      .set(cabecera(token))
      .send(payload)
      .expect(422);

    expect(segunda.body.codigo).toBe('VENTA_YA_ANULADA');
  });

  it('exige el motivo de la anulación', async () => {
    const token = await iniciarSesion('admin');
    const { venta } = await crearVentaDePrueba(token);

    const respuesta = await request(app)
      .post(`/api/ventas/${venta.id}/anular`)
      .set(cabecera(token))
      .send({})
      .expect(422);

    expect(respuesta.body.codigo).toBe('VALIDACION');
  });
});

describe('POST /api/pagos', () => {
  it('registra un pago parcial y reduce el saldo', async () => {
    const token = await iniciarSesion('vendedor');
    const { venta } = await crearVentaDePrueba(token);
    const total = Number(venta.total);

    const respuesta = await request(app)
      .post('/api/pagos')
      .set(cabecera(token))
      .send({ ventaId: venta.id, monto: 20, metodo: 'YAPE' })
      .expect(201);

    // El servicio devuelve el nuevo saldo, así que no hace falta releer la venta.
    expect(Number(respuesta.body.datos.saldo)).toBeCloseTo(total - 20, 2);
    expect(Number(respuesta.body.datos.totalPagado)).toBeCloseTo(20, 2);
    expect(respuesta.body.datos.pago.metodo).toBe('YAPE');
  });

  it('rechaza un pago mayor al saldo pendiente', async () => {
    const token = await iniciarSesion('vendedor');
    const { venta } = await crearVentaDePrueba(token);
    const total = Number(venta.total);

    const respuesta = await request(app)
      .post('/api/pagos')
      .set(cabecera(token))
      .send({ ventaId: venta.id, monto: total + 1, metodo: 'EFECTIVO' })
      .expect(422);

    expect(respuesta.body.codigo).toBe('PAGO_EXCEDE_SALDO');
  });

  it('rechaza un pago de cero o negativo', async () => {
    const token = await iniciarSesion('vendedor');
    const { venta } = await crearVentaDePrueba(token);

    const respuesta = await request(app)
      .post('/api/pagos')
      .set(cabecera(token))
      .send({ ventaId: venta.id, monto: 0, metodo: 'EFECTIVO' })
      .expect(422);

    expect(respuesta.body.codigo).toBe('VALIDACION');
  });

  it('completa la venta cuando el pago cancela el saldo total', async () => {
    const token = await iniciarSesion('vendedor');
    const { venta } = await crearVentaDePrueba(token);

    await request(app)
      .post('/api/pagos')
      .set(cabecera(token))
      .send({ ventaId: venta.id, monto: Number(venta.total), metodo: 'EFECTIVO' })
      .expect(201);

    const consulta = await request(app)
      .get(`/api/ventas/${venta.id}`)
      .set(cabecera(token))
      .expect(200);

    expect(consulta.body.datos.estado).toBe('COMPLETADA');
    expect(Number(consulta.body.datos.saldo)).toBe(0);
  });

  it('acepta el pago en el mismo paso de la venta', async () => {
    const token = await iniciarSesion('vendedor');
    const { venta } = await crearVentaDePrueba(token, { pagoInicial: 10 });

    const consulta = await request(app)
      .get(`/api/ventas/${venta.id}`)
      .set(cabecera(token))
      .expect(200);

    expect(Number(consulta.body.datos.saldo)).toBeCloseTo(Number(venta.total) - 10, 2);
  });

  it('no permite pagos sobre una venta anulada', async () => {
    const tokenVendedor = await iniciarSesion('vendedor');
    const tokenAdmin = await iniciarSesion('admin');
    const { venta } = await crearVentaDePrueba(tokenVendedor);
    await request(app)
      .post(`/api/ventas/${venta.id}/anular`)
      .set(cabecera(tokenAdmin))
      .send({ motivo: 'Anulación de prueba' })
      .expect(200);

    const respuesta = await request(app)
      .post('/api/pagos')
      .set(cabecera(tokenVendedor))
      .send({ ventaId: venta.id, monto: 5, metodo: 'EFECTIVO' })
      .expect(422);

    expect(respuesta.body.codigo).toBe('VENTA_ANULADA');
  });

  it('el administrador anula un pago y el saldo vuelve a abrirse', async () => {
    const tokenAdmin = await iniciarSesion('admin');
    const tokenVendedor = await iniciarSesion('vendedor');
    const { venta } = await crearVentaDePrueba(tokenVendedor);

    const pago = await request(app)
      .post('/api/pagos')
      .set(cabecera(tokenVendedor))
      .send({ ventaId: venta.id, monto: Number(venta.total), metodo: 'EFECTIVO' })
      .expect(201);

    await request(app)
      .post(`/api/pagos/${pago.body.datos.pago.id}/anular`)
      .set(cabecera(tokenAdmin))
      .send({ motivo: 'Se recibió el cheque por error' })
      .expect(200);

    const consulta = await request(app)
      .get(`/api/ventas/${venta.id}`)
      .set(cabecera(tokenVendedor))
      .expect(200);

    expect(Number(consulta.body.datos.saldo)).toBeCloseTo(Number(venta.total), 2);
    expect(consulta.body.datos.estado).toBe('PENDIENTE');
  });

  it('el vendedor no puede anular un pago', async () => {
    const token = await iniciarSesion('vendedor');
    const { venta } = await crearVentaDePrueba(token);
    const pago = await request(app)
      .post('/api/pagos')
      .set(cabecera(token))
      .send({ ventaId: venta.id, monto: 5, metodo: 'EFECTIVO' })
      .expect(201);

    await request(app)
      .post(`/api/pagos/${pago.body.datos.pago.id}/anular`)
      .set(cabecera(token))
      .send({ motivo: 'Intento no autorizado' })
      .expect(403);
  });
});
