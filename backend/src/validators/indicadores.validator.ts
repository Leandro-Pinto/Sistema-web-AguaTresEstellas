import { z } from 'zod';

/**
 * LÍNEA BASE DEL PRETEST
 *
 * Los nueve valores se transcriben de la ficha de observación del proceso
 * manual (Anexos 3 y 4). El sistema no los calcula: solo los recibe, los
 * valida y los guarda con autor y fecha.
 *
 * Dos reglas reflejan eso:
 *   - Todo campo es opcional y anulable. Un vacío significa "no se midió" y
 *     se almacena como `NULL`, que el comparativo presenta como "sin dato".
 *     Un 0 sí sería una medición, por eso está admitido pero acotado.
 *   - `strict()` rechaza campos desconocidos: una clave mal escrita debe
 *     fallar con un 422 antes que quedar silenciosamente fuera del registro.
 */

const minutos = z
  .number({ invalid_type_error: 'El tiempo debe ser numérico' })
  .finite('El tiempo debe ser un número finito')
  .min(0, 'El tiempo no puede ser negativo')
  .max(1440, 'El tiempo no puede superar 1440 minutos (24 horas)')
  .nullish();

const porcentaje = z
  .number({ invalid_type_error: 'El porcentaje debe ser numérico' })
  .finite('El porcentaje debe ser un número finito')
  .min(0, 'El porcentaje no puede ser menor que 0')
  .max(100, 'El porcentaje no puede superar 100')
  .nullish();

export const pretestSchema = z
  .object({
    tiempoRegistroMin: minutos,
    tiempoProcesamientoVentaMin: minutos,
    tiempoConfirmacionAsignacionMin: minutos,
    porcentajePedidosCorrectos: porcentaje,
    porcentajeVentasCorrectas: porcentaje,
    porcentajeVentasConErrores: porcentaje,
    porcentajePedidosAtendidos: porcentaje,
    porcentajePedidosConErrores: porcentaje,
    porcentajeTrazabilidadCompleta: porcentaje,
  })
  .strict();

export type PretestBody = z.infer<typeof pretestSchema>;
