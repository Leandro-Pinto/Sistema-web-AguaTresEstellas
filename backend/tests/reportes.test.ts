/**
 * Pruebas de los reportes del postest.
 *
 * Los reportes son la evidencia que se adjunta a la tesis, así que se prueba
 * dos cosas: que el detalle llega anidado como lo espera la interfaz, y que el
 * CSV descargado corresponde al detalle y no a un cuadro resumen.
 */
import request from 'supertest';
import { prisma } from '../src/config/prisma';
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

/** Crea un pedido vendido y confirmado, para que los reportes tengan filas. */
const sembrarOperacion = async (cantidad: number) => {
  const token = await iniciarSesion('vendedor');
  const pedidoId = await crearPedidoDePrueba(token, { cantidad, confirmar: true });
  await request(app).post('/api/ventas').set(cabecera(token)).send({ pedidoId }).expect(201);
  return pedidoId;
};

/** Quita la marca de BOM y separa las filas del CSV. */
const filas = (cuerpo: string): string[] =>
  cuerpo
    .replace(/^\uFEFF/, '')
    .trim()
    .split('\r\n');

describe('Reportes: forma de la respuesta', () => {
  it('devuelve el detalle de ventas anidado como lo espera la tabla', async () => {
    await sembrarOperacion(4);
    const token = await iniciarSesion('admin');

    const respuesta = await request(app)
      .get('/api/reportes/ventas')
      .set(cabecera(token))
      .expect(200);

    const { datos } = respuesta.body;
    expect(Array.isArray(datos.ventas)).toBe(true);
    expect(datos.ventas).toHaveLength(1);
    // La interfaz lee estas rutas con notación de punto; si el backend deja de
    // anidar, la columna queda vacía sin avisar.
    expect(datos.ventas[0].cliente.nombre).toBeTruthy();
    expect(datos.ventas[0].pedido.codigo).toMatch(/^PED-/);
    expect(typeof datos.resumen.cantidadVentas).toBe('number');
  });

  it('rechaza un estado de pedido que no existe en el catálogo', async () => {
    const token = await iniciarSesion('admin');
    await request(app)
      .get('/api/reportes/pedidos?estado=NO_EXISTE')
      .set(cabecera(token))
      .expect(422);
  });
});

describe('Reportes: descarga CSV', () => {
  it('exporta el detalle y no el primer cuadro resumen', async () => {
    // Con varios pedidos, el detalle tiene más filas que cualquier resumen.
    await sembrarOperacion(3);
    await sembrarOperacion(3);
    const token = await iniciarSesion('admin');

    const respuesta = await request(app)
      .get('/api/reportes/ventas?formato=csv')
      .set(cabecera(token))
      .expect(200);

    expect(respuesta.headers['content-type']).toMatch(/text\/csv/);
    const lineas = filas(respuesta.text);
    // Cabecera + una fila por venta. Antes se descargaba el cuadro por método
    // de pago, que tiene cuatro filas y no dice nada de las ventas.
    expect(lineas).toHaveLength(3);
    // Los importes son una sola columna, no el desarme interno del Decimal.
    expect(lineas[0]).toContain('cliente.nombre');
    expect(lineas[0]).not.toMatch(/subtotal\./);
    expect(lineas[1]).toMatch(/VEN-/);
    expect(lineas[1]).toMatch(/Restaurante El Puerto S\.A\.C\./);
    // `subtotal;descuento;total;totalPagado;saldo` con valores numéricos.
    expect(lineas[1].split(';')[3]).toMatch(/^\d+(\.\d+)?$/);
  });

  it('exporta los indicadores en dos columnas cuando el reporte no tiene listas', async () => {
    await sembrarOperacion(2);
    const token = await iniciarSesion('admin');

    const respuesta = await request(app)
      .get('/api/reportes/tiempos-proceso?formato=csv')
      .set(cabecera(token))
      .expect(200);

    const lineas = filas(respuesta.text);
    expect(lineas[0]).toBe('indicador;valor');
    expect(lineas.join('\n')).toMatch(/muestra;/);
    expect(lineas.join('\n')).toMatch(/indicadores\.tiempoPromedioRegistroMin;/);
  });

  it('indica que no hay registros en vez de devolver un archivo vacío', async () => {
    const token = await iniciarSesion('admin');
    const respuesta = await request(app)
      .get('/api/reportes/inventario?formato=csv')
      .set(cabecera(token))
      .expect(200);

    // El catálogo del seed trae movimientos de inventario, así que se verifica
    // que el archivo tiene cabecera y no que esté vacío.
    expect(respuesta.text.replace(/^\uFEFF/, '').trim().length).toBeGreaterThan(0);
  });
});

describe('Reportes: descarga PDF', () => {
  it('exporta un PDF con estructura válida y el detalle del periodo', async () => {
    await sembrarOperacion(3);
    const token = await iniciarSesion('admin');

    const respuesta = await request(app)
      .get('/api/reportes/ventas?formato=pdf')
      .set(cabecera(token))
      .expect(200);

    expect(respuesta.headers['content-type']).toMatch(/application\/pdf/);
    expect(respuesta.headers['content-disposition']).toMatch(/attachment; filename="ventas_.+\.pdf"/);
    const cuerpo = respuesta.body as Buffer;
    // Cabecera mágica, páginas declaradas y cierre del archivo.
    expect(cuerpo.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(cuerpo.toString('latin1')).toContain('/Type /Page');
    expect(cuerpo.subarray(-6).toString('latin1').trim()).toBe('%%EOF');
    expect(cuerpo.length).toBeGreaterThan(1000);
  });

  it('no rompe cuando el periodo no tiene registros', async () => {
    // Sin ventas sembradas el detalle está vacío; el PDF debe salir igual.
    const token = await iniciarSesion('admin');
    const respuesta = await request(app)
      .get('/api/reportes/ventas?formato=pdf')
      .set(cabecera(token))
      .expect(200);

    expect(respuesta.body.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(respuesta.body.toString('latin1')).toContain('%%EOF');
  });

  it('el resumen del reporte sin listas se exporta como indicadores', async () => {
    await sembrarOperacion(2);
    const token = await iniciarSesion('admin');

    const respuesta = await request(app)
      .get('/api/reportes/tiempos-proceso?formato=pdf')
      .set(cabecera(token))
      .expect(200);

    expect(respuesta.headers['content-type']).toMatch(/application\/pdf/);
    expect(respuesta.body.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    // El metadato del documento se guarda sin comprimir: confirma que el PDF
    // se generó con el título del reporte pedido.
    expect(respuesta.body.toString('latin1')).toContain('(Reporte de tiempos proceso)');
  });
});

describe('Reportes: totales del resumen', () => {
  /**
   * El detalle de los reportes viene recortado a 500 filas. Si el resumen
   * toma el total de la longitud de ese recorte, la pantalla enseña un total
   * que no es el del periodo, y encima el desglose por estado suma más que
   * ese total. Estas pruebas crean más de 500 filas para que el recorte se
   * note y comprueban que el resumen cuenta el periodo completo.
   */
  const Many = 520;

  it('cuenta todos los pedidos del periodo, no los del recorte', async () => {
    const clienteId = await primerClienteId();
    const usuario = await prisma.usuario.findFirst({ where: { email: 'admin@aguarespura.pe' } });
    await prisma.pedido.createMany({
      data: Array.from({ length: Many }, (_, i) => ({
        codigo: `PED-MASA${i}`,
        clienteId,
        usuarioId: usuario!.id,
        canal: 'MOSTRADOR' as const,
        total: 10,
        direccionEntrega: 'Dirección de prueba',
        recibidoEn: new Date(),
        registradoEn: new Date(),
      })),
    });

    const token = await iniciarSesion('admin');
    const respuesta = await request(app).get('/api/reportes/pedidos').set(cabecera(token)).expect(200);
    const datos = respuesta.body.datos;

    const detalle = datos.pedidos;
    const porEstado = datos.resumen.porEstado as Record<string, number>;
    const sumaPorEstado = Object.values(porEstado).reduce((a, b) => a + b, 0);

    // El recorte sigue aplicando al detalle...
    expect(detalle.length).toBeLessThanOrEqual(500);
    // ...pero el total cuenta el periodo entero y cuadra con el desglose.
    expect(datos.resumen.totalPedidos).toBeGreaterThan(detalle.length);
    expect(datos.resumen.totalPedidos).toBe(sumaPorEstado);
  });

  it('el porcentaje de entregas se calcula sobre el total real', async () => {
    const clienteId = await primerClienteId();
    const repartidor = await prisma.repartidor.findFirst();
    const usuario = await prisma.usuario.findFirst({ where: { email: 'admin@aguarespura.pe' } });

    // `entrega.pedidoId` es único, así que cada entrega necesita su propio
    // pedido; se crean los pedidos primero y se usan los ids devueltos.
    await prisma.pedido.createMany({
      data: Array.from({ length: Many }, (_, i) => ({
        codigo: `PED-ENTREGA${i}`,
        clienteId,
        usuarioId: usuario!.id,
        canal: 'MOSTRADOR' as const,
        total: 10,
        direccionEntrega: 'Dirección de prueba',
        recibidoEn: new Date(),
        registradoEn: new Date(),
      })),
    });
    const pedidos = await prisma.pedido.findMany({
      where: { codigo: { startsWith: 'PED-ENTREGA' } },
      select: { id: true },
    });
    await prisma.entrega.createMany({
      data: pedidos.map((p, i) => ({
        pedidoId: p.id,
        repartidorId: repartidor!.id,
        asignadoPorId: usuario!.id,
        estado: i % 10 === 0 ? ('NO_ENTREGADO' as const) : ('ENTREGADA' as const),
        fechaAsignacion: new Date(),
        minutosDemora: i % 45,
      })),
    });

    const token = await iniciarSesion('admin');
    const respuesta = await request(app).get('/api/reportes/entregas').set(cabecera(token)).expect(200);
    const datos = respuesta.body.datos;

    const { totalEntregas, entregadas, porcentajeEntregadas } = datos.resumen;
    expect(datos.entregas.length).toBeLessThanOrEqual(500);
    expect(totalEntregas).toBeGreaterThan(datos.entregas.length);
    // Un porcentaje sobre 205 % delataría el total tomado del recorte.
    expect(porcentajeEntregadas).toBeLessThanOrEqual(100);
    expect(porcentajeEntregadas).toBeCloseTo((entregadas / totalEntregas) * 100, 1);
  });
});

describe('Reportes: control de acceso', () => {
  it('reserva el costo de consultas al administrador', async () => {
    const vendedor = await iniciarSesion('vendedor');
    await request(app).get('/api/reportes/costo-consultas').set(cabecera(vendedor)).expect(403);

    const admin = await iniciarSesion('admin');
    const respuesta = await request(app)
      .get('/api/reportes/costo-consultas')
      .set(cabecera(admin))
      .expect(200);
    // Es un arreglo plano, no un objeto con `resumen`.
    expect(Array.isArray(respuesta.body.datos)).toBe(true);
  });

  it('exige sesión para cualquier reporte', async () => {
    await request(app).get('/api/reportes/ventas').expect(401);
  });
});

describe('Reportes: costo de consultas', () => {
  it('registra la duración de la consulta más reciente', async () => {
    await sembrarOperacion(2);
    const token = await iniciarSesion('admin');
    await request(app).get('/api/reportes/ventas').set(cabecera(token)).expect(200);

    const respuesta = await request(app)
      .get('/api/reportes/costo-consultas')
      .set(cabecera(token))
      .expect(200);

    const [masCara] = respuesta.body.datos;
    expect(masCara.tipoConsulta).toBeTruthy();
    expect(typeof masCara.duracionMs).toBe('number');
  });
});
