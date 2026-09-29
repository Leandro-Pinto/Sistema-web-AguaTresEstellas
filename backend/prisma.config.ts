/**
 * Configuración del CLI de Prisma.
 *
 * Antes vivía la clave `"prisma"` dentro de `package.json`, que Prisma ya
 * marca como deprecada. Al declararla aquí de forma explícita desaparece la
 * advertencia y, sobre todo, el seed queda versionado junto al esquema.
 *
 * `import 'dotenv/config'` es obligatorio: al existir este archivo, Prisma
 * deja de leer `.env` por su cuenta y las variables como `DATABASE_URL` deben
 * cargarse explícitamente.
 */
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
});
