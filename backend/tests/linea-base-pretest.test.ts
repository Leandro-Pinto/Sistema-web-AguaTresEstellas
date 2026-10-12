/**
 * LÍNEA BASE DEL PRETEST (tarea 2 del brief).
 *
 * El pretest se midió sobre el proceso manual con la ficha de observación.
 * El sistema no lo calcula, pero tampoco puede dejarlo en el aire: si cada
 * quien lo transcribe en su sesión, la comparación deja de ser reproducible.
 *
 * Estas pruebas cubren lo que hace auditable al dato:
 *   1. Sin registro, la comparación muestra "sin dato" y no un cero inventado.
 *   2. Con registro, la comparación lee exactamente lo que se guardó.
 *   3. La escritura queda con autor y fecha, y es exclusiva del administrador.
 *   4. Una corrección reemplaza la fila: no debe acumular líneas base.
 */
import request from 'supertest';
import { prisma } from '../src/config/prisma';
import {
  app,
  cabecera,
  cerrarPrisma,
  CREDENCIALES,
  iniciarSesion,
  limpiarOperativo,
} from './helpers';

afterAll(cerrarPrisma);
beforeEach(limpiarOperativo);

const FICHA = {
  tiempoRegistroMin: 12.5,
  tiempoProcesamientoVentaMin: 9.25,
  tiempoConfirmacionAsignacionMin: 7,
  porcentajePedidosCorrectos: 71.4,
  porcentajeVentasCorrectas: 88.5,
  porcentajeVentasConErrores: 11.5,
  porcentajePedidosAtendidos: 96.8,
  porcentajePedidosConErrores: 4.1,
  porcentajeTrazabilidadCompleta: 62.9,
};

type Registro = {
  registrada: boolean;
  creadoPor: string | null;
  creadoEn: string | null;
  actualizadoPor: string | null;
  actualizadoEn: string | null;
} & typeof FICHA;

const guardar = (token: string, cuerpo: Record<string, unknown>) =>
  request(app).put('/api/reportes/indicadores/pretest').set(cabecera(token)).send(cuerpo);

const leerRegistro = async (token: string): Promise<Registro> => {
  const respuesta = await request(app)
    .get('/api/reportes/indicadores/pretest')
    .set(cabecera(token))
    .expect(200);
  return respuesta.body.datos as Registro;
};

const nombreDelAdmin = async () => {
  const usuario = await prisma.usuario.findFirstOrThrow({
    where: { email: CREDENCIALES.admin.email },
    select: { nombreCompleto: true },
  });
  return usuario.nombreCompleto;
};

describe('Línea base vacía', () => {
  it('se declara como no registrada y no rellena valores', async () => {
    const token = await iniciarSesion('admin');
    const registro = await leerRegistro(token);

    expect(registro.registrada).toBe(false);
    expect(registro.creadoPor).toBeNull();
    expect(registro.tiempoRegistroMin).toBeNull();
    expect(registro.porcentajePedidosCorrectos).toBeNull();
    // Sin registro no hay ni autor ni fechas: son parte del dato, no decoración.
    expect(registro.creadoEn).toBeNull();
    expect(registro.actualizadoEn).toBeNull();
  });

  it('el comparativo responde «sin dato» en lugar de un cero inventado', async () => {
    const token = await iniciarSesion('admin');

    const comparativo = await request(app)
      .get('/api/reportes/indicadores/comparativo')
      .set(cabecera(token))
      .expect(200);

    const filas = comparativo.body.datos.comparacion as Record<
      string,
      { antes: number | null; despues: number; diferencia: number | null }
    >;
    const tiempos = filas.tiempoPromedioRegistro;

    expect(tiempos.antes).toBeNull();
    expect(tiempos.diferencia).toBeNull();
    // El postest sí se calcula: la fila existe, solo falta la línea base.
    expect(typeof tiempos.despues).toBe('number');
  });
});

describe('Registro de la ficha', () => {
  it('guarda la ficha con autor y fecha', async () => {
    const token = await iniciarSesion('admin');
    const respuesta = await guardar(token, FICHA).expect(200);

    const registro = respuesta.body.datos as Registro;
    expect(registro.registrada).toBe(true);
    expect(registro.creadoPor).toBe(await nombreDelAdmin());
    expect(registro.actualizadoPor).toBe(await nombreDelAdmin());
    expect(new Date(registro.creadoEn!).toString()).not.toBe('Invalid Date');

    // Y persiste: lo que devuelve la lectura no depende de la petición anterior.
    const releido = await leerRegistro(token);
    expect(releido).toEqual(registro);
    expect(releido.tiempoRegistroMin).toBe(12.5);
    expect(releido.porcentajeTrazabilidadCompleta).toBe(62.9);
  });

  it('acepta campos vacío: no medido es distinto de cero', async () => {
    const token = await iniciarSesion('admin');
    await guardar(token, { tiempoRegistroMin: 5, porcentajeVentasCorrectas: null }).expect(200);

    const registro = await leerRegistro(token);
    expect(registro.tiempoRegistroMin).toBe(5);
    expect(registro.porcentajeVentasCorrectas).toBeNull();
    // Los que no vinieron quedan en null, no en 0.
    expect(registro.tiempoProcesamientoVentaMin).toBeNull();
    expect(registro.porcentajePedidosConErrores).toBeNull();
  });

  it('la comparación usa exactamente lo guardado', async () => {
    const token = await iniciarSesion('admin');
    await guardar(token, FICHA).expect(200);

    const comparativo = await request(app)
      .get('/api/reportes/indicadores/comparativo')
      .set(cabecera(token))
      .expect(200);

    const filas = comparativo.body.datos.comparacion as Record<
      string,
      { antes: number | null; despues: number; diferencia: number | null }
    >;
    expect(filas.tiempoPromedioRegistro.antes).toBe(12.5);
    expect(filas.tiempoPromedioRegistro.diferencia).not.toBeNull();
    expect(filas.porcentajeVentasConErrores.antes).toBe(11.5);
    // El comparativo ya no acepta parámetros: la tabla y el registro no pueden divergir.
    expect(comparativo.body.datos.pretest.tiempoRegistroMin).toBe(12.5);
    expect(comparativo.body.datos.pretest.creadoPor).toBeUndefined();
  });

  it('una corrección reemplaza la fila en lugar de acumular líneas base', async () => {
    const token = await iniciarSesion('admin');
    const primera = await guardar(token, FICHA).expect(200);

    await guardar(token, { ...FICHA, tiempoRegistroMin: 4.5 }).expect(200);

    const total = await prisma.lineaBasePretest.count();
    expect(total).toBe(1);

    const registro = await leerRegistro(token);
    expect(registro.tiempoRegistroMin).toBe(4.5);
    // El autor original no se pisa al corregir.
    expect(registro.creadoEn).toBe((primera.body.datos as Registro).creadoEn);
    expect(new Date(registro.actualizadoEn!).getTime()).toBeGreaterThanOrEqual(
      new Date(registro.creadoEn!).getTime(),
    );
  });
});

describe('Control de la escritura', () => {
  it('rechaza un porcentaje fuera de rango', async () => {
    const token = await iniciarSesion('admin');

    await guardar(token, { porcentajeVentasCorrectas: 150 }).expect(422);
    await guardar(token, { porcentajePedidosCorrectos: -1 }).expect(422);

    expect(await prisma.lineaBasePretest.count()).toBe(0);
  });

  it('rechaza un campo desconocido en lugar de ignorarlo', async () => {
    const token = await iniciarSesion('admin');

    // `tiempoRegistroMine` con la "e" de más: si pasara en silencio, el
    // investigador creería que había guardado su medición.
    await guardar(token, { tiempoRegistroMine: 5 }).expect(422);

    const registro = await leerRegistro(token);
    expect(registro.registrada).toBe(false);
  });

  it('un vendedor puede consultarla pero no modificarla', async () => {
    const token = await iniciarSesion('vendedor');

    await request(app).get('/api/reportes/indicadores/pretest').set(cabecera(token)).expect(200);
    await guardar(token, FICHA).expect(403);

    expect(await prisma.lineaBasePretest.count()).toBe(0);
  });
});
