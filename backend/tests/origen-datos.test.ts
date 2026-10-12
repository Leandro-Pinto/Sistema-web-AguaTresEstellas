/**
 * SEPARACIÓN ENTRE DATOS REALES Y SIMULADOS (tarea 1 del brief).
 *
 * La tesis no puede presentar como postest un histórico que inventó el
 * simulador. Estas pruebas comprueban las dos barreras que lo impiden:
 *
 *   1. El simulador no arranca contra una base que no es de demostración.
 *   2. Los indicadores y los reportes leen solo datos `REAL` por omisión,
 *      aunque en la base convivan filas de los dos procedencias.
 *
 * La segunda es la importante: si el filtro desapareciera, nada fallaría en la
 * operación normal (donde solo hay datos reales) y el error se descubriría
 * justo cuando ya se está demostrando el sistema.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import request from 'supertest';
import { prisma } from '../src/config/prisma';
import { crearPedido } from '../src/services/pedidos.service';
import { crearVenta } from '../src/services/ventas.service';
import { registrarMovimientoBidon } from '../src/services/bidones.service';
import {
  app,
  cabecera,
  cerrarPrisma,
  idProducto,
  iniciarSesion,
  limpiarOperativo,
  primerClienteId,
} from './helpers';

afterAll(cerrarPrisma);
beforeEach(limpiarOperativo);

const RAIZ = path.resolve(__dirname, '..');

/**
 * Ejecuta el simulador en un proceso aparte.
 *
 * Un proceso hijo, y no una llamada a la función: la barrera que se prueba es
 * la que se activa al arrancar el script, con su configuración y su entorno
 * reales. Importarla en el propio Jest leería el `.env` del proceso de pruebas
 * y no probaría nada.
 */
const ejecutarSimulador = (entorno: NodeJS.ProcessEnv) => {
  const resultado = spawnSync(
    process.execPath,
    [path.join(RAIZ, 'node_modules', 'tsx', 'dist', 'cli.mjs'), path.join(RAIZ, 'scripts', 'simulador-proceso.ts'), '--dias=1', '--sinIndicadores'],
    {
      cwd: RAIZ,
      encoding: 'utf8',
      env: { ...process.env, ...entorno },
      timeout: 60_000,
    },
  );
  return { codigo: resultado.status, salida: `${resultado.stdout ?? ''}${resultado.stderr ?? ''}` };
};

describe('Simulador: barrera de entorno', () => {
  it('se detiene si el entorno no es demo', () => {
    const { codigo, salida } = ejecutarSimulador({ ENTORNO: 'prod' });

    expect(codigo).toBe(1);
    expect(salida).toMatch(/ENTORNO="prod"/);
    expect(salida).toMatch(/no son de demostración/);
  });

  it('se detiene si el entorno es test', () => {
    const { codigo, salida } = ejecutarSimulador({ ENTORNO: 'test' });

    expect(codigo).toBe(1);
    expect(salida).toMatch(/ENTORNO="test"/);
  });

  it('se detiene si la base de datos no es la de demostración', () => {
    // La base de pruebas termina en `_test`; declararla como `demo` viola la
    // concordancia entre entorno y base y el proceso no debe escribir nada.
    const { codigo, salida } = ejecutarSimulador({ ENTORNO: 'demo' });

    expect(codigo).toBe(1);
    expect(salida).toMatch(/_demo/);
  });

  it('no ofrece ninguna bandera para saltarse la comprobación', async () => {
    const { salida } = ejecutarSimulador({ ENTORNO: 'prod' });

    // Si `--forzar` volviera a existir, la barrera dependería de que nadie lo
    // escribiera. La comprobación es explícita para que no se reintroduzca.
    expect(salida).not.toMatch(/--forzar/i);
    expect(salida).not.toMatch(/ADVERTENCIA/i);
  });
});

/** Crea un pedido y su venta, marcados con el origen indicado. */
const sembrarOperacion = async (origen: 'REAL' | 'SIMULADO'): Promise<void> => {
  const usuarioId = await prisma.usuario.findUniqueOrThrow({
    where: { email: 'vendedor@aguarespura.pe' },
    select: { id: true },
  });
  const pedido = await crearPedido(
    {
      clienteId: await primerClienteId(),
      recibidoEn: new Date(Date.now() - 5 * 60_000),
      canal: 'WHATSAPP',
      modalidadEntrega: 'DOMICILIO',
      direccionEntrega: 'Jr. Bolognesi 120, Iberia',
      detalles: [{ productoId: await idProducto('BID20'), cantidad: 4 }],
      descuento: 0,
      confirmar: true,
      requiereCorreccion: false,
    },
    usuarioId.id,
    { origen },
  );
  await crearVenta({ pedidoId: pedido.id, descuento: 0 }, usuarioId.id, { origen });
};

describe('Indicadores y reportes: solo datos reales por omisión', () => {
  it('los indicadores del proceso ignoran los pedidos simulados', async () => {
    await sembrarOperacion('REAL');
    await sembrarOperacion('SIMULADO');
    const token = await iniciarSesion('admin');

    const respuesta = await request(app)
      .get('/api/reportes/indicadores/proceso')
      .set(cabecera(token))
      .expect(200);

    // En la base hay dos pedidos, uno de cada procedencia. Si la muestra fuera
    // 2, el postest estaría contando un histórico sintético.
    expect(respuesta.body.datos.muestra.pedidos).toBe(1);
    expect(respuesta.body.datos.muestra.ventas).toBe(1);
  });

  it('el reporte de pedidos ignora los pedidos simulados', async () => {
    await sembrarOperacion('REAL');
    await sembrarOperacion('SIMULADO');
    const token = await iniciarSesion('admin');

    const respuesta = await request(app)
      .get('/api/reportes/pedidos')
      .set(cabecera(token))
      .expect(200);

    expect(respuesta.body.datos.pedidos).toHaveLength(1);
    expect(respuesta.body.datos.resumen.totalPedidos).toBe(1);
  });

  it('el reporte de ventas ignora las ventas simuladas', async () => {
    await sembrarOperacion('REAL');
    await sembrarOperacion('SIMULADO');
    const token = await iniciarSesion('admin');

    const respuesta = await request(app)
      .get('/api/reportes/ventas')
      .set(cabecera(token))
      .expect(200);

    expect(respuesta.body.datos.ventas).toHaveLength(1);
    expect(respuesta.body.datos.resumen.cantidadVentas).toBe(1);
  });

  it('el consolidado diario ignora lo simulado', async () => {
    await sembrarOperacion('REAL');
    await sembrarOperacion('SIMULADO');
    const token = await iniciarSesion('admin');

    const respuesta = await request(app)
      .get('/api/reportes/diario')
      .set(cabecera(token))
      .expect(200);

    expect(respuesta.body.datos.resumen.ventas).toBe(1);
    expect(respuesta.body.datos.resumen.unidadesVendidas).toBe(4);
  });

  it('no sirve datos simulados aunque se pidan, fuera del entorno demo', async () => {
    await sembrarOperacion('REAL');
    await sembrarOperacion('SIMULADO');
    const token = await iniciarSesion('admin');

    const respuesta = await request(app)
      .get('/api/reportes/pedidos?origen=SIMULADO')
      .set(cabecera(token))
      .expect(200);

    // En `test` (como en `prod`) la petición se corrige al origen permitido y
    // se explica por qué en el mensaje, en lugar de servir la mezcla en
    // silencio.
    expect(respuesta.body.datos.pedidos).toHaveLength(1);
    expect(respuesta.body.mensaje).toMatch(/origen=SIMULADO/);
  });

  it('rechaza un origen que no existe en el catálogo', async () => {
    const token = await iniciarSesion('admin');

    const respuesta = await request(app)
      .get('/api/reportes/pedidos?origen=INVENTADO')
      .set(cabecera(token))
      .expect(422);

    expect(respuesta.body.codigo).toBe('VALIDACION');
  });
});

describe('Procedencia de los registros operativos', () => {
  it('la API marca como REAL lo que crea por su cuenta', async () => {
    const token = await iniciarSesion('vendedor');
    const idBidon = await idProducto('BID20');
    const clienteId = await primerClienteId();

    await request(app)
      .post('/api/pedidos')
      .set(cabecera(token))
      .send({
        clienteId,
        recibidoEn: new Date(Date.now() - 3 * 60_000).toISOString(),
        canal: 'WHATSAPP',
        modalidadEntrega: 'DOMICILIO',
        direccionEntrega: 'Jr. Bolognesi 120, Iberia',
        detalles: [{ productoId: idBidon, cantidad: 2 }],
        confirmar: true,
      })
      .expect(201);

    const pedido = await prisma.pedido.findFirstOrThrow({ orderBy: { id: 'desc' }, select: { origen: true } });
    expect(pedido.origen).toBe('REAL');
  });

  it('un cliente no puede declarar su propio pedido como simulado', async () => {
    const token = await iniciarSesion('vendedor');
    const idBidon = await idProducto('BID20');
    const clienteId = await primerClienteId();

    await request(app)
      .post('/api/pedidos')
      .set(cabecera(token))
      .send({
        clienteId,
        recibidoEn: new Date(Date.now() - 3 * 60_000).toISOString(),
        canal: 'WHATSAPP',
        modalidadEntrega: 'DOMICILIO',
        direccionEntrega: 'Jr. Bolognesi 120, Iberia',
        detalles: [{ productoId: idBidon, cantidad: 2 }],
        confirmar: true,
        origen: 'SIMULADO',
      })
      .expect(201);

    const pedido = await prisma.pedido.findFirstOrThrow({ orderBy: { id: 'desc' }, select: { origen: true } });
    expect(pedido.origen).toBe('REAL');
  });

  it('el historial hereda la procedencia del registro que documenta', async () => {
    await sembrarOperacion('SIMULADO');

    const origenes = await prisma.historialEstado.findMany({ distinct: ['origen'], select: { origen: true } });
    expect(origenes.map((o) => o.origen)).toEqual(['SIMULADO']);
  });
});

describe('Tablas sin columna de origen: se filtran por el pedido que las causó', () => {
  /**
   * Registra una salida de bidón atribuida a un pedido del origen indicado.
   *
   * El movimiento de envase no tiene columna propia de procedencia: lo que lo
   * firma es el pedido que lo provocó. Por eso el filtro se comprueba sobre esa
   * relación y no sobre el movimiento.
   */
  const sembrarSalidaDeBidon = async (origen: 'REAL' | 'SIMULADO'): Promise<void> => {
    const usuario = await prisma.usuario.findUniqueOrThrow({
      where: { email: 'vendedor@aguarespura.pe' },
      select: { id: true },
    });
    const pedido = await crearPedido(
      {
        clienteId: await primerClienteId(),
        recibidoEn: new Date(Date.now() - 4 * 60_000),
        canal: 'WHATSAPP',
        modalidadEntrega: 'DOMICILIO',
        direccionEntrega: 'Jr. Bolognesi 120, Iberia',
        detalles: [{ productoId: await idProducto('BID20'), cantidad: 4 }],
        descuento: 0,
        confirmar: true,
        requiereCorreccion: false,
      },
      usuario.id,
      { origen },
    );
    await registrarMovimientoBidon(
      {
        tipo: 'ENTREGA',
        clienteId: await primerClienteId(),
        productoId: await idProducto('BID20'),
        cantidad: 4,
        pedidoId: pedido.id,
      },
      usuario.id,
      prisma,
      { origen },
    );
  };

  it('el historial de envases no mezcla saldos de las dos procedencias', async () => {
    await sembrarSalidaDeBidon('REAL');
    await sembrarSalidaDeBidon('SIMULADO');
    const token = await iniciarSesion('admin');
    const clienteId = await primerClienteId();

    const salida = await request(app)
      .get(`/api/reportes/historial-bidones/${clienteId}`)
      .set(cabecera(token))
      .expect(200);

    // En la base hay dos salidas de bidón, una por pedido. Sin el filtro por
    // pedido, este endpoint mostraría las dos y presentaría un saldo simulado
    // como si fuera el saldo real del cliente.
    const movimientos = salida.body.datos.movimientos as { id: number; pedidoId: number | null }[];
    expect(movimientos).toHaveLength(1);

    const movimiento = await prisma.movimientoBidon.findUniqueOrThrow({
      where: { id: movimientos[0].id },
      select: { pedido: { select: { origen: true } } },
    });
    expect(movimiento.pedido?.origen).toBe('REAL');
    // El saldo que se muestra es el del conjunto real, no la suma de los dos.
    expect(salida.body.datos.saldoTotal).toBe(4);
  });

  it('rechaza un origen desconocido en este reporte', async () => {
    const token = await iniciarSesion('admin');
    const clienteId = await primerClienteId();

    await request(app)
      .get(`/api/reportes/historial-bidones/${clienteId}?origen=INVENTADO`)
      .set(cabecera(token))
      .expect(422);
  });
});