import { Router } from 'express';
import { clienteIdSchema } from '../validators/comunes.validator';
import { autenticar, autorizar, validar } from '../middlewares';
import {
  movimientoBidonSchema,
  listarMovimientosBidonSchema,
  listarSaldosBidonesSchema,
} from '../validators/operaciones.validator';
import * as ctrl from '../controllers/bidones.controller';
import * as reportesCtrl from '../controllers/reportes.controller';

/**
 * RUTAS DE BIDONES
 *
 * El saldo de envases es la deuda decontainers que el cliente mantiene con la
 * empresa. El repartidor lo registra al entregar o recoger; el vendedor
 * consulta para negociar; el administrador audita.
 */
const router = Router();

router.use(autenticar);

router.get('/saldos', validar(listarSaldosBidonesSchema, 'query'), ctrl.saldos);
router.get('/saldos/total', ctrl.saldoTotal);
router.get('/movimientos', validar(listarMovimientosBidonSchema, 'query'), ctrl.listarMovimientos);
router.get(
  '/clientes/:clienteId/saldo',
  validar(clienteIdSchema, 'params'),
  ctrl.saldoCliente,
);
router.get('/clientes/:clienteId/historial', validar(clienteIdSchema, 'params'), ctrl.listarHistorial);
router.get(
  '/clientes/:clienteId/historial-consulta',
  validar(clienteIdSchema, 'params'),
  reportesCtrl.historialBidones,
);

router.post(
  '/movimientos',
  autorizar('ADMINISTRADOR', 'VENDEDOR', 'REPARTIDOR'),
  validar(movimientoBidonSchema),
  ctrl.registrarMovimiento,
);

export default router;
