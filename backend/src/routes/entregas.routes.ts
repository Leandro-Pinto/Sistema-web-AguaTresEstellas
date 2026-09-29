import { Router } from 'express';
import { idSchema } from '../validators/comunes.validator';
import { autenticar, autorizar, validar } from '../middlewares';
import {
  crearRepartidorSchema,
  actualizarRepartidorSchema,
  listarRepartidoresSchema,
  registrarEntregaSchema,
  actualizarEntregaSchema,
  listarEntregasSchema,
  misEntregasSchema,
} from '../validators/operaciones.validator';
import * as ctrl from '../controllers/entregas.controller';

/**
 * RUTAS DE REPARTIDORES Y ENTREGAS
 *
 * Dos perfiles distintos sobre el mismo router:
 *   - El administrador registra repartidores y asigna entregas.
 *   - El repartidor consulta su ruta y actualiza el estado de su entrega.
 */
const router = Router();

const autorizaAdmin = autorizar('ADMINISTRADOR');

router.use(autenticar);

// --- Perfil del repartidor autenticado --------------------------------
// La paginación se valida porque el servicio la necesita para `skip`/`take`.
router.get(
  '/mis-entregas',
  autorizar('REPARTIDOR'),
  validar(misEntregasSchema, 'query'),
  ctrl.misEntregas,
);
router.put(
  '/entregas/:id',
  autorizar('REPARTIDOR', 'ADMINISTRADOR'),
  validar(idSchema, 'params'),
  validar(actualizarEntregaSchema),
  ctrl.actualizarEntrega,
);

// --- Gestión de repartidores -------------------------------------------
router.get('/repartidores', validar(listarRepartidoresSchema, 'query'), ctrl.listarRepartidores);
router.get('/repartidores/activos', ctrl.listarRepartidoresActivos);
router.get('/repartidores/zonas', ctrl.zonas);
router.get('/repartidores/:id', validar(idSchema, 'params'), ctrl.obtenerRepartidor);
router.post(
  '/repartidores',
  autorizar('ADMINISTRADOR'),
  validar(crearRepartidorSchema),
  ctrl.crearRepartidor,
);
router.put(
  '/repartidores/:id',
  autorizar('ADMINISTRADOR'),
  validar(idSchema, 'params'),
  validar(actualizarRepartidorSchema),
  ctrl.actualizarRepartidor,
);
router.patch(
  '/repartidores/:id/estado',
  autorizar('ADMINISTRADOR'),
  validar(idSchema, 'params'),
  ctrl.cambiarEstadoRepartidor,
);
router.delete(
  '/repartidores/:id',
  autorizar('ADMINISTRADOR'),
  validar(idSchema, 'params'),
  ctrl.eliminarRepartidor,
);
router.post(
  '/repartidores/:id/restaurar',
  autorizaAdmin,
  validar(idSchema, 'params'),
  ctrl.restaurarRepartidor,
);

// --- Entregas ---------------------------------------------------------
router.get('/entregas', validar(listarEntregasSchema, 'query'), ctrl.listarEntregas);
router.get('/entregas/carga', ctrl.cargaRepartidores);
router.get('/entregas/:id', validar(idSchema, 'params'), ctrl.obtenerEntrega);
router.get('/entregas/:id/historial', validar(idSchema, 'params'), ctrl.historialEntrega);
router.post(
  '/entregas',
  autorizar('ADMINISTRADOR', 'VENDEDOR'),
  validar(registrarEntregaSchema),
  ctrl.registrarEntrega,
);

export default router;
