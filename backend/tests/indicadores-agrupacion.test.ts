import { prisma } from '../src/config/prisma';
import { exportarIndicadores, indicadoresSistemaWeb } from '../src/services/indicadores.service';
import { aCsv } from '../src/utils/exportar';
import { cerrarPrisma, limpiarOperativo } from './helpers';

afterAll(cerrarPrisma);

beforeEach(async () => {
  await limpiarOperativo();
  await prisma.incidenciaSistema.deleteMany();
});

describe('agregación de indicadores del sistema', () => {
  it('calcula mediana, percentiles, fallos y pico solo en el periodo solicitado', async () => {
    const desde = new Date('2020-01-01T00:00:00.000Z');
    const hasta = new Date('2020-01-01T00:10:00.000Z');
    const duraciones = [10, 20, 30, 40];

    await prisma.bitacoraHttp.createMany({
      data: duraciones.map((duracionMs, indice) => ({
        metodo: 'GET',
        ruta: '/api/prueba',
        status: indice === 3 ? 500 : 200,
        duracionMs,
        esErrorServidor: indice === 3,
        fecha: new Date(desde.getTime() + indice * 10_000),
      })).concat({
        metodo: 'GET',
        ruta: '/api/fuera-periodo',
        status: 200,
        duracionMs: 5000,
        esErrorServidor: false,
        fecha: new Date(hasta.getTime() + 60_000),
      }),
    });

    const resultado = await indicadoresSistemaWeb(desde, hasta);

    expect(resultado.eficienciaDesempeno).toMatchObject({
      tiempoRespuestaPromedioMs: 25,
      tiempoRespuestaMedianaMs: 25,
      tiempoRespuestaP95Ms: 40,
      tiempoRespuestaP99Ms: 40,
      picoTransaccionesPorMinuto: 4,
      totalPeticiones: 4,
    });
    expect(resultado.fiabilidad.solicitudesFallidas).toBe(1);
    expect(resultado.fiabilidad.porcentajeSolicitudesFallidas).toBe(25);
  });

  it('recorta indisponibilidad al periodo y excluye incidencias descartadas', async () => {
    const desde = new Date('2020-01-01T00:00:00.000Z');
    const hasta = new Date('2020-01-01T00:10:00.000Z');

    await prisma.incidenciaSistema.createMany({
      data: [
        {
          codigo: 'INC-TEST-001',
          titulo: 'Incidencia resuelta',
          estado: 'RESUELTA',
          inicio: new Date('2019-12-31T23:55:00.000Z'),
          fin: new Date('2020-01-01T00:05:00.000Z'),
          duracionMinutos: 10,
        },
        {
          codigo: 'INC-TEST-002',
          titulo: 'Incidencia abierta',
          estado: 'ABIERTA',
          inicio: new Date('2020-01-01T00:08:00.000Z'),
        },
        {
          codigo: 'INC-TEST-003',
          titulo: 'Incidencia descartada',
          estado: 'DESCARTADA',
          inicio: new Date('2020-01-01T00:02:00.000Z'),
          fin: new Date('2020-01-01T00:09:00.000Z'),
          duracionMinutos: 7,
        },
      ],
    });

    const resultado = await indicadoresSistemaWeb(desde, hasta);

    expect(resultado.fiabilidad).toMatchObject({
      incidenciasRegistradas: 2,
      incidenciasResueltas: 1,
      minutosTotalesDeIndisponibilidad: 7,
      tiempoMedioRecuperacionMin: 10,
      porcentajeDisponibilidadObservado: 30,
    });
  });

  it('exporta un CSV comparativo con rango, procedencia, muestra y valores disponibles', async () => {
    const desde = new Date(2020, 0, 1, 0, 0, 0, 0);
    const hasta = new Date(2020, 0, 31, 23, 59, 59, 999);

    const reporte = await exportarIndicadores(desde, hasta, 'REAL');
    const contenidoCsv = aCsv(reporte);
    const registro = reporte.filas.find((fila) => fila.Indicador === 'Tiempo promedio de registro de un pedido');
    const indicadorSistema = reporte.filas.find((fila) => fila.Indicador === 'Tiempo de respuesta (mediana)');

    expect(reporte.filas).toHaveLength(24);
    expect(registro).toMatchObject({
      'Periodo desde': '2020-01-01',
      'Periodo hasta': '2020-01-31',
      'Origen de datos': 'REAL',
      'Pretest medido': 'No',
      Muestra: expect.stringContaining('pedidos=0'),
    });
    expect(indicadorSistema).toMatchObject({
      Pretest: '',
      'Diferencia (postest - pretest)': '',
      Muestra: expect.stringContaining('peticiones='),
    });
    expect(contenidoCsv).toContain('Pretest;Postest;Diferencia (postest - pretest);Variación porcentual vs. pretest;Pretest medido');
    expect(contenidoCsv).toContain('2020-01-01;2020-01-31;');
  });
});
