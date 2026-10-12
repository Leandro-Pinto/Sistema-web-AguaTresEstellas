# Brief técnico: ajustes

Este documento registra los ajustes que pidió el brief técnico, el estado de
cada uno y cómo se verifica. No repite lo que ya está en
[auditoría de consistencia](auditoria-consistencia.md), que trata del prompt
maestro: aquí solo van los puntos del brief.

> Los puntos que están documentados son los que se han trabajado hasta ahora:
> **T1**, **T2** y **T9**. Si el brief tiene más, se añaden con el mismo formato
> en cuanto se incorporen.

## Estado

| Punto | Qué pide | Estado | Verificación |
|---|---|---|---|
| T1 | Separar por completo los datos `REAL` de los `SIMULADO` y no inventar resultados de pretest | Implementado | `tests/origen-datos.test.ts` |
| T2 | Guardar la línea base del pretest en el sistema, con procedencia | Implementado | `tests/linea-base-pretest.test.ts`, `pages/Indicadores.test.tsx` |
| T9 | Comprobar la base con un `SELECT 1` y responder `503` si no responde | Implementado | `tests/salud-catalogo.test.ts` |

Todas las suites están en verde: **113 pruebas de backend en 8 archivos** y
**246 pruebas de frontend en 14 archivos**. Los comandos y los archivos de
salida están en [datos de demostración](datos-de-demostracion.md), sección 11.

## T1. Separación de datos reales y simulados

**Qué pedía.** Que un conjunto simulado no pueda presentarse nunca como una
medición de la operación, y que no se inventen valores de pretest.

**Qué se hizo.**

- Cada registro operativo lleva una columna `origen` con el enum `OrigenDato`
  (`REAL` o `SIMULADO`), añadida en la migración `20261005151352_agregar_origen_dato`.
  El historial de estados hereda la procedencia del registro que documenta.
- La lectura por omisión es `REAL` en `prod` y `test`; solo en `demo` es
  `SIMULADO`, y esa excepción está acotada porque el entorno `demo` únicamente
  arranca contra una base cuyo nombre termina en `_demo` (`backend/src/config/env.ts`).
- Pedir `origen=SIMULADO` fuera de `demo` no sirve la mezcla: el servicio
  corrige el origen y lo explica en el mensaje; un origen desconocido responde
  `422` (`backend/src/services/origen-dato.ts`).
- Las tablas sin columna propia —movimientos de inventario y de envases— se
  filtran por el pedido que las causó (`filtroOrigenPorPedido`), y los
  movimientos sin pedido entran en los dos conjuntos para no dejar el saldo
  incompleto.
- El simulador no tiene bandera para saltarse la barrera: falla antes de
  escribir si el entorno no es `demo` o si la base no termina en `_demo`.
- Se eliminó todo valor de pretest precargado o inventado: lo que no se midió
  viaja como `null` y la interfaz lo muestra como «sin dato», nunca como cero.

**Cómo se verifica.**

- `tests/origen-datos.test.ts` ejecuta el simulador en un proceso aparte para
  comprobar que se detiene fuera de `demo`, y siembra filas de las dos
  procedencias para verificar que indicadores y reportes solo leen `REAL` por
  omisión.
- `tests/salud-catalogo.test.ts` y `tests/reportes.test.ts` cubren el resto del
  contrato de lectura.
- En la interfaz, `components/Layout.test.tsx` comprueba que la cinta de
  demostración solo aparece cuando el servidor declara el entorno `demo`.

```bash
cd backend && npm test
cd frontend && npx vitest run
```

## T2. Línea base del pretest

**Qué pedía.** Que la línea base del pretest quede guardada en el sistema, con
constancia de quién la registró y cuándo, en lugar de depender de lo que cada
usuario escriba en el momento de mirar la comparación.

**Qué se hizo.**

- Tabla `linea_base_pretest` (modelo `LineaBasePretest`), migración
  `20261006081041_linea_base_pretest`. Es una fila única con los nueve valores
  de la matriz —tres tiempos y seis porcentajes— más `creadoPor`/`creadoEn` y
  `actualizadoPor`/`actualizadoEn`, con dos relaciones nombradas a `Usuario` y
  claves foráneas `ON DELETE RESTRICT`.
- `GET /reportes/indicadores/pretest` devuelve los nueve valores con su
  procedencia; si nadie la transcribió, `registrada` es `false` y todos son
  `null`.
- `PUT /reportes/indicadores/pretest` crea o corrige la fila. Es exclusivo del
  administrador (`403` para el resto) y el autor y la fecha los pone el
  servidor, no la interfaz.
- El cuerpo se valida con `pretestSchema.strict()`
  (`backend/src/validators/indicadores.validator.ts`): porcentajes de 0 a 100,
  tiempos de 0 a 1440 minutos, campos vacíos admitidos como `null` y cualquier
  clave desconocida rechazada con `422`.
- `POST /reportes/indicadores/comparativo` se eliminó: el comparativo ya no
  acepta parámetros de pretest y lee siempre la fila guardada, de modo que la
  tabla y el registro no puedan divergir.
- En la pantalla **Indicadores**, el administrador puede transcribir la ficha,
  corregirla y cancelar; el resto de los perfiles solo la consulta, con la
  procedencia visible.

**Cómo se verifica.**

- `tests/linea-base-pretest.test.ts` (9 pruebas): una línea base vacía responde
  «sin dato» y no cero, lo guardado es lo que aparece en el comparativo, los
  campos vacíos no se confunden con cero, una corrección reemplaza la fila sin
  duplicarla (`count() === 1`), el rango inválido y la clave desconocida dan
  `422`, y el vendedor recibe `403`.
- `pages/Indicadores.test.tsx` (4 pruebas): sin registro se ofrece transcribir
  la ficha y se muestra «sin dato»; al guardar se envían los nueve valores y se
  muestra la procedencia nueva; un fallo al guardar no borra lo registrado; el
  vendedor no encuentra el editor.

## T9. Comprobación de la base en la salud

**Qué pedía.** Que el health check compruebe la base de datos con un
`SELECT 1` y responda `503` cuando no esté disponible, en vez de responder
siempre `200`.

**Qué se hizo.**

- `GET /salud` (público) ejecuta `SELECT 1` contra MariaDB. Si responde,
  devuelve `200` con `{ estado, baseDeDatos, entorno, version, horaServidor,
  latenciaBaseMs }`.
- Si la base no responde, devuelve `503` con `codigo: "BASE_NO_DISPONIBLE"` y
  los mismos campos comunes. El entorno viaja también en el caso fallido porque
  el frontend lo usa para rotular la cinta de demostración y esa garantía no
  puede depender de que la base esté bien.
- La distinción es explícita: si nadie contesta, el proceso no está; si
  contesta `503`, el proceso vive y la base no.
- `GET /salud/completa` sigue siendo el diagnóstico detallado —recuentos,
  memoria, latencia— y sigue exigiendo sesión de administrador.

**Cómo se verifica.**

- `tests/salud-catalogo.test.ts`: una prueba comprueba el `200` y su forma; la
  nueva prueba del `503` simula un fallo de MariaDB con un espía sobre
  `prisma.$queryRaw` y verifica el código, el mensaje y que el entorno siga
  llegando.

```bash
cd backend && npx jest tests/salud-catalogo.test.ts
```

## Pendiente de datos que el sistema no puede inventar

Igual que en el resto de la documentación, estos puntos no son ajustes
técnicos sino mediciones que dependen de la empresa:

1. Transcribir los nueve valores reales del pretest a la línea base para que la
   comparación deje de apoyarse en marcadores.
2. Ejecutar los 18 casos de prueba y registrar su resultado.
3. Capturar la evidencia del postest sobre la operación real en
   `evidencias-reales/`, sin `origen=SIMULADO`.
