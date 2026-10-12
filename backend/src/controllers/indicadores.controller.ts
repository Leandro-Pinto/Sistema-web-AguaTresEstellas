import type { Request, Response } from 'express';
import { responder } from '../middlewares/respuesta';
import { asyncHandler } from '../utils/asyncHandler';
import {
  compararPretestPostest,
  exportarIndicadores,
  guardarLineaBase,
  indicadoresProcesoVentas,
  indicadoresSistemaWeb,
  leerRegistroLineaBase,
  type ParametrosPretest,
} from '../services/indicadores.service';
import { rangoPorDefecto, resolverRango } from '../utils/fechas';
import { responderCsv } from '../utils/exportar';
import { origenSolicitado } from '../services/origen-dato';

/**
 * INDICADORES DE LA TESIS
 *
 * Expone los tres bloques que alimentan las tablas de resultados:
 *   - proceso: eficiencia y tiempos del circuito de venta (variable dependiente)
 *   - sistema: adecuación, eficiencia y fiabilidad (variable independiente)
 *   - comparativo: postest contra la línea base del pretest, transcrita de la
 *     ficha de observación y guardada con autor y fecha. Lo que no se midió
 *     es `null` y la interfaz lo muestra como "sin dato"
 */

/** Lee el rango pedido; sin parámetros devuelve undefined para que el
 *  servicio use "todo el histórico", que es lo útil durante las pruebas. */
const rangoOpcional = (req: Request): [Date?, Date?] => {
  const { fechaInicio, fechaFin } = req.query as unknown as {
    fechaInicio?: string;
    fechaFin?: string;
  };
  if (!fechaInicio && !fechaFin) return [];
  const rango = resolverRango(fechaInicio, fechaFin);
  return [rango.fechaInicio, rango.fechaFin];
};

/**
 * Origen de los datos a medir, ya validado contra el entorno.
 *
 * Por omisión los indicadores del proceso leen solo `REAL`. Se acepta el
 * parámetro porque en el entorno de demostración hay que poder ver el conjunto
 * simulado, y porque dejar la decisión en la URL hace explícito, en la propia
 * petición, que la lectura no es la de producción.
 */
const origenDesde = (req: Request) => {
  const { origen } = req.query as unknown as { origen?: string };
  return origenSolicitado(origen);
};

/** Mensaje con la nota de origen, cuando el pedido fue corregido. */
const conNota = (mensaje: string, nota?: string): string => (nota ? `${mensaje}. ${nota}` : mensaje);

export const proceso = asyncHandler(async (req: Request, res: Response) => {
  const [fechaInicio, fechaFin] = rangoOpcional(req);
  const { origen, nota } = origenDesde(req);
  const resultado = await indicadoresProcesoVentas(fechaInicio, fechaFin, origen);
  return responder(res, resultado, conNota('Indicadores del proceso de ventas obtenidos', nota));
});

export const sistema = asyncHandler(async (req: Request, res: Response) => {
  const [fechaInicio, fechaFin] = rangoOpcional(req);
  const resultado = await indicadoresSistemaWeb(fechaInicio, fechaFin);
  return responder(res, resultado, 'Indicadores del sistema web obtenidos');
});

/** Comparativa pretest/postest. La línea base la fija el administrador. */
export const comparativo = asyncHandler(async (req: Request, res: Response) => {
  const [fechaInicio, fechaFin] = rangoOpcional(req);
  const { origen, nota } = origenDesde(req);
  const resultado = await compararPretestPostest(fechaInicio, fechaFin, origen);
  return responder(res, resultado, conNota('Comparativa pretest/postest generada', nota));
});

/**
 * Estado de la línea base del pretest.
 *
 * Devuelve los nueve valores más su procedencia. Si nunca se registró, los
 * valores son `null` y `registrada` es `false`: la pantalla puede entonces
 * distinguir "todavía no se midió" de "se midió y dio cero", que son dos
 * afirmaciones distintas sobre el proceso manual.
 */
export const pretest = asyncHandler(async (_req: Request, res: Response) =>
  responder(
    res,
    await leerRegistroLineaBase(),
    'Línea base del pretest obtenida',
  ),
);

/**
 * Transcribe la ficha de observación y la guarda.
 *
 * Reservado al administrador: la línea base es la referencia contra la que se
 * interpreta todo el postest, así que no debe poder cambiarla cualquiera. El
 * servicio devuelve el registro completo para que la respuesta incluya la
 * procedencia recién escrita.
 */
export const guardarPretest = asyncHandler(async (req: Request, res: Response) => {
  const registro = await guardarLineaBase(req.body as ParametrosPretest, req.usuario!.id);
  return responder(res, registro, 'Línea base del pretest guardada');
});

/** Período evaluado por defecto: los últimos 30 días. */
export const periodo = asyncHandler(async (_req: Request, res: Response) =>
  responder(res, rangoPorDefecto(30), 'Período de evaluación por defecto obtenido'),
);

export const exportar = asyncHandler(async (req: Request, res: Response) => {
  const [fechaInicio, fechaFin] = rangoOpcional(req);
  const { origen } = origenDesde(req);
  const contenido = await exportarIndicadores(fechaInicio, fechaFin, origen);
  return responderCsv(res, 'indicadores_tesis', contenido);
});
