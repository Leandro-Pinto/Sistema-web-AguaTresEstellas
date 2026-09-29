/**
 * Variables de entorno para las pruebas.
 *
 * Se ejecuta ANTES de que Jest importe cualquier módulo de la aplicación, por
 * eso usa `setupFiles` y no `setupFilesAfterEnv`. Redirige la conexión a la
 * base de pruebas para que ejecutar la suite nunca toque los datos reales del
 * postest.
 *
 * `dotenv.config({ path: ... })` lee el `.env` real y luego sobrescribe solo
 * lo necesario para el entorno de prueba.
 */
import path from 'node:path';
import dotenv from 'dotenv';

const raiz = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(raiz, '.env') });

const urlPruebas =
  process.env.DATABASE_URL_TEST ??
  (process.env.DATABASE_URL ? process.env.DATABASE_URL.replace(/\/[^/?]+(\?|$)/, '/agua_tres_estrellas_test$1') : undefined);

if (!urlPruebas) {
  throw new Error(
    'No se encontro DATABASE_URL_TEST ni DATABASE_URL en .env. Las pruebas necesitan una base de datos.',
  );
}

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = urlPruebas;

// La suite emite decenas de logins en pocos segundos. Sin esto, el limitador
// de `/api/auth` (30 por 15 min) los confundiría con un ataque.
process.env.DISABLE_RATE_LIMIT = 'true';

// Secretos fijos y conocidos: hacen que los tokens sean reproducibles.
process.env.JWT_SECRET = 'secreto-de-pruebas-jwt-agua-tres-estrellas-64-caracteres-minimo-abcdefghij';
process.env.JWT_REFRESH_SECRET =
  'secreto-de-pruebas-refresh-agua-tres-estrellas-64-caracteres-minimo-abcdefghij';
