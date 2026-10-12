import { Router } from 'express';
import { autenticar, autorizar, validar } from '../middlewares';
import * as reportesCtrl from '../controllers/reportes.controller';
import * as indicadoresCtrl from '../controllers/indicadores.controller';
import { pretestSchema } from '../validators/indicadores.validator';

/**
 * RUTAS DE REPORTES E INDICADORES
 *
 * Son la base de la evidencia del postest. Todos los perfiles pueden consultar
 * lo que les corresponde, pero la exportación masiva queda reservada al
 * administrador porque incluye datos consolidados de toda la operación, y lo
 * mismo vale para la línea base del pretest, contra la que se interpreta
 * toda la comparación.
 */
const router = Router();

router.use(autenticar);

// --- Indicadores de la tesis -----------------------------------------
router.get('/indicadores/proceso', indicadoresCtrl.proceso);
router.get('/indicadores/sistema', indicadoresCtrl.sistema);
router.get('/indicadores/comparativo', indicadoresCtrl.comparativo);
router.get('/indicadores/pretest', indicadoresCtrl.pretest);
router.put(
  '/indicadores/pretest',
  autorizar('ADMINISTRADOR'),
  validar(pretestSchema),
  indicadoresCtrl.guardarPretest,
);
router.get('/indicadores/periodo', indicadoresCtrl.periodo);

// --- Reportes ---------------------------------------------------------
router.get('/ventas', reportesCtrl.ventas);
router.get('/pedidos', reportesCtrl.pedidos);
router.get('/pagos', reportesCtrl.pagos);
router.get('/entregas', reportesCtrl.entregas);
router.get('/clientes', reportesCtrl.clientes);
router.get('/bidones', reportesCtrl.bidones);
router.get('/inventario', reportesCtrl.inventario);
router.get('/tiempos-proceso', reportesCtrl.tiemposProceso);
router.get('/diario', reportesCtrl.diario);
router.get('/historial-bidones/:clienteId', reportesCtrl.historialBidones);

// --- Solo administrador -----------------------------------------------
router.get('/indicadores/exportar', autorizar('ADMINISTRADOR'), indicadoresCtrl.exportar);
router.get('/costo-consultas', autorizar('ADMINISTRADOR'), reportesCtrl.costoConsultas);

export default router;
