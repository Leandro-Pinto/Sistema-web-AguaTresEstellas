import { z } from 'zod';

/** Parámetros de paginación y ordenamiento comunes a todos los listados. */
export const paginacionSchema = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(10),
  orden: z.enum(['asc', 'desc']).default('desc'),
  ordenarPor: z.string().optional(),
});

/** Filtro por rango de fechas de los reportes. */
export const rangoFechasSchema = z
  .object({
    fechaInicio: z.coerce.date(),
    fechaFin: z.coerce.date(),
  })
  .refine((d) => d.fechaFin >= d.fechaInicio, {
    message: 'La fecha final no puede ser anterior a la fecha inicial',
    path: ['fechaFin'],
  });

export const idSchema = z.object({
  id: z.coerce.number().int().positive('El identificador debe ser un número positivo'),
});

/**
 * Identificador de cliente en la URL.
 *
 * Existe aparte de `idSchema` porque la ruta se declara como
 * `/clientes/:clienteId/...`. Aplicar `idSchema` ahí validaría un campo
 * `params.id` inexistente y rechazaría siempre la petición.
 */
export const clienteIdSchema = z.object({
  clienteId: z.coerce.number().int().positive('El cliente debe ser un número positivo'),
});

/**
 * Teléfono peruano: 9 dígitos con prefijo opcional 51/01.
 * Se acepta también el formato con espacios para pegarlo desde WhatsApp.
 */
export const telefonoSchema = z
  .string()
  .trim()
  .min(6, 'El teléfono es obligatorio')
  .max(20)
  .transform((v) => v.replace(/\s+/g, ''))
  .refine((v) => /^(51|01)?9\d{8}$/.test(v), {
    message: 'Ingrese un teléfono válido de 9 dígitos (ejemplo: 900123456)',
  });

export const documentoSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(6, 'El documento es obligatorio')
  .max(20)
  .refine((v) => /^[A-Z0-9-]+$/.test(v), {
    message: 'El documento solo puede contener letras, números y guiones',
  });

export const dineroSchema = z.coerce
  .number({ invalid_type_error: 'El monto debe ser numérico' })
  .min(0, 'El monto no puede ser negativo')
  .max(9_999_999.99);

export const cantidadSchema = z.coerce
  .number({ invalid_type_error: 'La cantidad debe ser numérica' })
  .int('La cantidad debe ser un número entero')
  .positive('La cantidad debe ser mayor que cero')
  .max(9999);

export const textoOpcional = (max = 255) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .optional()
    .nullable()
    .transform((v) => (v === '' ? null : v));

export const textoObligatorio = (max = 100, campo = 'El campo') =>
  z
    .string()
    .trim()
    .min(1, `${campo} es obligatorio`)
    .max(max, `Máximo ${max} caracteres`);

export const idSchemaId = idSchema;
export type IdParams = z.infer<typeof idSchema>;
