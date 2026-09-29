/**
 * Configuración de Jest.
 *
 * Las pruebas son de integración contra la API real: se levanta la aplicación
 * Express con supertest y se usa la base de datos MySQL de pruebas
 * (`DATABASE_URL_TEST`). No se usan mocks porque casi todas las reglas de
 * negocio viven en transacciones y constraints de base de datos: un mock
 * las probaría falsamente.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  // Margen generoso: las pruebas abren conexiones reales a MariaDB.
  testTimeout: 30000,
  setupFiles: ['<rootDir>/tests/setup-env.ts'],
  globalSetup: '<rootDir>/tests/global-setup.ts',
  globalTeardown: '<rootDir>/tests/global-teardown.ts',
  /**
   * Las suites se ejecutan de una en una, obligatoriamente.
   *
   * Comparten una única base de datos y cada una limpia las tablas al
   * empezar. Con varios workers, la limpieza de una borraría los datos que
   * otra está usando y los fallos serían incoherentes. Además, así la
   * ejecución es idéntica con `npm test`, con `npx jest` y desde el IDE.
   */
  maxWorkers: 1,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/server.ts',
    '!src/types/**',
    '!src/validators/**',
  ],
  coverageDirectory: 'coverage',
  clearMocks: true,
  verbose: true,
};
