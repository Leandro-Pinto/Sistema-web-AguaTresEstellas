import { Router } from 'express';
import { salud, saludCompleta } from '../controllers/salud.controller';
import { autenticar, autorizar } from '../middlewares';

/**
 * RUTAS DE SALUD
 *
 * `/salud` es pública y no consulta la base de datos, para que un monitor
 * pueda comprobar que el proceso responde. `/salud/completa` sí toca Prisma
 * y expone recuentos del sistema, así que exige sesión de administrador.
 */
const router = Router();

router.get('/', salud);
router.get('/completa', autenticar, autorizar('ADMINISTRADOR'), saludCompleta);

export default router;
