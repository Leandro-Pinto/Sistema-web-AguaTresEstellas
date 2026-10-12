/**
 * Procedencia de los registros operativos.
 *
 * La operación real de la empresa produce datos `REAL`. El simulador produce
 * datos `SIMULADO` para demostraciones y pruebas de carga. La distinción vive
 * en cada tabla operativa y se propaga al historial, de modo que un dato
 * sintético nunca pueda entrar en un indicador como si documentara el
 * postest.
 *
 * Los servicios reciben el origen como opción y no como parte de la entrada
 * validada por HTTP: la API nunca acepta que un cliente se atribuya a sí mismo
 * un registro real o simulado.
 */
import { OrigenDato } from '@prisma/client';
import { config } from '../config';
import { ErrorValidacion } from '../utils/errors';

export interface OpcionesOrigen {
  /** Procedencia del registro. Si se omite, el registro se toma como real. */
  origen?: OrigenDato;
}

/** Resuelve el origen efectivo, por defecto `REAL`. */
export const origenDe = (opciones?: OpcionesOrigen): OrigenDato => opciones?.origen ?? 'REAL';

/**
 * Origen que se lee al calcular indicadores y reportes.
 *
 * En `prod` y `test` es `REAL`: una medición solo puede salir de la operación
 * real. En `demo` es `SIMULADO`, porque si allí se leyera únicamente lo real la
 * demostración no tendría nada que enseñar. La excepción está acotada por la
 * base de datos: el entorno `demo` solo arranca contra una base terminada en
 * `_demo`, así que el origen por omisión nunca elige datos reales fuera de ella.
 */
export const ORIGEN_POR_DEFECTO: OrigenDato = config.entorno === 'demo' ? 'SIMULADO' : 'REAL';

/**
 * Comprueba si se puede pedir la mezcla de datos reales y simulados.
 *
 * Solo en demostración. En producción, un `SIMULADO` que se colara en un
 * indicador sería un resultado que la empresa nunca produjo, que es justo lo
 * que la tesis no puede presentar.
 */
export const permiteOrigenSimulado = (): boolean => config.entorno === 'demo';

/**
 * Filtro de origen para las tablas que no llevan columna propia.
 *
 * Los movimientos de inventarios y de envases no guardan la procedencia: son
 * entradas y salidas de almacén, no pasos del proceso de ventas. Lo que sí
 * existe es el pedido que los provocó, y ese es el registro que el simulador
 * firma como `SIMULADO`.
 *
 * Los movimientos sin pedido —una compra, un ajuste de saldo, una pérdida
 * interna— se dejan entrar en los dos conjuntos: también existen en la operación
 * real, y excluirlos dejaría el saldo de envases incompleto en producción.
 */
export const filtroOrigenPorPedido = (
  origen: OrigenDato = ORIGEN_POR_DEFECTO,
): { OR: { pedidoId: null }[] | ({ pedidoId: null } | { pedido: { origen: OrigenDato } })[] } => ({
  OR: [{ pedidoId: null }, { pedido: { origen } }],
});

/**
 * Filtro de origen para una consulta de Prisma.
 *
 * Se aplica por omisión en todos los reportes e indicadores, de manera que
 * un dato sintético solo entra si alguien lo pide a propósito y ese alguien
 * está en un entorno que lo permite.
 */
export const filtroOrigen = (origen: OrigenDato = ORIGEN_POR_DEFECTO): { origen: OrigenDato } => ({
  origen,
});

/**
 * Origen solicitado por el cliente, ya validado.
 *
 * La API no acepta que quien llama decida libremente si su lectura es real o
 * simulada: si se pide lo que el entorno prohíbe, se responde con el origen
 * permitido y una nota, en lugar de servir la mezcla.
 */
export const origenSolicitado = (
  solicitado: string | undefined,
  porDefecto: OrigenDato = ORIGEN_POR_DEFECTO,
): { origen: OrigenDato; nota?: string } => {
  if (!solicitado) return { origen: porDefecto };
  const normalizado = solicitado.toUpperCase();
  if (normalizado !== 'REAL' && normalizado !== 'SIMULADO') {
    throw new ErrorValidacion(
      `Origen desconocido: "${solicitado}". Solo se admiten REAL y SIMULADO.`,
    );
  }
  if (normalizado === 'SIMULADO' && !permiteOrigenSimulado()) {
    return {
      origen: porDefecto,
      nota:
        `Se ignoró origen=SIMULADO porque el entorno es "${config.entorno}". ` +
        'Los datos simulados solo se muestran en el entorno de demostración.',
    };
  }
  return { origen: normalizado };
};