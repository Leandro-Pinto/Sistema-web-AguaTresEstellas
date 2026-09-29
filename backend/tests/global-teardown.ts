/**
 * Cierre global: nada que hacer realmente, porque cada worker de Jest cierra
 * su propio pool de Prisma al terminar. Se mantiene el archivo para dejar
 * explícito el punto de extensión si en el futuro se cachean conexiones.
 */
export default function globalTeardown(): void {
  // Sin acciones: la desconexión ocurre en el `afterAll` de `helpers.ts`.
}
