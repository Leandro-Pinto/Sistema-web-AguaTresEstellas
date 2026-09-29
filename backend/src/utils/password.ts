import bcrypt from 'bcryptjs';
import { config } from '../config/env';

export const hashPassword = (password: string): Promise<string> =>
  bcrypt.hash(password, config.bcryptSaltRounds);

export const compararPassword = (password: string, hash: string): Promise<boolean> =>
  bcrypt.compare(password, hash);

/**
 * Política de contraseñas. Se aplica tanto al crear usuarios como al cambiar.
 * Mensajes en español porque los usuarios finales son personal de la empresa.
 */
export function validarFortalezaPassword(password: string): string | null {
  if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres';
  if (!/[A-Z]/.test(password)) return 'La contraseña debe incluir al menos una mayúscula';
  if (!/[a-z]/.test(password)) return 'La contraseña debe incluir al menos una minúscula';
  if (!/\d/.test(password)) return 'La contraseña debe incluir al menos un número';
  return null;
}
