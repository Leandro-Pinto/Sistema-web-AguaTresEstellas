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
configura con `PORT` en `.env`, y el frontend de Vite corre en el `5173`, que ya
está autorizado en `CORS_ORIGIN`.

### Comprobación rápida

```bash
curl http://localhost:4000/salud
```

Responde `{ estado, baseDeDatos, entorno, version, horaServidor, latenciaBaseMs }`
después de comprobar la base con un `SELECT 1`. Si la base no responde, la
respuesta es **503** con `codigo: "BASE_NO_DISPONIBLE"` y los mismos campos, de
modo que un monitor distingue el proceso caído (no contesta) de la base caída
(contesta 503).

> La salud completa (`/salud/completa`) sí exige sesión de administrador:
> expone el estado de la base, el entorno y los recuentos, y no debe ser pública.

## 3. Variables de entorno

Ver `.env.example` para la lista completa con comentarios. Las imprescindibles:

| Variable | Descripción |
|---|---|
| `ENTORNO` | **Obligatoria.** `prod`, `demo` o `test`. Sin ella la aplicación no arranca. |
| `DATABASE_URL` | Conexión a la base de datos del entorno declarado |
| `DATABASE_URL_TEST` | Base separada para la suite de pruebas |
| `PORT` | Puerto del servidor |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | Firmas de los tokens |
| `DISABLE_RATE_LIMIT` | Solo pruebas; desactiva el limitador de peticiones |

### Los tres entornos

| Entorno | Base exigida | Qué leen los reportes |
|---|---|---|
| `prod` | La que se le indique | Solo `REAL`. Único válido para una medición. |
| `demo` | Nombre terminado en `_demo` | `SIMULADO` por omisión; `REAL` si se pide. |
| `test` | Nombre terminado en `_test` | Solo `REAL`, contra la base de pruebas. |

`config/env.ts` rechaza la aplicación si el entorno y el nombre de la base no
concuerdan. Esa comprobación, junto con la barrera del simulador, es lo que
impide que un histórico inventado termine mezclado con los datos de la empresa.

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
npm test               # 113 pruebas, 8 suites
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
| `origen-datos.test.ts` | Barrera del simulador, separación `REAL` / `SIMULADO` |
| `linea-base-pretest.test.ts` | Línea base del pretest: escritura, lectura, procedencia y control de acceso |

Son 113 pruebas. La que impide que un conjunto simulado termine presentándose
como una medición es la de `origen-datos.test.ts`: ejecuta el simulador en un
proceso aparte para comprobar que se detiene fuera del entorno `demo`, y siembra
filas de las dos procedencias para verificar que los indicadores y los reportes
solo leen `REAL` por omisión, incluidas las tablas sin columna de origen, que se
filtran por el pedido que las causó. La de `linea-base-pretest.test.ts` verifica
que la comparación lea exactamente lo que el administrador transcribió de la
ficha del pretest, con autor y fecha, y nada inventado. Y la de `/salud`
comprueba que un proceso vivo con la base caída conteste 503, no 200.

Las pruebas **deben ejecutarse de forma secuencial**. Las suites comparten una
única base y cada una limpia las tablas al comenzar; con varios workers, la
limpieza de una borraría los datos que otra está usando. `jest.config.js` fija
`maxWorkers: 1` para que el resultado sea el mismo con `npm test`, con
`npx jest` y desde el IDE.

> La base `agua_tres_estrellas_test` debe existir. Crearla una vez:
> `CREATE DATABASE agua_tres_estrellas_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`

## 8. Simulador del proceso

Genera un conjunto de datos de demostración. **No sirve para el postest**: todo
lo que escribe queda marcado `SIMULADO`.

```bash
# Requiere ENTORNO="demo" y una base terminada en _demo.
npm run simular -- --dias=30 --pedidosPorDia=60
npm run simular -- --dias=7 --pedidosPorDia=20 --semilla=42
npm run simular -- --fechaInicio=2026-09-01 --fechaFin=2026-09-30
npm run simular -- --limpiar
npm run simular -- --ayuda
```

**Barrera de entorno.** El proceso se detiene antes de escribir nada si `ENTORNO`
no es `demo` o si el nombre de la base no termina en `_demo`. No hay bandera ni
variable de entorno que lo desactive: una barrera que se puede desactivar con un
argumento no protegería nada el día que alguien pase el argumento equivocado en
producción.

**Marcaje.** Todo lo que genera queda con `origen = SIMULADO` en el pedido, la
venta, el pago, la entrega, el historial y los movimientos de inventario. La
marca viaja desde la primera escritura, no se añade al final.

**Cómo funciona.** El simulador invoca los servicios reales, no escribe en la
base por la vía rápida. El conjunto cumple por tanto las mismas reglas de
negocio que la aplicación en producción. La única excepción es que, después de
cada paso, ajusta las columnas de fecha al instante simulado: los servicios
escriben `new Date()`, y la demostración necesita un periodo histórico. No se
altera ningún saldo, cantidad ni estado.

**Reproducibilidad.** Usa un generador congruencial con semilla propia en lugar
de `Math.random()`. Con la misma semilla y los mismos argumentos, la corrida es
idéntica, de modo que una demostración puede auditarse y repetirse.

**Realismo.** El volumen se ajusta por día de la semana, los canales siguen la
distribución real del rubro, el 60% de los clientes paga al facturar y el resto
contra entrega, y una fracción de las entregas no se concretan porque el
cliente no se encuentra. El inventario se reabastece cada mañana por el propio
servicio de movimientos, lo que conserva la trazabilidad del stock.

**Aviso.** `--limpiar` borra los datos operativos y pide escribir el nombre de la
base en la consola. Aunque la barrera de entorno impide correr en `prod`,
conviene ejecutarlo siempre sobre la base de demostración.

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
| `npm run simular` | Genera el conjunto de demostración (solo `ENTORNO=demo`) |
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
