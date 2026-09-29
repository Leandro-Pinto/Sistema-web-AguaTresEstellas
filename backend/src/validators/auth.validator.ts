import { z } from 'zod';
import { textoObligatorio } from './comunes.validator';

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Ingrese un correo electrónico válido'),
  password: z.string().min(1, 'Ingrese su contraseña'),
  recordar: z.boolean().default(false),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10, 'Token de sesión no válido'),
});

export const perfilSchema = z.object({
  nombres: textoObligatorio(100, 'Los nombres').optional(),
  apellidos: textoObligatorio(100, 'Los apellidos').optional(),
  telefono: z.string().trim().max(20).optional().nullable(),
  email: z.string().trim().toLowerCase().email('Correo inválido').optional(),
});

export const cambiarPasswordSchema = z.object({
  passwordActual: z.string().min(1, 'Ingrese su contraseña actual'),
  passwordNueva: z
    .string()
    .min(8, 'La nueva contraseña debe tener al menos 8 caracteres')
    .max(100),
});

export type LoginInput = z.infer<typeof loginSchema>;
