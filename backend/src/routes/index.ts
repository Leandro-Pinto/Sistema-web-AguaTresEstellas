import { Router } from 'express';
import authRoutes from './auth.routes';
import usuarioRoutes from './usuarios.routes';
import clienteRoutes from './clientes.routes';
import productoRoutes from './productos.routes';
import pedidoRoutes from './pedidos.routes';
import ventaRoutes from './ventas.routes';
import pagoRoutes from './pagos.routes';
import entregaRoutes from './entregas.routes';
import bidonRoutes from './bidones.routes';
import dashboardRoutes from './dashboard.routes';
import reporteRoutes from './reportes.routes';
import evidenciaRoutes from './evidencia.routes';
import saludRoutes from './salud.routes';
import { config } from '../config';

/**
 * ÍNDICE DE RUTAS
 *
 * Un único punto donde se ve la superficie completa de la API. El orden de
 * montaje importa: los prefijos literales (`/inventario`, `/activos`,
 * `/buscar`) se registran antes que los parámetros (`/:id`) para que no se
 * interpreten como un identificador.
 */
const router = Router();

// Público: el monitor de despliegue no tiene credenciales.
// Se monta en la raíz para que la ruta sea `/salud`, no `/api/salud`.
router.use('/salud', saludRoutes);

// Sesión. Montada aparte porque es lo único accesible sin token.
router.use(`${config.apiPrefix}/auth`, authRoutes);

// Módulos de negocio: todos exigen `autenticar` dentro de su propio router,
// de modo que las reglas de acceso quedan declaradas junto a cada ruta.
// Los roles cuelgan de usuarios (`/api/usuarios/roles`) porque comparten
// middleware de administración.
router.use(`${config.apiPrefix}/usuarios`, usuarioRoutes);
router.use(`${config.apiPrefix}/clientes`, clienteRoutes);
router.use(`${config.apiPrefix}/productos`, productoRoutes);
router.use(`${config.apiPrefix}/pedidos`, pedidoRoutes);
router.use(`${config.apiPrefix}/ventas`, ventaRoutes);
router.use(`${config.apiPrefix}/pagos`, pagoRoutes);
router.use(`${config.apiPrefix}/entregas`, entregaRoutes);
router.use(`${config.apiPrefix}/bidones`, bidonRoutes);
router.use(`${config.apiPrefix}/tablero`, dashboardRoutes);
router.use(`${config.apiPrefix}/reportes`, reporteRoutes);
router.use(`${config.apiPrefix}/evidencia`, evidenciaRoutes);

export default router;
