import { Router } from 'express';
import { idSchema } from '../validators/comunes.validator';
import { autenticar, autorizar, validar } from '../middlewares';
import {
  crearProductoSchema,
  actualizarProductoSchema,
  listarProductosSchema,
  movimientoInventarioSchema,
  listarMovimientosInventarioSchema,
} from '../validators/productosInventario.validator';
import * as ctrl from '../controllers/productos.controller';

/**
 * RUTAS DE PRODUCTOS E INVENTARIO
 *
 * Consultar el stock es necesario para todos (incluso el repartidor, que
 * debe conocer lo que lleva), pero modificarlo es exclusivo del
 * administrador: es el activo que más riesgo de pérdida tiene.
 */
const router = Router();

router.use(autenticar);

router.get('/inventario', ctrl.verInventario);
router.get('/inventario/movimientos', validar(listarMovimientosInventarioSchema, 'query'), ctrl.listarMovimientos);
router.get('/inventario/movimientos/:id', validar(idSchema, 'params'), ctrl.obtenerMovimiento);
router.post(
  '/inventario/movimientos',
  autorizar('ADMINISTRADOR'),
  validar(movimientoInventarioSchema),
  ctrl.registrarMovimiento,
);

router.get('/', validar(listarProductosSchema, 'query'), ctrl.listar);
router.get('/activos', ctrl.listarActivos);
router.get('/:id', validar(idSchema, 'params'), ctrl.obtener);

router.post('/', autorizar('ADMINISTRADOR'), validar(crearProductoSchema), ctrl.crear);
router.put(
  '/:id',
  autorizar('ADMINISTRADOR'),
  validar(idSchema, 'params'),
  validar(actualizarProductoSchema),
  ctrl.actualizar,
);
router.patch(
  '/:id/estado',
  autorizar('ADMINISTRADOR'),
  validar(idSchema, 'params'),
  ctrl.cambiarEstado,
);
router.delete('/:id', autorizar('ADMINISTRADOR'), validar(idSchema, 'params'), ctrl.eliminar);
router.post('/:id/restaurar', autorizar('ADMINISTRADOR'), validar(idSchema, 'params'), ctrl.restaurar);

export default router;
