import { Router } from 'express';
import { idSchema } from '../validators/comunes.validator';
import { autenticar, autorizar, validar } from '../middlewares';
import {
  crearUsuarioSchema,
  actualizarUsuarioSchema,
  listarUsuariosSchema,
  listarRolesSchema,
  crearRolSchema,
  actualizarRolSchema,
  resetPasswordSchema,
  cambiarEstadoSchema,
} from '../validators/usuarios.validator';
import * as ctrl from '../controllers/usuarios.controller';

/**
 * RUTAS DE USUARIOS Y ROLES
 *
 * Exclusivas del administrador: crear usuarios equivaldría a crear accesos
 * al sistema, algo que un vendedor no debe poder hacer.
 */
const router = Router();

router.use(autenticar, autorizar('ADMINISTRADOR'));

router.get('/roles', validar(listarRolesSchema, 'query'), ctrl.listarRoles);
router.post('/roles', validar(crearRolSchema), ctrl.crearRol);
router.put('/roles/:id', validar(idSchema, 'params'), validar(actualizarRolSchema), ctrl.actualizarRol);

router.get('/', validar(listarUsuariosSchema, 'query'), ctrl.listarUsuarios);
router.get('/:id', validar(idSchema, 'params'), ctrl.obtenerUsuario);
router.post('/', validar(crearUsuarioSchema), ctrl.crearUsuario);
router.put(
  '/:id',
  validar(idSchema, 'params'),
  validar(actualizarUsuarioSchema),
  ctrl.actualizarUsuario,
);
router.patch(
  '/:id/estado',
  validar(idSchema, 'params'),
  validar(cambiarEstadoSchema),
  ctrl.cambiarEstadoUsuario,
);
router.post(
  '/:id/resetear-password',
  validar(idSchema, 'params'),
  validar(resetPasswordSchema),
  ctrl.resetearPassword,
);
router.delete('/:id', validar(idSchema, 'params'), ctrl.eliminarUsuario);
router.post('/:id/restaurar', validar(idSchema, 'params'), ctrl.restaurarUsuario);

export default router;
