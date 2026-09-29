import { Router } from 'express';
import { autenticar, autorizar } from '../middlewares';
import * as ctrl from '../controllers/dashboard.controller';

/**
 * RUTAS DEL TABLERO
 *
 * El tablero es la primera pantalla de cada rol. Se permite a los tres
 * porque el alcance de los indicadores depende del usuario que lo consulta,
 * no del rol: el vendedor ve lo suyo, el repartidor su carga y el
 * administrador el consolidado.
 */
const router = Router();

router.use(autenticar);

router.get('/', ctrl.resumen);
router.get('/indicadores', ctrl.indicadoresProceso);
router.get('/series-ventas', ctrl.seriesVentas);
router.get('/productos-mas-vendidos', ctrl.productosMasVendidos);
router.get(
  '/alertas-bidones',
  autorizar('ADMINISTRADOR', 'VENDEDOR'),
  ctrl.alertasBidones,
);

export default router;
