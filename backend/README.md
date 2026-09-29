# Agua Tres Estrellas Pura — Backend

API del sistema web de gestión del proceso de ventas. Express + TypeScript + Prisma + MariaDB.

---

## 1. Requisitos

| Componente | Versión |
|---|---|
| Node.js | 20 o superior |
| MariaDB / MySQL | 10.4 o superior |

## 2. Puesta en marcha

```bash
npm install
cp .env.example .env          # ajustar credenciales
npm run prisma:deploy         # aplica las migraciones
npm run seed                  # carga los datos iniciales
npm run dev                   # servidor en modo desarrollo
```

El servidor escucha en `http://localhost:4000` por defecto. El puerto se
configura con `PUERTO` en `.env`, y el frontend de Vite corre en el `5173`,
que ya está autorizado en `CORS_ORIGIN`.

### Comprobación rápida

```bash
curl http://localhost:4000/salud
```

> La salud completa (`/api/salud/completa`) sí exige sesión de administrador:
> expone el estado de la base y el entorno, y no debe ser pública.

## 3. Variables de entorno

Ver `.env.example` para la lista completa con comentarios. Las imprescindibles:

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Conexión a la base de datos de la aplicación |
| `DATABASE_URL_TEST` | Base separada para la suite de pruebas |
| `PUERTO` | Puerto del servidor |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | Firmas de los tokens |
| `DISABLE_RATE_LIMIT` | Solo pruebas; desactiva el limitador de peticiones |

> `DISABLE_RATE_LIMIT` nunca debe activarse en desarrollo ni en producción. Sin
> él, el limitador interpreta las decenas de peticiones por segundo de la suite
> como un ataque y la bloquea.

## 4. Datos iniciales

`npm run seed` es **idempotente**: se puede ejecutar varias veces sin duplicar
registros. Siembra:

- Empresa, 3 roles y 3 usuarios (`ADMINISTRADOR`, `VENDEDOR`, `REPARTIDOR`).
- 3 repartidores y 6 clientes.
- 3 productos: un bidón retornable y dos preformados.
- 12 requisitos funcionales y 18 casos de prueba, con su estado de aprobación.

El stock inicial se carga **mediante movimientos de inventario**, nunca
escribiendo la columna `stock` directamente. Así el inventario queda
trazable desde el primer momento, que es lo que exige el indicador de
actualización correcta del stock.

### Credenciales sembradas

Todas con la contraseña `Agua2026*` y con `debeCambiarPassword` activo.

| Correo | Rol | Ficha |
|---|---|---|
| `admin@aguarespura.pe` | Administrador | — |
| `vendedor@aguarespura.pe` | Vendedor | — |
| `repartidor@aguarespura.pe` | Repartidor | Miguel Chávez Rojas (`70099887`) |
| `repartidor2@aguarespura.pe` | Repartidor | Rosa Paredes Nina (`70111999`) |
| `repartidor3@aguarespura.pe` | Repartidor | Iván Ccorimanya Choque (`70223444`) |

El seed crea un usuario por repartidor. El campo `documento` del usuario debe
coincidir con el documento de su ficha en `repartidores`: es la clave foránea
que enlaza ambos registros, y de ella dependen el ingreso a la ruta, el filtro
de las entregas propias y la trazabilidad de cada movimiento. Los repartidores
se derivan de las fichas del propio seed, así que nombre, teléfono y documento
no pueden quedar desalineados.

## 5. Autenticación

`POST /api/auth/login` devuelve el token en `datos.tokenAcceso` y el de
renovación en `datos.tokenRenovacion`. Las peticiones se autentican con:

```
Authorization: Bearer <datos.tokenAcceso>
```

El sistema registra el último acceso, cuenta los intentos fallidos y bloquea
la cuenta al superar el máximo permitido.

## 6. Reglas de negocio

| Regla | Comportamiento |
|---|---|
| Una venta por pedido | Un pedido no puede generar una segunda venta |
| Venta de pedido confirmado | No se vende un pedido `PENDIENTE` ni uno `CANCELADO` |
| Pago no mayor al saldo | El pago se rechaza si supera el saldo pendiente |
| Stock solo por movimientos | Ningún servicio escribe `producto.stock` directamente |
| Devolución no mayor al saldo | No se devuelven más envases de los que el cliente tiene a su nombre |
| Cierre de entrega | No se puede cerrar una entrega sin haber salido a ruta |
| Entrega no realizada | Exige `motivoNoEntrega` |
| Trazabilidad | Toda transición de estado queda en el historial con usuario y fecha |
| Autorización | Verificada en el backend, no solo en la interfaz |

## 7. Pruebas

```bash
npm test               # 85 pruebas, 6 suites
npm run test:watch     # modo interactivo
npm run test:cubrimiento
```

Son pruebas de integración contra la base `agua_tres_estrellas_test`, sin
mocks de las reglas transaccionales: se comprueba el comportamiento real del
sistema, incluido el efecto sobre el stock y los saldos.

| Suite | Cubre |
|---|---|
| `auth.test.ts` | Login, tokens, bloqueo de cuenta, autorización por rol |
| `salud-catalogo.test.ts` | Salud del servicio, catálogo, inventario |
| `pedidos.test.ts` | Ciclo de vida del pedido, paginación, historial |
| `ventas-pagos.test.ts` | Ventas, anulaciones, pagos, saldo |
| `entregas-bidones.test.ts` | Ruta de reparto, saldos de envases, devoluciones |
| `reportes.test.ts` | Forma de las respuestas, CSV, totales del resumen, acceso |

Las pruebas **deben ejecutarse de forma secuencial**. Las suites comparten una
única base y cada una limpia las tablas al comenzar; con varios workers, la
limpieza de una borraría los datos que otra está usando. `jest.config.js` fija
`maxWorkers: 1` para que el resultado sea el mismo con `npm test`, con
`npx jest` y desde el IDE.

> La base `agua_tres_estrellas_test` debe existir. Crearla una vez:
> `CREATE DATABASE agua_tres_estrellas_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`

## 8. Simulador del proceso

Genera un histórico de operación para calcular los indicadores del postest.

```bash
npm run simular -- --dias=30 --pedidosPorDia=60
npm run simular -- --dias=7 --pedidosPorDia=20 --semilla=42
npm run simular -- --fechaInicio=2026-09-01 --fechaFin=2026-09-30
npm run simular -- --limpiar
npm run simular -- --ayuda
```

**Cómo funciona.** El simulador invoca los servicios reales, no escribe en la
base por la vía rápida. El histórico cumple por tanto las mismas reglas de
negocio que la aplicación en producción. La única excepción es que, después de
cada paso, ajusta las columnas de fecha al instante simulado: los servicios
escriben `new Date()`, y el postest necesita un periodo histórico. No se altera
ningún saldo, cantidad ni estado.

**Reproducibilidad.** Usa un generador congruencial con semilla propia en lugar
de `Math.random()`. Con la misma semilla y los mismos argumentos, la corrida es
idéntica, de modo que las cifras del postest pueden auditarse y repetirse.

**Realismo.** El volumen se ajusta por día de la semana, los canales siguen la
distribución real del rubro, el 60% de los clientes paga al facturar y el resto
contra entrega, y una fracción de las entregas no se concretan porque el
cliente no se encuentra. El inventario se reabastece cada mañana por el propio
servicio de movimientos, lo que conserva la trazabilidad del stock.

**Aviso.** `--limpiar` borra los datos operativos. Ejecutarlo siempre sobre la
base de pruebas.

**Coste.** Un día de 60 pedidos tarda unos 22 segundos. Una corrida de 30 días
con 60 pedidos diarios tarda alrededor de 11 minutos.

**Indicadores en cero.** Los tres indicadores de tiempo de consulta
(`tiempoPromedioConsultaHistorialEnvasesMin`, `tiempoPromedioConsultaEnvasesSegundos`,
`tiempoPromedioConsolidadoDiarioSegundos`) miden el registro de consultas HTTP
(`log_consultas`). El simulador llama a los servicios directamente, no por la
API, así que no los alimenta. Esos valores se obtienen ejercitando la
aplicación a través de sus endpoints.

## 9. Scripts

| Script | Función |
|---|---|
| `npm run dev` | Servidor con recarga en caliente |
| `npm run build` | Compila a `dist/` |
| `npm start` | Ejecuta la compilación |
| `npm run typecheck` | Verifica tipos de `src/` |
| `npm run typecheck:scripts` | Verifica tipos de `scripts/`, `prisma/` y `tests/` |
| `npm run prisma:migrate` | Crea y aplica una migración en desarrollo |
| `npm run prisma:deploy` | Aplica migraciones existentes |
| `npm run prisma:studio` | Interfaz visual de la base |
| `npm run seed` | Carga los datos iniciales |
| `npm run simular` | Genera el histórico del postest |
| `npm test` | Ejecuta la suite |

`tsconfig.json` compila únicamente `src/`, porque `dist/` debe reflejar el
backend. Por eso `scripts/`, `prisma/` y `tests/` se verifican aparte con
`npm run typecheck:scripts`.

## 10. Estructura

```
src/
  config/      variables de entorno y cliente de Prisma
  middlewares/ autenticación, autorización, validación, bitácora
  validators/  esquemas Zod por módulo
  services/    reglas de negocio y transacciones
  controllers/ traducción HTTP
  routes/      rutas de la API
  types/       tipos compartidos
prisma/
  schema.prisma
  migrations/
  seed.ts
scripts/
  simulador-proceso.ts
tests/
```
