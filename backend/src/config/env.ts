/**
 * Configuración centralizada de la aplicación.
 * Lee el .env una sola vez y expone valores tipados y con valores por defecto seguros.
 */
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const bool = (value: string | undefined, fallback = false): boolean => {
  if (value === undefined) return fallback;
  return value.toLowerCase() === 'true';
};

const int = (value: string | undefined, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: int(process.env.PORT, 4000),
  apiPrefix: process.env.API_PREFIX ?? '/api',
  corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  jwt: {
    secret: process.env.JWT_SECRET ?? '',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? '',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },

  bcryptSaltRounds: int(process.env.BCRYPT_SALT_ROUNDS, 10),
  maxIntentosLogin: int(process.env.MAX_INTENTOS_LOGIN, 5),
  minutosBloqueoLogin: int(process.env.MINUTOS_BLOQUEO_LOGIN, 15),

  reglas: {
    permitirStockNegativo: bool(process.env.PERMITIR_STOCK_NEGATIVO, false),
    permitirDevolucionExcesiva: bool(process.env.PERMITIR_DEVOLUCION_EXCESIVA, false),
  },
} as const;

if (!config.jwt.secret) {
  throw new Error(
    'Falta JWT_SECRET en el archivo .env. Copia .env.example a .env y configura el valor.',
  );
}
