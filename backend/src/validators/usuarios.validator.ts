import { z } from 'zod';
import { paginacionSchema, textoObligatorio, textoOpcional } from './comunes.validator';

export const crearUsuarioSchema = z.object({
  nombres: textoObligatorio(100, 'Los nombres'),
  apellidos: textoObligatorio(100, 'Los apellidos'),
  email: z.string().trim().toLowerCase().email('El correo electrónico no es válido'),
  /// Documento de identidad. Necesario para el rol REPARTIDOR: es la llave
  /// que vincula al usuario de la aplicación con el repartidor que entrega.
  documento: textoOpcional(20),
  telefono: textoOpcional(20),
  password: z
    .string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres')
    .max(100),
  rolId: z.coerce.number().int().positive('Debe seleccionar un rol'),
  activo: z.boolean().default(true),
  debeCambiarPassword: z.boolean().default(false),
});

export const actualizarUsuarioSchema = z.object({
  nombres: textoObligatorio(100, 'Los nombres').optional(),
  apellidos: textoObligatorio(100, 'Los apellidos').optional(),
  email: z.string().trim().toLowerCase().email('El correo electrónico no es válido').optional(),
  documento: textoOpcional(20),
  telefono: textoOpcional(20),
  rolId: z.coerce.number().int().positive().optional(),
  activo: z.boolean().optional(),
  debeCambiarPassword: z.boolean().optional(),
});

export const cambiarPasswordSchema = z
  .object({
    passwordActual: z.string().min(1, 'Debe indicar su contraseña actual'),
    passwordNueva: z
      .string()
      .min(8, 'La nueva contraseña debe tener al menos 8 caracteres')
      .max(100),
  })
  .refine((d) => d.passwordActual !== d.passwordNueva, {
    message: 'La nueva contraseña debe ser distinta de la actual',
    path: ['passwordNueva'],
  });

export const resetPasswordSchema = z.object({
  passwordNueva: z
    .string()
    .min(8, 'La nueva contraseña debe tener al menos 8 caracteres')
    .max(100),
  debeCambiarPassword: z.boolean().default(false),
});

export const listarUsuariosSchema = paginacionSchema.extend({
  busqueda: textoOpcional(100),
  rolId: z.coerce.number().int().positive().optional(),
  activo: z.enum(['true', 'false', 'todos']).default('todos'),
  incluirEliminados: z.enum(['true', 'false']).default('false'),
});

// --- ROLES ----------------------------------------------------------

export const listarRolesSchema = paginacionSchema.extend({
  busqueda: textoOpcional(100),
  activo: z.enum(['true', 'false', 'todos']).default('todos'),
});

export const crearRolSchema = z.object({
  nombre: textoObligatorio(50, 'El nombre del rol'),
  descripcion: textoOpcional(255),
  nivel: z.coerce.number().int().min(1).max(9).default(3),
  activo: z.boolean().default(true),
});

export const actualizarRolSchema = crearRolSchema.partial();

export const cambiarEstadoSchema = z.object({
  activo: z.boolean(),
});

export type CrearUsuarioInput = z.infer<typeof crearUsuarioSchema>;
export type ActualizarUsuarioInput = z.infer<typeof actualizarUsuarioSchema>;
export type ListarUsuariosQuery = z.infer<typeof listarUsuariosSchema>;
