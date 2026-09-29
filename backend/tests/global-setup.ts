/**
 * Preparación global de la base de pruebas.
 *
 * Se ejecuta una vez antes de todos los archivos de prueba. Aplica las
 * migraciones sobre `DATABASE_URL_TEST` y ejecuta el seed, de modo que la
 * suite arranque siempre con el mismo catálogo y los mismos usuarios, sin
 * depender del estado en que haya quedado la base de desarrollo.
 */
import { execSync } from 'node:child_process';
import path from 'node:path';
import dotenv from 'dotenv';

export default function globalSetup(): void {
  const raiz = path.resolve(__dirname, '..');
  dotenv.config({ path: path.join(raiz, '.env') });

  const url =
    process.env.DATABASE_URL_TEST ??
    (process.env.DATABASE_URL
      ? process.env.DATABASE_URL.replace(/\/[^/?]+(\?|$)/, '/agua_tres_estrellas_test$1')
      : undefined);

  if (!url) {
    throw new Error(
      'No se encontro DATABASE_URL_TEST en .env. Crea la base de pruebas antes de ejecutar los tests.',
    );
  }

  // `prisma.config.ts` hace `import 'dotenv/config'`, y dotenv NO pisa las
  // variables ya presentes: por eso el entorno hijo es suficiente.
  const entorno = { ...process.env, DATABASE_URL: url };

  const ejecutar = (comando: string, titulo: string) => {
    try {
      execSync(comando, { cwd: raiz, env: entorno, stdio: 'pipe' });
    } catch (e) {
      const salida = e instanceof Error ? (e as { stdout?: Buffer }).stdout?.toString() : '';
      throw new Error(`Fallo ${titulo}:\n${salida ?? String(e)}`);
    }
  };

  ejecutar('npx prisma migrate deploy', 'al aplicar las migraciones');
  ejecutar('npx prisma generate', 'al generar Prisma Client');
  ejecutar('npx tsx prisma/seed.ts', 'al cargar los datos iniciales');
}
