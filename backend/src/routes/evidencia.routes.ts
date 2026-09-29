import { Router } from 'express';
import { autenticar, autorizar, validar } from '../middlewares';
import { idSchema } from '../validators/comunes.validator';
import * as ctrl from '../controllers/incidencias.controller';
import { z } from 'zod';

/**
 * RUTAS DE EVIDENCIA
 *
 * Incidencias detectadas durante la evaluación y bitácora de peticiones. Son
 * el soporte objetivo de los indicadores de fiabilidad y trazabilidad del
 * postest.
 */
const router = Router();

const listarSchema = z.object({
  pagina: z.coerce.number().int().positive().default(1),
  limite: z.coerce.number().int().positive().max(100).default(20),
  orden: z.enum(['asc', 'desc']).default('desc'),
  modulo: z.enum([
    'AUTENTICACION',
    'PEDIDOS',
    'VENTAS',
    'PAGOS',
    'ENTREGAS',
    'BIDONES',
    'INVENTARIO',
    'REPORTES',
    'TABLERO',
    'OTRO',
  ]).optional(),
  severidad: z.coerce.number().int().min(1).max(4).optional(),
  estado: z.enum(['ABIERTA', 'EN_PROCESO', 'RESUELTA', 'DESCARTADA']).optional(),
  busqueda: z.string().trim().optional(),
});

router.use(autenticar);

// --- Incidencias ------------------------------------------------------
// El cuerpo se valida dentro del controlador: cada acción (crear, editar,
// resolver) tiene su propio esquema y sus propios mensajes de error.
router.get('/incidencias', validar(listarSchema, 'query'), ctrl.listar);
router.post('/incidencias', ctrl.crear);
router.put('/incidencias/:id', validar(idSchema, 'params'), ctrl.actualizar);
router.get('/incidencias/:id', validar(idSchema, 'params'), ctrl.obtener);
router.post('/incidencias/:id/resolver', validar(idSchema, 'params'), ctrl.resolver);
router.post('/incidencias/:id/descartar', validar(idSchema, 'params'), ctrl.descartar);

// --- Indicadores de evidencia ------------------------------------------
router.get('/fiabilidad', ctrl.resumenFiabilidad);

// --- Bitácora ---------------------------------------------------------
router.get(
  '/bitacora',
  autorizar('ADMINISTRADOR'),
  ctrl.bitacora,
);

export default router;
