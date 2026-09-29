import express, { type Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { config } from './config/env';
import { prisma } from './config/prisma';
import { marcarTiempo } from './middlewares/respuesta';
import { bitacoraHttp } from './middlewares/bitacoraHttp';
import { manejadorErrores, noEncontrado } from './middlewares/errores';
import { logger } from './utils/logger';
import rutas from './routes';

import proceso from 'node:process';

export const crearApp = (): Application => {
  const app = express();

  // --- Seguridad -----------------------------------------------------
  app.set('trust proxy', 1);
  app.use(
    helmet({
      // La API sirve JSON; se desactiva CSP porque el frontend se sirve aparte.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(
    cors({
      origin: (origen, callback) => {
        if (!origen || config.corsOrigin.includes(origen)) return callback(null, true);
        return callback(new Error('Origen no permitido por CORS'));
      },
      credentials: true,
      exposedHeaders: ['X-Tiempo-Respuesta-Ms'],
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // --- Límite de peticiones (protección frente a abuso) --------------
  // En pruebas se desactiva: la suite emite decenas de logins en segundos y
  // sería imposible distinguir un ataque de una ejecución legítima.
  if (proceso.env.DISABLE_RATE_LIMIT !== 'true') {
    // El límite estricto va solo sobre las rutas que aceptan credenciales. Con
    // él montado en todo `/api/auth` también alcanzaba a `GET /perfil`, que la
    // interfaz consulta al arrancar y después de cada inicio de sesión: al
    // agotar las 30 peticiones en 15 minutos el perfil fallaba, la sesión se
    // quedaba sin leer y el usuario veía la aplicación vacía. Un límite contra
    // la fuerza bruta no debe expulsar a quien solo navega.
    const limiteCredenciales = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 30,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        exito: false,
        mensaje: 'Demasiados intentos de acceso. Espere unos minutos e intente nuevamente.',
        codigo: 'LIMITE_PETICIONES',
      },
    });
    for (const ruta of ['/api/auth/login', '/api/auth/refresh', '/api/auth/cambiar-password']) {
      app.use(ruta, limiteCredenciales);
    }
    app.use(
      config.apiPrefix,
      rateLimit({
        windowMs: 60 * 1000,
        max: 600,
        standardHeaders: true,
        legacyHeaders: false,
      }),
    );
  }

  // --- Instrumentación ----------------------------------------------
  app.use(marcarTiempo);
  app.use(bitacoraHttp);

  // --- Verificación de salud ----------------------------------------
  // El índice de rutas ya monta `/salud`; se antepone aquí para que quede
  // disponible antes que cualquier módulo protegido.
  app.use(rutas);

  app.use(noEncontrado);
  app.use(manejadorErrores);

  return app;
};

export const iniciarServidor = (): void => {
  const app = crearApp();
  const servidor = app.listen(config.port, () => {
    logger.info(`API Agua Tres Estrellas escuchando en http://localhost:${config.port}${config.apiPrefix}`);
  });

  const apagar = (senal: string) => {
    logger.warn(`Señal ${senal} recibida, cerrando servidor`);
    servidor.close(() => {
      void prisma.$disconnect().then(() => process.exit(0));
    });
  };

  process.on('SIGINT', () => apagar('SIGINT'));
  process.on('SIGTERM', () => apagar('SIGTERM'));
};
