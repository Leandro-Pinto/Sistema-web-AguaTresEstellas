import { Router } from 'express';
import { salud, saludCompleta } from '../controllers/salud.controller';
import { autenticar, autorizar } from '../middlewares';

/**
 * RUTAS DE SALUD
 *
 * `/salud` es público: comprueba con un `SELECT 1` que la base responda y
 * responde 503 si no lo hace, para que un monitor distinga el proceso caído
 * de la base caída. `/salud/completa` sí expone recuentos del sistema, así
 * que exige sesión de administrador.
 */
const router = Router();

router.get('/', salud);
router.get('/completa', autenticar, autorizar('ADMINISTRADOR'), saludCompleta);

export default router;
