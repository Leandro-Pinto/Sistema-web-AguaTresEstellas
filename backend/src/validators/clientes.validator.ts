import { z } from 'zod';
import {
  dineroSchema,
  documentoSchema,
  paginacionSchema,
  telefonoSchema,
  textoObligatorio,
  textoOpcional,
} from './comunes.validator';

const emailOpcional = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  z
    .string()
    .trim()
    .toLowerCase()
    .email('El correo electrónico no es válido')
    .nullable()
    .optional(),
);

const clienteBaseSchema = z.object({
  tipo: z.enum(['PERSONA', 'EMPRESA', 'INSTITUCION']).default('PERSONA'),
  documento: documentoSchema,
  nombres: textoOpcional(100),
  razonSocial: textoOpcional(150),
  telefono: telefonoSchema,
  telefonoAlt: textoOpcional(20),
  email: emailOpcional,
  direccion: textoObligatorio(200, 'La dirección'),
  referencia: textoOpcional(200),
  distrito: textoOpcional(80),
  limiteCredito: dineroSchema.default(0),
  notas: textoOpcional(1000),
  activo: z.boolean().default(true),
});

/**
 * Reglas de coherencia entre tipo de cliente y sus datos.
 * Evita la observación habitual del proceso manual: clientes registrados
 * sin razón social o sin nombre, que luego no se pueden facturar ni cobrar.
 */
export const crearClienteSchema = clienteBaseSchema.superRefine((datos, ctx) => {
  if (datos.tipo === 'PERSONA') {
    if (!datos.nombres) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['nombres'],
        message: 'Los nombres son obligatorios para personas',
      });
    }
    if (datos.razonSocial) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['razonSocial'],
        message: 'Una persona natural no registra razón social',
      });
    }
  } else {
    if (!datos.razonSocial) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['razonSocial'],
        message: 'La razón social es obligatoria para empresas e instituciones',
      });
    }
    if (datos.tipo === 'EMPRESA' && datos.documento.length !== 11) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['documento'],
        message: 'El RUC debe tener 11 dígitos',
      });
    }
  }
});

export const actualizarClienteSchema = clienteBaseSchema.partial();

export const listarClientesSchema = paginacionSchema.extend({
  busqueda: textoOpcional(100),
  tipo: z.enum(['PERSONA', 'EMPRESA', 'INSTITUCION', 'todos']).default('todos'),
  activo: z.enum(['true', 'false', 'todos']).default('todos'),
  distrito: textoOpcional(80),
  soloConSaldo: z.enum(['true', 'false']).default('false'),
  incluirEliminados: z.enum(['true', 'false']).default('false'),
});

export type CrearClienteInput = z.infer<typeof crearClienteSchema>;
export type ActualizarClienteInput = z.infer<typeof actualizarClienteSchema>;
export type ListarClientesQuery = z.infer<typeof listarClientesSchema>;
