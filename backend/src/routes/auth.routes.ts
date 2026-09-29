import { Router } from 'express';
import { autenticar, validar } from '../middlewares';
import {
  loginSchema,
  refreshSchema,
  perfilSchema,
  cambiarPasswordSchema,
} from '../validators/auth.validator';
import * as ctrl from '../controllers/auth.controller';

/**
 * RUTAS DE AUTENTICACIÓN
 *
 * El login tiene límite de intentos para frenar ataques de fuerza bruta
 * (aplicado globalmente en app.ts). Las demás rutas exigen token válido.
 */
const router = Router();

router.post('/login', validar(loginSchema), ctrl.login);
router.post('/refresh', validar(refreshSchema), ctrl.refrescar);
router.post('/logout', autenticar, ctrl.logout);
router.get('/perfil', autenticar, ctrl.perfil);
router.put('/perfil', autenticar, validar(perfilSchema), ctrl.actualizarPerfil);
router.post(
  '/cambiar-password',
  autenticar,
  validar(cambiarPasswordSchema),
  ctrl.cambiarPassword,
);

export default router;
