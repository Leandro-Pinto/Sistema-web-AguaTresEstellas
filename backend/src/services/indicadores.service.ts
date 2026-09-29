import { prisma } from '../config/prisma';

/**
 * ============================================================================
 *  MÓDULO DE INDICADORES DE LA TESIS
 * ============================================================================
 *
 *  Calcula, a partir de los datos reales almacenados por el sistema, los
 *  indicadores definidos en la "Anexo 1. Matriz de Operacionalización de
 *  Variables" de la tesis.
 *
 *  VARIABLE INDEPENDIENTE: Sistema web
 *    D1. Adecuación funcional
 *        - % de requisitos funcionales implementados y aprobados
 *        - % de casos de prueba funcional superados
 *        - % de transacciones ejecutadas con el resultado esperado
 *    D2. Eficiencia del desempeño
 *        - Tiempo de respuesta de las solicitudes (mediana y p95)
 *        - Rendimiento: transacciones procesadas por minuto
 *        - Uso de recursos (no disponible desde la aplicación; se mide con
 *          herramientas externas de carga, ver documentación)
 *    D3. Fiabilidad
 *        - % de disponibilidad del sistema
 *        - % de solicitudes fallidas (5xx)
 *        - Tiempo medio de recuperación (MTTR)
 *
 *  VARIABLE DEPENDIENTE: Proceso de ventas
 *    D1. Recepción y registro de pedidos
 *        - Tiempo promedio de registro de un pedido
 *        - % de pedidos registrados correctamente
 *        - % de pedidos con errores de registro
 *    D2. Procesamiento y control de ventas
 *        - Tiempo promedio de procesamiento de una venta
 *        - % de ventas procesadas correctamente
 *        - % de registros de venta con errores
 *    D3. Atención y seguimiento de pedidos
 *        - Tiempo promedio de confirmación y asignación del pedido
 *        - % de pedidos atendidos correctamente
 *        - % de pedidos con trazabilidad completa
 *
 *  IMPORTANTE: estos valores corresponden al POSTEST. La medición del
 *  PRETEST (proceso manual) se registra con la ficha de observación de la
 *  tesis, porque el sistema no existía durante ese periodo. Este módulo
 *  existe para que el postest NO dependa de cálculos manuales.
 * ============================================================================
 */

const porcentaje = (numerador: number, denominador: number): number =>
  denominador > 0 ? Number(((numerador / denominador) * 100).toFixed(2)) : 0;

const redondear = (n: number, decimales = 2): number => Number(n.toFixed(decimales));

const intervalo = (desde?: Date, hasta?: Date) => ({
  ...(desde ? { gte: desde } : {}),
  ...(hasta ? { lte: hasta } : {}),
});

// ============================================================================
//  VARIABLE DEPENDIENTE: PROCESO DE VENTAS
// ============================================================================

/**
 * POSTEST - Variable dependiente.
 * Calcula los nueve indicadores de las tres dimensiones del proceso de ventas
 * para el periodo solicitado.
 */
export const indicadoresProcesoVentas = async (fechaInicio?: Date, fechaFin?: Date) => {
  // ---------------------------------------------------------------------
  // Dimensión 1: Recepción y registro de pedidos
  // ---------------------------------------------------------------------
  const pedidos = await prisma.$queryRaw<
    {
      id: number;
      total: number;
      // Criterio de la tesis: un pedido es correcto si contiene identificación
      // del cliente, producto y cantidad, precio e importe, fecha y hora, y
      // dirección o modalidad de entrega.
      correctos: number;
      conError: number;
      tiempoRegistro: number | null;
      tiempoConfirmacion: number | null;
      tiempoAsignacion: number | null;
      cicloCompleto: number | null;
      // Trazabilidad: existe historial de estados con usuario y fecha.
      conTrazabilidad: number;
    }[]
  >`
    SELECT
      p.id AS id,
      1 AS total,
      CASE WHEN p.clienteId IS NOT NULL
            AND p.direccionEntrega IS NOT NULL AND p.direccionEntrega <> ''
            AND p.modalidadEntrega IS NOT NULL
            AND p.total > 0
            AND p.recibidoEn IS NOT NULL
            AND EXISTS (SELECT 1 FROM detalle_pedidos dp WHERE dp.pedidoId = p.id AND dp.cantidad > 0 AND dp.precioUnitario > 0)
       THEN 1 ELSE 0 END AS correctos,
      CASE WHEN p.requiereCorreccion = 1 THEN 1 ELSE 0 END AS conError,
      TIMESTAMPDIFF(SECOND, p.recibidoEn, p.registradoEn) AS tiempoRegistro,
      TIMESTAMPDIFF(SECOND, p.registradoEn, p.confirmadoEn) AS tiempoConfirmacion,
      TIMESTAMPDIFF(SECOND, p.confirmadoEn, p.asignadoEn) AS tiempoAsignacion,
      TIMESTAMPDIFF(SECOND, p.registradoEn, p.entregadoEn) AS cicloCompleto,
      CASE WHEN
            (SELECT COUNT(DISTINCT he.estadoNuevo) FROM historial_estados he
             WHERE he.tipo = 'PEDIDO' AND he.entidadId = p.id AND he.usuarioId IS NOT NULL AND he.fecha IS NOT NULL) >= 4
       THEN 1 ELSE 0 END AS conTrazabilidad
    FROM pedidos p
    WHERE p.registradoEn BETWEEN ${fechaInicio ?? new Date(0)} AND ${fechaFin ?? new Date()}
  `;

  // ---------------------------------------------------------------------
  // Dimensión 2: Procesamiento y control de ventas
  // ---------------------------------------------------------------------
  const ventas = await prisma.$queryRaw<
    {
      total: number;
      correctas: number;
      conError: number;
      tiempoProcesamiento: number | null;
      tiempoHastaPago: number | null;
    }[]
  >`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN v.estado <> 'ANULADA'
                AND EXISTS (SELECT 1 FROM detalle_ventas dv WHERE dv.ventaId = v.id AND dv.cantidad > 0 AND dv.precioUnitario > 0)
                AND v.total > 0
                AND EXISTS (SELECT 1 FROM pagos pg WHERE pg.ventaId = v.id AND pg.estado = 'REGISTRADO')
                AND v.constanciaEmitida = 1
           THEN 1 ELSE 0 END) AS correctas,
      SUM(CASE WHEN v.estado = 'ANULADA' THEN 1 ELSE 0 END) AS conError,
      AVG(TIMESTAMPDIFF(SECOND, p.confirmadoEn, v.creadoEn)) AS tiempoProcesamiento,
      -- Tiempo hasta el cobro: desde que se creó la venta hasta su primer pago
      -- válido. AVG descarta los NULL, así que solo entra lo ya cobrado.
      AVG(TIMESTAMPDIFF(SECOND, v.creadoEn, (
        SELECT MIN(pg2.fecha) FROM pagos pg2
        WHERE pg2.ventaId = v.id AND pg2.estado = 'REGISTRADO'
      ))) AS tiempoHastaPago
    FROM ventas v
    INNER JOIN pedidos p ON p.id = v.pedidoId
    WHERE v.fecha BETWEEN ${fechaInicio ?? new Date(0)} AND ${fechaFin ?? new Date()}
  `;

  // ---------------------------------------------------------------------
  // Dimensión 3: Atención y seguimiento de pedidos
  // ---------------------------------------------------------------------
  const atencion = await prisma.$queryRaw<
    {
      total: number;
      atendidos: number;
      conTrazabilidad: number;
      tiempoConfirmacionAsignacion: number | null;
      tiempoCiclo: number | null;
    }[]
  >`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN p.estado = 'ENTREGADO'
                AND p.entregadoEn IS NOT NULL
                AND EXISTS (SELECT 1 FROM entregas e WHERE e.pedidoId = p.id AND e.horaEntrega IS NOT NULL)
           THEN 1 ELSE 0 END) AS atendidos,
      SUM(CASE WHEN
            (SELECT COUNT(DISTINCT he.estadoNuevo) FROM historial_estados he
             WHERE he.tipo = 'PEDIDO' AND he.entidadId = p.id AND he.usuarioId IS NOT NULL AND he.fecha IS NOT NULL) >= 4
       THEN 1 ELSE 0 END) AS conTrazabilidad,
      AVG(TIMESTAMPDIFF(SECOND, p.registradoEn, p.asignadoEn)) AS tiempoConfirmacionAsignacion,
      AVG(TIMESTAMPDIFF(SECOND, p.registradoEn, p.entregadoEn)) AS tiempoCiclo
    FROM pedidos p
    WHERE p.registradoEn BETWEEN ${fechaInicio ?? new Date(0)} AND ${fechaFin ?? new Date()}
  `;

  // Pagos correctos sobre el total de ventas
  const pagos = await prisma.$queryRaw<{ total: number; correctos: number; montoIncorrecto: number }[]>`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN pg.monto > 0 AND pg.estado = 'REGISTRADO' THEN 1 ELSE 0 END) AS correctos,
      SUM(CASE WHEN pg.estado = 'ANULADO' THEN 1 ELSE 0 END) AS montoIncorrecto
    FROM pagos pg
    INNER JOIN ventas v ON v.id = pg.ventaId
    WHERE pg.fecha BETWEEN ${fechaInicio ?? new Date(0)} AND ${fechaFin ?? new Date()}
  `;

  // Entregas correctas sobre el total de entregas
  const entregas = await prisma.$queryRaw<{ total: number; correctas: number }[]>`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN e.estado = 'ENTREGADA' AND e.horaEntrega IS NOT NULL
                AND e.motivoNoEntrega IS NULL
           THEN 1 ELSE 0 END) AS correctas
    FROM entregas e
    WHERE e.fechaAsignacion BETWEEN ${fechaInicio ?? new Date(0)} AND ${fechaFin ?? new Date()}
  `;

  // Clientes con datos completos
  const clientes = await prisma.$queryRaw<{ total: number; completos: number }[]>`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN documento IS NOT NULL AND documento <> ''
                 AND nombre IS NOT NULL AND CHAR_LENGTH(nombre) > 2
                 AND telefono IS NOT NULL AND telefono <> ''
                 AND direccion IS NOT NULL AND direccion <> ''
           THEN 1 ELSE 0 END) AS completos
    FROM clientes
    WHERE eliminadoEn IS NULL
  `;

  // Actualización correcta del stock
  const inventario = await prisma.$queryRaw<{ total: number; correctos: number }[]>`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN
            (tipo = 'ENTRADA' AND stockResultante = stockAnterior + cantidad)
         OR (tipo = 'SALIDA'  AND stockResultante = stockAnterior - cantidad)
         OR (tipo = 'AJUSTE'  AND stockResultante = stockAnterior + cantidad)
           THEN 1 ELSE 0 END) AS correctos
    FROM movimientos_inventario
    WHERE fecha BETWEEN ${fechaInicio ?? new Date(0)} AND ${fechaFin ?? new Date()}
  `;

  // Envases (bidones) con información completa
  const envases = await prisma.$queryRaw<{ total: number; completos: number }[]>`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN pedidoId IS NOT NULL AND usuarioId IS NOT NULL AND cantidad > 0 THEN 1 ELSE 0 END) AS completos
    FROM movimientos_bidones
    WHERE fecha BETWEEN ${fechaInicio ?? new Date(0)} AND ${fechaFin ?? new Date()}
  `;

  // Tiempos de consulta medidos por la aplicación
  const consultas = await prisma.logConsulta.groupBy({
    by: ['tipoConsulta'],
    _avg: { duracionMs: true },
    _count: true,
    _min: { duracionMs: true },
    _max: { duracionMs: true },
  });

  const totalPedidos = pedidos.length;
  const totalVentas = Number(ventas[0]?.total ?? 0);

  return {
    periodo: {
      fechaInicio: fechaInicio ?? null,
      fechaFin: fechaFin ?? null,
    },
    muestra: {
      pedidos: totalPedidos,
      ventas: totalVentas,
      pagos: Number(pagos[0]?.total ?? 0),
      entregas: Number(entregas[0]?.total ?? 0),
      clientes: Number(clientes[0]?.total ?? 0),
    },

    // --- Dimensión 1: Recepción y registro de pedidos -----------------
    recepcionYRegistro: {
      tiempoPromedioRegistroMin: redondear(
        (pedidos.reduce((a, p) => a + Number(p.tiempoRegistro ?? 0), 0) /
          Math.max(1, pedidos.filter((p) => p.tiempoRegistro !== null).length)) /
          60,
      ),
      porcentajePedidosRegistradosCorrectamente: porcentaje(
        pedidos.reduce((a, p) => a + p.correctos, 0),
        totalPedidos,
      ),
      porcentajePedidosConErrores: porcentaje(
        pedidos.reduce((a, p) => a + p.conError, 0),
        totalPedidos,
      ),
    },

    // --- Dimensión 2: Procesamiento y control de ventas --------------
    procesamientoYControl: {
      tiempoPromedioProcesamientoVentaMin: redondear(
        (Number(ventas[0]?.tiempoProcesamiento ?? 0) / 60),
      ),
      porcentajeVentasProcesadasCorrectamente: porcentaje(
        Number(ventas[0]?.correctas ?? 0),
        totalVentas,
      ),
      porcentajeVentasConErrores: porcentaje(Number(ventas[0]?.conError ?? 0), totalVentas),
      porcentajeVentasConPagoRegistrado: porcentaje(
        Number(pagos[0]?.correctos ?? 0),
        Number(pagos[0]?.total ?? 0),
      ),
      porcentajeActualizacionCorrectaStock: porcentaje(
        Number(inventario[0]?.correctos ?? 0),
        Number(inventario[0]?.total ?? 0),
      ),
    },

    // --- Dimensión 3: Atención y seguimiento de pedidos --------------
    atencionYSeguimiento: {
      tiempoPromedioConfirmacionYAsignacionMin: redondear(
        (Number(atencion[0]?.tiempoConfirmacionAsignacion ?? 0) / 60),
      ),
      tiempoPromedioCicloCompletoMin: redondear(Number(atencion[0]?.tiempoCiclo ?? 0) / 60),
      porcentajePedidosAtendidosCorrectamente: porcentaje(
        Number(atencion[0]?.atendidos ?? 0),
        Number(atencion[0]?.total ?? 0),
      ),
      porcentajePedidosConTrazabilidadCompleta: porcentaje(
        Number(atencion[0]?.conTrazabilidad ?? 0),
        Number(atencion[0]?.total ?? 0),
      ),
      porcentajeEntregasRealizadas: porcentaje(
        Number(entregas[0]?.correctas ?? 0),
        Number(entregas[0]?.total ?? 0),
      ),
    },

    // --- Indicadores complementarios de la matriz --------------------
    complementarios: {
      porcentajeClientesConDatosCompletos: porcentaje(
        Number(clientes[0]?.completos ?? 0),
        Number(clientes[0]?.total ?? 0),
      ),
      porcentajeEnvasesConInformacionCompleta: porcentaje(
        Number(envases[0]?.completos ?? 0),
        Number(envases[0]?.total ?? 0),
      ),
      tiempoPromedioConsultaHistorialEnvasesMin: redondear(
        (consultas.find((c) => c.tipoConsulta === 'CONSULTA_HISTORIAL_BIDONES')?._avg.duracionMs ?? 0) /
          1000 /
          60,
        4,
      ),
      tiempoPromedioConsultaEnvasesSegundos: redondear(
        (consultas.find((c) => c.tipoConsulta === 'CONSULTA_HISTORIAL_BIDONES')?._avg.duracionMs ?? 0) / 1000,
        3,
      ),
      tiempoPromedioConsolidadoDiarioSegundos: redondear(
        (consultas.find((c) => c.tipoConsulta === 'CONSOLIDADO_DIARIO')?._avg.duracionMs ?? 0) / 1000,
        3,
      ),
    },
  };
};

// ============================================================================
//  VARIABLE INDEPENDIENTE: SISTEMA WEB
// ============================================================================

/**
 * POSTEST - Variable independiente.
 *
 * IMPORTANTE sobre la disponibilidad: el sistema no puede medir por sí mismo
 * el tiempo en que estuvo caído. El valor que se reporta es la disponibilidad
 * observada en el periodo de prueba, que debe confirmarse con el registro de
 * incidencias (tabla incidencias_sistema) y con las horas de la bitácora.
 */
export const indicadoresSistemaWeb = async (fechaInicio?: Date, fechaFin?: Date) => {
  // --- Adecuación funcional -------------------------------------------
  const requisitos = await prisma.requisitoFuncional.groupBy({
    by: ['implementado', 'aprobado'],
    _count: true,
  });

  const casos = await prisma.casoPrueba.groupBy({
    by: ['estado'],
    _count: true,
    _sum: { duracionMs: true },
  });

  const totalRequisitos = requisitos.reduce((a, r) => a + r._count, 0);
  const requisitosImplementados = requisitos
    .filter((r) => r.implementado && r.aprobado)
    .reduce((a, r) => a + r._count, 0);

  const totalCasos = casos.reduce((a, c) => a + c._count, 0);
  const casosAprobados = casos.find((c) => c.estado === 'APROBADO')?._count ?? 0;
  const casosFallidos = casos.find((c) => c.estado === 'FALLIDO')?._count ?? 0;

  // --- Eficiencia del desempeño --------------------------------------
  const desde = fechaInicio ?? new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const hasta = fechaFin ?? new Date();

  const [totalPeticiones, duraciones, minutos, tiposRuta] = await Promise.all([
    prisma.bitacoraHttp.count({ where: { fecha: intervalo(desde, hasta) } }),
    prisma.bitacoraHttp.findMany({
      where: { fecha: intervalo(desde, hasta) },
      select: { duracionMs: true },
      orderBy: { duracionMs: 'asc' },
    }),
    prisma.$queryRaw<{ minuto: string; total: number }[]>`
      SELECT DATE_FORMAT(fecha, '%Y-%m-%d %H:%i') AS minuto, COUNT(*) AS total
      FROM bitacora_http
      WHERE fecha BETWEEN ${desde} AND ${hasta}
      GROUP BY minuto
      ORDER BY total DESC
      LIMIT 1
    `,
    prisma.bitacoraHttp.groupBy({
      by: ['ruta'],
      where: { fecha: intervalo(desde, hasta) },
      _avg: { duracionMs: true },
      _max: { duracionMs: true },
      _count: true,
    }),
  ]);

  const tiempos = duraciones.map((d) => d.duracionMs).sort((a, b) => a - b);
  const mediana = tiempos.length ? tiempos[Math.floor(tiempos.length * 0.5)] : 0;
  const p95 = tiempos.length ? tiempos[Math.floor(tiempos.length * 0.95)] : 0;
  const p99 = tiempos.length ? tiempos[Math.floor(tiempos.length * 0.99)] : 0;
  const promedio = tiempos.length ? tiempos.reduce((a, b) => a + b, 0) / tiempos.length : 0;

  const minutosTranscurridos = Math.max(1, (hasta.getTime() - desde.getTime()) / 60000);

  // --- Fiabilidad -----------------------------------------------------
  const [errores, incidencias] = await Promise.all([
    prisma.bitacoraHttp.count({
      where: { fecha: intervalo(desde, hasta), esErrorServidor: true },
    }),
    prisma.incidenciaSistema.findMany({
      where: { inicio: intervalo(desde, hasta) },
      select: { estado: true, duracionMinutos: true, inicio: true, fin: true },
    }),
  ]);

  const incidenciasResueltas = incidencias.filter((i) => i.fin !== null);
  const minutosCaida = incidencias.reduce((a, i) => a + (i.duracionMinutos ?? 0), 0);
  const mttr = incidenciasResueltas.length
    ? redondear(
        incidenciasResueltas.reduce((a, i) => a + (i.duracionMinutos ?? 0), 0) / incidenciasResueltas.length,
      )
    : 0;

  return {
    periodo: { fechaInicio: desde, fechaFin: hasta },

    adecuacionFuncional: {
      porcentajeRequisitosImplementadosYApruebados: porcentaje(requisitosImplementados, totalRequisitos),
      totalRequisitos,
      requisitosAprobados: requisitosImplementados,
      porcentajeCasosDePruebaSuperados: porcentaje(casosAprobados, totalCasos),
      totalCasosEjecutados: totalCasos,
      casosAprobados,
      casosFallidos,
      porcentajeTransaccionesConResultadoEsperado: porcentaje(casosAprobados, totalCasos),
    },

    eficienciaDesempeno: {
      tiempoRespuestaPromedioMs: redondear(promedio),
      tiempoRespuestaMedianaMs: mediana,
      tiempoRespuestaP95Ms: p95,
      tiempoRespuestaP99Ms: p99,
      rendimientoTransaccionesPorMinuto: redondear(totalPeticiones / minutosTranscurridos),
      picoTransaccionesPorMinuto: Number(minutos[0]?.total ?? 0),
      totalPeticiones,
      duracionPromedioPorRuta: tiposRuta
        .map((r) => ({ ruta: r.ruta, promedioMs: redondear(r._avg.duracionMs ?? 0), maximoMs: r._max.duracionMs, peticiones: r._count }))
        .sort((a, b) => b.promedioMs - a.promedioMs)
        .slice(0, 15),
    },

    fiabilidad: {
      porcentajeSolicitudesFallidas: porcentaje(errores, totalPeticiones),
      solicitudesFallidas: errores,
      tiempoMedioRecuperacionMin: mttr,
      incidenciasRegistradas: incidencias.length,
      incidenciasResueltas: incidenciasResueltas.length,
      minutosTotalesDeIndisponibilidad: minutosCaida,
      porcentajeDisponibilidadObservado: porcentaje(
        minutosTranscurridos - minutosCaida,
        minutosTranscurridos,
      ),
    },
  };
};

/**
 * Comparación pretest / postest.
 *
 * El pretest proviene de la ficha de observación aplicada al proceso manual
 * (se registra como línea base). El postest lo calcula este módulo desde los
 * datos reales del sistema. Este endpoint devuelve ambos lado a lado, listo
 * para las tablas del capítulo de resultados.
 */
/**
 * LÍNEA BASE DEL PRETEST
 *
 * Valores de la ficha de observación aplicada al proceso manual, antes de
 * implementar el sistema. Los tiempos provienen de la medición directa
 * declarada en la tesis (registro ~5 min, procesamiento >10 min, confirmación
 * 3-5 min más asignación ~5 min).
 *
 * Los porcentajes correctos quedan en `null` hasta cargar el conteo de la
 * ficha: mientras no haya dato observado, la comparación devuelve `null` en
 * vez de inventar una cifra.
 */
export const PRETEST_BASE: ParametrosPretest = {
  tiempoRegistroMin: 5,
  tiempoProcesamientoVentaMin: 10,
  tiempoConfirmacionAsignacionMin: 8,
  porcentajePedidosCorrectos: null,
  porcentajeVentasCorrectas: null,
  porcentajePedidosAtendidos: null,
  porcentajeTrazabilidadCompleta: null,
};

export interface ParametrosPretest {
  tiempoRegistroMin?: number | null;
  tiempoProcesamientoVentaMin?: number | null;
  tiempoConfirmacionAsignacionMin?: number | null;
  porcentajePedidosCorrectos?: number | null;
  porcentajeVentasCorrectas?: number | null;
  porcentajePedidosAtendidos?: number | null;
  porcentajeTrazabilidadCompleta?: number | null;
}

export const compararPretestPostest = async (
  pretest: ParametrosPretest = PRETEST_BASE,
  fechaInicio?: Date,
  fechaFin?: Date,
) => {
  const postest = await indicadoresProcesoVentas(fechaInicio, fechaFin);
  const sistema = await indicadoresSistemaWeb(fechaInicio, fechaFin);

  const comparacion = (antes: number | null | undefined, despues: number, unidad: string) => {
    if (antes === undefined || antes === null) {
      return { antes: null, despues, unidad, diferencia: null, variacionPorcentual: null };
    }
    const diferencia = redondear(despues - antes);
    return {
      antes,
      despues,
      unidad,
      diferencia,
      variacionPorcentual: antes === 0 ? null : redondear(((despues - antes) / antes) * 100),
    };
  };

  return {
    pretest,
    postest,
    sistema,
    comparacion: {
      // Los tiempos se miden en minutos en ambas mediciones.
      tiempoPromedioRegistro: comparacion(
        pretest.tiempoRegistroMin,
        postest.recepcionYRegistro.tiempoPromedioRegistroMin,
        'minutos',
      ),
      tiempoPromedioProcesamientoVenta: comparacion(
        pretest.tiempoProcesamientoVentaMin,
        postest.procesamientoYControl.tiempoPromedioProcesamientoVentaMin,
        'minutos',
      ),
      tiempoPromedioConfirmacionYAsignacion: comparacion(
        pretest.tiempoConfirmacionAsignacionMin,
        postest.atencionYSeguimiento.tiempoPromedioConfirmacionYAsignacionMin,
        'minutos',
      ),
      porcentajePedidosRegistradosCorrectamente: comparacion(
        pretest.porcentajePedidosCorrectos,
        postest.recepcionYRegistro.porcentajePedidosRegistradosCorrectamente,
        '%',
      ),
      porcentajeVentasProcesadasCorrectamente: comparacion(
        pretest.porcentajeVentasCorrectas,
        postest.procesamientoYControl.porcentajeVentasProcesadasCorrectamente,
        '%',
      ),
      porcentajePedidosAtendidosCorrectamente: comparacion(
        pretest.porcentajePedidosAtendidos,
        postest.atencionYSeguimiento.porcentajePedidosAtendidosCorrectamente,
        '%',
      ),
      porcentajePedidosConTrazabilidadCompleta: comparacion(
        pretest.porcentajeTrazabilidadCompleta,
        postest.atencionYSeguimiento.porcentajePedidosConTrazabilidadCompleta,
        '%',
      ),
    },
  };
};

/**
 * Exporta los indicadores a una tabla plana lista para pegar en el capítulo
 * de resultados de la tesis.
 */
export const exportarIndicadores = async (fechaInicio?: Date, fechaFin?: Date) => {
  const proceso = await indicadoresProcesoVentas(fechaInicio, fechaFin);
  const sistema = await indicadoresSistemaWeb(fechaInicio, fechaFin);

  const filas = [
    { variable: 'Sistema web', dimension: 'Adecuación funcional', indicador: '% de requisitos funcionales implementados y aprobados', valor: sistema.adecuacionFuncional.porcentajeRequisitosImplementadosYApruebados, unidad: '%' },
    { variable: 'Sistema web', dimension: 'Adecuación funcional', indicador: '% de casos de prueba funcional superados', valor: sistema.adecuacionFuncional.porcentajeCasosDePruebaSuperados, unidad: '%' },
    { variable: 'Sistema web', dimension: 'Adecuación funcional', indicador: '% de transacciones con el resultado esperado', valor: sistema.adecuacionFuncional.porcentajeTransaccionesConResultadoEsperado, unidad: '%' },
    { variable: 'Sistema web', dimension: 'Eficiencia del desempeño', indicador: 'Tiempo de respuesta (mediana)', valor: sistema.eficienciaDesempeno.tiempoRespuestaMedianaMs, unidad: 'ms' },
    { variable: 'Sistema web', dimension: 'Eficiencia del desempeño', indicador: 'Tiempo de respuesta (percentil 95)', valor: sistema.eficienciaDesempeno.tiempoRespuestaP95Ms, unidad: 'ms' },
    { variable: 'Sistema web', dimension: 'Eficiencia del desempeño', indicador: 'Rendimiento (transacciones por minuto)', valor: sistema.eficienciaDesempeno.rendimientoTransaccionesPorMinuto, unidad: 'trans/min' },
    { variable: 'Sistema web', dimension: 'Fiabilidad', indicador: '% de solicitudes fallidas (5xx)', valor: sistema.fiabilidad.porcentajeSolicitudesFallidas, unidad: '%' },
    { variable: 'Sistema web', dimension: 'Fiabilidad', indicador: 'Tiempo medio de recuperación (MTTR)', valor: sistema.fiabilidad.tiempoMedioRecuperacionMin, unidad: 'min' },
    { variable: 'Sistema web', dimension: 'Fiabilidad', indicador: '% de disponibilidad observada', valor: sistema.fiabilidad.porcentajeDisponibilidadObservado, unidad: '%' },
    { variable: 'Proceso de ventas', dimension: 'Recepción y registro de pedidos', indicador: 'Tiempo promedio de registro de un pedido', valor: proceso.recepcionYRegistro.tiempoPromedioRegistroMin, unidad: 'min' },
    { variable: 'Proceso de ventas', dimension: 'Recepción y registro de pedidos', indicador: '% de pedidos registrados correctamente', valor: proceso.recepcionYRegistro.porcentajePedidosRegistradosCorrectamente, unidad: '%' },
    { variable: 'Proceso de ventas', dimension: 'Recepción y registro de pedidos', indicador: '% de pedidos con errores de registro', valor: proceso.recepcionYRegistro.porcentajePedidosConErrores, unidad: '%' },
    { variable: 'Proceso de ventas', dimension: 'Procesamiento y control de ventas', indicador: 'Tiempo promedio de procesamiento de una venta', valor: proceso.procesamientoYControl.tiempoPromedioProcesamientoVentaMin, unidad: 'min' },
    { variable: 'Proceso de ventas', dimension: 'Procesamiento y control de ventas', indicador: '% de ventas procesadas correctamente', valor: proceso.procesamientoYControl.porcentajeVentasProcesadasCorrectamente, unidad: '%' },
    { variable: 'Proceso de ventas', dimension: 'Procesamiento y control de ventas', indicador: '% de ventas con pago registrado correctamente', valor: proceso.procesamientoYControl.porcentajeVentasConPagoRegistrado, unidad: '%' },
    { variable: 'Proceso de ventas', dimension: 'Procesamiento y control de ventas', indicador: '% de actualización correcta del stock', valor: proceso.procesamientoYControl.porcentajeActualizacionCorrectaStock, unidad: '%' },
    { variable: 'Proceso de ventas', dimension: 'Atención y seguimiento de pedidos', indicador: 'Tiempo promedio de confirmación y asignación', valor: proceso.atencionYSeguimiento.tiempoPromedioConfirmacionYAsignacionMin, unidad: 'min' },
    { variable: 'Proceso de ventas', dimension: 'Atención y seguimiento de pedidos', indicador: '% de pedidos atendidos correctamente', valor: proceso.atencionYSeguimiento.porcentajePedidosAtendidosCorrectamente, unidad: '%' },
    { variable: 'Proceso de ventas', dimension: 'Atención y seguimiento de pedidos', indicador: '% de pedidos con trazabilidad completa', valor: proceso.atencionYSeguimiento.porcentajePedidosConTrazabilidadCompleta, unidad: '%' },
    { variable: 'Proceso de ventas', dimension: 'Atención y seguimiento de pedidos', indicador: '% de pedidos entregados correctamente', valor: proceso.atencionYSeguimiento.porcentajeEntregasRealizadas, unidad: '%' },
    { variable: 'Proceso de ventas', dimension: 'Gestión de clientes y envases', indicador: '% de clientes con datos completos', valor: proceso.complementarios.porcentajeClientesConDatosCompletos, unidad: '%' },
    { variable: 'Proceso de ventas', dimension: 'Gestión de clientes y envases', indicador: '% de envases con información completa', valor: proceso.complementarios.porcentajeEnvasesConInformacionCompleta, unidad: '%' },
    { variable: 'Proceso de ventas', dimension: 'Gestión de clientes y envases', indicador: 'Tiempo promedio de consulta del historial de envases', valor: proceso.complementarios.tiempoPromedioConsultaEnvasesSegundos, unidad: 'seg' },
    { variable: 'Proceso de ventas', dimension: 'Control de ventas', indicador: 'Tiempo promedio para obtener el consolidado diario', valor: proceso.complementarios.tiempoPromedioConsolidadoDiarioSegundos, unidad: 'seg' },
  ];

  return { filas, generadoEn: new Date() };
};
