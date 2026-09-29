import { Router } from 'express';
import { idSchema } from '../validators/comunes.validator';
import { autenticar, autorizar, validar } from '../middlewares';
import {
  crearClienteSchema,
  actualizarClienteSchema,
  listarClientesSchema,
} from '../validators/clientes.validator';
import * as ctrl from '../controllers/clientes.controller';

/**
 * RUTAS DE CLIENTES
 *
 * Vendedor y administrador gestionan la cartera; el repartidor solo consulta
 * lo necesario para entregar.
 */
const router = Router();

router.use(autenticar);

router.get('/', validar(listarClientesSchema, 'query'), ctrl.listar);
router.get('/buscar', ctrl.buscar);
router.get('/distritos', ctrl.distritos);
router.get('/:id', validar(idSchema, 'params'), ctrl.obtener);

router.post('/', autorizar('ADMINISTRADOR', 'VENDEDOR'), validar(crearClienteSchema), ctrl.crear);
router.put(
  '/:id',
  autorizar('ADMINISTRADOR', 'VENDEDOR'),
  validar(idSchema, 'params'),
  validar(actualizarClienteSchema),
  ctrl.actualizar,
);
router.patch(
  '/:id/estado',
  autorizar('ADMINISTRADOR', 'VENDEDOR'),
  validar(idSchema, 'params'),
  ctrl.cambiarEstado,
);
router.delete(
  '/:id',
  autorizar('ADMINISTRADOR', 'VENDEDOR'),
  validar(idSchema, 'params'),
  ctrl.eliminar,
);
router.post(
  '/:id/restaurar',
  autorizar('ADMINISTRADOR'),
  validar(idSchema, 'params'),
  ctrl.restaurar,
);

export default router;
