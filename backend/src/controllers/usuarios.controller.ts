import type { Request, Response } from 'express';
import { responder } from '../middlewares/respuesta';
import { asyncHandler } from '../utils/asyncHandler';
import * as usuariosService from '../services/usuarios.service';
import type {
  ActualizarUsuarioInput,
  CrearUsuarioInput,
  ListarUsuariosQuery,
} from '../validators/usuarios.validator';
import type { z } from 'zod';
import type { crearRolSchema, actualizarRolSchema, listarRolesSchema } from '../validators/usuarios.validator';

// --- Usuarios --------------------------------------------------------

export const listarUsuarios = asyncHandler(async (req: Request, res: Response) => {
  const resultado = await usuariosService.listarUsuarios(
    req.query as unknown as ListarUsuariosQuery,
  );
  return responder(res, resultado.datos, 'Listado de usuarios obtenido', 200, {
    paginacion: resultado.paginacion,
  });
});

export const obtenerUsuario = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: string };
  const resultado = await usuariosService.obtenerUsuario(Number(id));
  return responder(res, resultado, 'Usuario obtenido');
});

export const crearUsuario = asyncHandler(async (req: Request, res: Response) => {
  const usuario = await usuariosService.crearUsuario(req.body as CrearUsuarioInput);
  return responder(res, usuario, 'Usuario creado correctamente', 201);
});

export const actualizarUsuario = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: string };
  const usuario = await usuariosService.actualizarUsuario(
    Number(id),
    req.body as ActualizarUsuarioInput,
    req.usuario!.id,
  );
  return responder(res, usuario, 'Usuario actualizado correctamente');
});

export const cambiarEstadoUsuario = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: string };
  const { activo } = req.body as { activo: boolean };
  const usuario = await usuariosService.cambiarEstadoUsuario(
    Number(id),
    activo,
    req.usuario!.id,
  );
  return responder(res, usuario, activo ? 'Usuario activado' : 'Usuario desactivado');
});

export const eliminarUsuario = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: string };
  const usuario = await usuariosService.eliminarUsuario(Number(id), req.usuario!.id);
  return responder(res, usuario, 'Usuario eliminado');
});

export const restaurarUsuario = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: string };
  const usuario = await usuariosService.restaurarUsuario(Number(id), req.usuario!.id);
  return responder(res, usuario, 'Usuario restaurado correctamente');
});

export const resetearPassword = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: string };
  const { passwordNueva, debeCambiarPassword } = req.body as {
    passwordNueva: string;
    debeCambiarPassword: boolean;
  };
  const usuario = await usuariosService.resetearPassword(
    Number(id),
    passwordNueva,
    debeCambiarPassword,
    req.usuario!.id,
  );
  return responder(res, usuario, 'Contraseña restablecida correctamente');
});

// --- Roles -----------------------------------------------------------

export const listarRoles = asyncHandler(async (req: Request, res: Response) => {
  const resultado = await usuariosService.listarRoles(
    req.query as unknown as z.infer<typeof listarRolesSchema>,
  );
  return responder(res, resultado.datos, 'Listado de roles obtenido', 200, {
    paginacion: resultado.paginacion,
  });
});

export const crearRol = asyncHandler(async (req: Request, res: Response) => {
  const rol = await usuariosService.crearRol(req.body as z.infer<typeof crearRolSchema>);
  return responder(res, rol, 'Rol creado correctamente', 201);
});

export const actualizarRol = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: string };
  const rol = await usuariosService.actualizarRol(
    Number(id),
    req.body as z.infer<typeof actualizarRolSchema>,
  );
  return responder(res, rol, 'Rol actualizado correctamente');
});
