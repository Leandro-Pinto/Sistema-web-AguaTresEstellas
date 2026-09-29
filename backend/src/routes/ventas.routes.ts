import { Router } from 'express';
import { idSchema } from '../validators/comunes.validator';
import { autenticar, autorizar, validar } from '../middlewares';
import {
  crearVentaSchema,
  anularVentaSchema,
  emitirConstanciaSchema,
  listarVentasSchema,
} from '../validators/operaciones.validator';
import * as ctrl from '../controllers/ventas.controller';

/**
 * RUTAS DE VENTAS
 *
 * Registrar y anular ventas es potestad del administrador y del vendedor con
 * permiso de caja; la anulación exige justificación porque altera el
 * consolidado ya reportado.
 */
const router = Router();

router.use(autenticar);

router.get('/', validar(listarVentasSchema, 'query'), ctrl.listar);
router.get('/:id', validar(idSchema, 'params'), ctrl.obtener);
router.get('/:id/constancia', validar(idSchema, 'params'), ctrl.constancia);
router.get('/:id/historial', validar(idSchema, 'params'), ctrl.historial);

router.post('/', autorizar('ADMINISTRADOR', 'VENDEDOR'), validar(crearVentaSchema), ctrl.crear);
router.post(
  '/:id/anular',
  autorizar('ADMINISTRADOR'),
  validar(idSchema, 'params'),
  validar(anularVentaSchema),
  ctrl.anular,
);
router.post(
  '/:id/emitir-constancia',
  autorizar('ADMINISTRADOR', 'VENDEDOR'),
  validar(idSchema, 'params'),
  validar(emitirConstanciaSchema),
  ctrl.emitirConstancia,
);

export default router;
