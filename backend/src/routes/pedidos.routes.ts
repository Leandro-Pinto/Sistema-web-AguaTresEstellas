import { Router } from 'express';
import { idSchema } from '../validators/comunes.validator';
import { autenticar, autorizar, validar } from '../middlewares';
import {
  crearPedidoSchema,
  actualizarPedidoSchema,
  cambiarEstadoPedidoSchema,
  listarPedidosSchema,
} from '../validators/pedidos.validator';
import * as ctrl from '../controllers/pedidos.controller';

/**
 * RUTAS DE PEDIDOS
 *
 * El vendedor registra y confirma; el administrador supervisa y cancela. El
 * repartidor no entra aquí: su operación empieza con la entrega asignada.
 */
const router = Router();

router.use(autenticar);

router.get('/', validar(listarPedidosSchema, 'query'), ctrl.listar);
router.get('/conteo-estados', ctrl.conteoPorEstado);
router.get('/:id', validar(idSchema, 'params'), ctrl.obtener);
router.get('/:id/historial', validar(idSchema, 'params'), ctrl.historial);

router.post('/', autorizar('ADMINISTRADOR', 'VENDEDOR'), validar(crearPedidoSchema), ctrl.crear);
router.put(
  '/:id',
  autorizar('ADMINISTRADOR', 'VENDEDOR'),
  validar(idSchema, 'params'),
  validar(actualizarPedidoSchema),
  ctrl.actualizar,
);
router.patch(
  '/:id/estado',
  validar(idSchema, 'params'),
  validar(cambiarEstadoPedidoSchema),
  ctrl.cambiarEstado,
);

export default router;
