import type { Request, Response } from 'express';
import { responder } from '../middlewares/respuesta';
import { asyncHandler } from '../utils/asyncHandler';
import * as authService from '../services/auth.service';
import * as usuariosService from '../services/usuarios.service';
import { validarFortalezaPassword } from '../utils/password';
import { ErrorReglaNegocio } from '../utils/errors';
import type { LoginInput } from '../validators/auth.validator';

export const login = asyncHandler(async (req: Request, res: Response) => {
  const datos = req.body as LoginInput;
  const resultado = await authService.iniciarSesion(datos, req.ip ?? null);
  return responder(res, resultado, 'Inicio de sesión correcto');
});

export const refrescar = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body as { refreshToken: string };
  const resultado = await authService.renovarToken(refreshToken);
  return responder(res, resultado, 'Sesión renovada');
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  await authService.cerrarSesion(req.usuario!.id);
  return responder(res, null, 'Sesión cerrada correctamente');
});

export const perfil = asyncHandler(async (req: Request, res: Response) => {
  const datos = await authService.obtenerPerfil(req.usuario!.id);
  return responder(res, datos, 'Perfil obtenido');
});

export const actualizarPerfil = asyncHandler(async (req: Request, res: Response) => {
  // El usuario solo puede editar su propio perfil: se reutiliza el servicio de
  // usuarios, que además sabe reconstruir el nombre completo.
  const datos = await usuariosService.actualizarPerfil(req.usuario!.id, req.body);
  return responder(res, datos, 'Perfil actualizado');
});

export const cambiarPassword = asyncHandler(async (req: Request, res: Response) => {
  const { passwordActual, passwordNueva } = req.body as {
    passwordActual: string;
    passwordNueva: string;
  };
  const error = validarFortalezaPassword(passwordNueva);
  if (error) throw new ErrorReglaNegocio(error, 'PASSWORD_DEBIL');
  await authService.cambiarPasswordPropio(req.usuario!.id, passwordActual, passwordNueva);
  return responder(res, null, 'Contraseña actualizada correctamente');
});
