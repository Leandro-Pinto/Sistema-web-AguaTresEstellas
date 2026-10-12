/**
 * Configuración centralizada de la aplicación.
 * Lee el .env una sola vez y expone valores tipados y con valores por defecto seguros.
 */
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const bool = (valor: string | undefined, porDefecto = false): boolean => {
  if (valor === undefined) return porDefecto;
  return valor.toLowerCase() === 'true';
};

const int = (valor: string | undefined, porDefecto: number): number => {
  const n = Number(valor);
  return Number.isFinite(n) ? n : porDefecto;
};

/**
 * Entornos en los que puede funcionar el sistema.
 *
 * La distinción no es cosmética: separa los datos que provienen de la
 * operación real de los generados por el simulador para demostraciones. Sin
 * esa frontera, un histórico sintético puede terminar presentándose como si
 * fuera el postest, que es exactamente lo que la tesis no puede permitir.
 */
export type Entorno = 'prod' | 'demo' | 'test';

const ENTORNOS: Entorno[] = ['prod', 'demo', 'test'];

/** Sufijo que debe llevar la base de datos del entorno de demostración. */
export const SUFIJO_BASE_DEMO = '_demo';
/** Sufijo que debe llevar la base de datos de las pruebas automatizadas. */
export const SUFIJO_BASE_TEST = '_test';

const leerEntorno = (): Entorno => {
  const bruto = (process.env.ENTORNO ?? '').trim().toLowerCase();
  if (!bruto) {
    throw new Error(
      'Falta la variable ENTORNO en el archivo .env. Debe ser "prod", "demo" o "test". ' +
        'Copiar .env.example a .env y definirla.',
    );
  }
  if (!ENTORNOS.includes(bruto as Entorno)) {
    throw new Error(
      `ENTORNO inválido: "${bruto}". Solo se admiten: ${ENTORNOS.join(', ')}.`,
    );
  }
  return bruto as Entorno;
};

const entorno = leerEntorno();

/** Nombre de la base de datos de la URL, sin protocolo ni credenciales. */
export const nombreBaseDeDatos = (url: string): string => {
  const sinConsulta = url.split('?')[0];
  const ultimoSegmento = sinConsulta.split('/').filter(Boolean).pop();
  return ultimoSegmento ?? '';
};

/**
 * Verifica que el entorno y la base de datos concuerden.
 *
 * Sin esta comprobación, `ENTORNO=demo` con una base de producción sería
 * suficiente para que el simulador escribiera sobre los datos reales.
 */
const exigirBaseDeDatos = (url: string | undefined, entornoEsperado: Entorno): string => {
  if (!url) {
    throw new Error(
      `Falta la variable DATABASE_URL${entornoEsperado === 'test' ? '_TEST' : ''} en el archivo .env.`,
    );
  }
  const base = nombreBaseDeDatos(url);
  if (!base) {
    throw new Error(`No se pudo determinar el nombre de la base de datos a partir de DATABASE_URL.`);
  }
  const sufijoEsperado =
    entornoEsperado === 'demo' ? SUFIJO_BASE_DEMO : entornoEsperado === 'test' ? SUFIJO_BASE_TEST : '';
  if (sufijoEsperado && !base.endsWith(sufijoEsperado)) {
    throw new Error(
      `El entorno "${entornoEsperado}" exige una base de datos cuyo nombre termine en "${sufijoEsperado}", ` +
        `pero DATABASE_URL apunta a "${base}".`,
    );
  }
  return base;
};

const basePrincipal = exigirBaseDeDatos(process.env.DATABASE_URL, entorno);

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  entorno,
  baseDeDatos: basePrincipal,
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