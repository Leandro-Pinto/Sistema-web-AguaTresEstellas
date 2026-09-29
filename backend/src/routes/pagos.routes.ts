import { Router } from 'express';
import { idSchema } from '../validators/comunes.validator';
import { autenticar, autorizar, validar } from '../middlewares';
import {
  crearPagoSchema,
  anularPagoSchema,
  listarPagosSchema,
} from '../validators/operaciones.validator';
import * as ctrl from '../controllers/pagos.controller';

/**
 * RUTAS DE PAGOS
 *
 * El vendedor cobra; solo el administrador anula un pago ya registrado,
 * porque deshacer un cobro afecta el arqueo de caja.
 */
const router = Router();

router.use(autenticar);

router.get('/', validar(listarPagosSchema, 'query'), ctrl.listar);
router.get('/resumen-metodo', ctrl.resumenPorMetodo);
router.get('/:id', validar(idSchema, 'params'), ctrl.obtener);

router.post('/', autorizar('ADMINISTRADOR', 'VENDEDOR'), validar(crearPagoSchema), ctrl.crear);
router.post(
  '/:id/anular',
  autorizar('ADMINISTRADOR'),
  validar(idSchema, 'params'),
  validar(anularPagoSchema),
  ctrl.anular,
);

export default router;
