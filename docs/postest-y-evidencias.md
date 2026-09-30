# Postest y evidencias

Este documento explica cómo se generó el histórico de la medición, con qué
parámetros, qué indicadores produjo y qué archivo respalda cada cifra.

---

## 1. Por qué un simulador y no datos a mano

Los indicadores que sostiene la tesis se calculan con las marcas de tiempo que
el sistema escribe en cada cambio de estado. Para que la medición sea
reproducible y comparable con el pretest, el histórico tiene que generarse con la
misma lógica de negocio que usa la aplicación: si se insertaran filas
directamente en la base, los tiempos medidos serían los que el script
impusiera, no los del proceso real.

Por eso `backend/scripts/simulador-proceso.ts` **invoca los servicios reales**:
crea el pedido con el mismo servicio que usa la pantalla, confirma, vende, cobra
y entrega. Si una regla del sistema rechazara la operación, el simulador también
la rechazaría.

La excepción es que, tras cada paso, el simulador ajusta las columnas de fecha al
instante simulado. Sin eso, todo el histórico quedaría con la fecha del día en
que se ejecuta y los tiempos de proceso serían cero.

## 2. Ejecución

```bash
cd backend
npm run simular -- --limpiar --dias=30 --pedidosPorDia=45 --semilla=2026
```

### Opciones

| Opción | Por defecto | Qué hace |
|---|---|---|
| `--dias=N` | `30` | Días hacia atrás desde hoy. |
| `--pedidosPorDia=N` | `60` | Pedidos promedio por jornada. |
| `--fechaInicio=AAAA-MM-DD` | — | Primer día del periodo. |
| `--fechaFin=AAAA-MM-DD` | — | Último día del periodo. |
| `--semilla=N` | `20260928` | Semilla del azar. |
| `--limpiar` | — | Borra los datos operativos antes de simular. |
| `--sinIndicadores` | — | No imprime el resumen de indicadores. |
| `--ayuda` | — | Muestra la ayuda. |

### Sobre la semilla

`--semilla` fija el azar: dos ejecuciones con los mismos parámetros producen el
mismo histórico, pedido por pedido. Sin ella, cada corrida daría cifras
distintas y el postest no sería defendible ante una diferencia de un punto.

### Sobre `--limpiar`

Borra pedidos, ventas, pagos, entregas y movimientos antes de empezar. El
catálogo, los usuarios, los repartidores, los clientes y el inventario base
sobreviven: son el punto de partida, no el resultado.

Conviene usarlo siempre que se cambie un parámetro, porque si no la corrida
anterior se acumula y los indicadores mezclan dos periodos.

## 3. Ejecución registrada

| Parámetro | Valor |
|---|---|
| Periodo | 2026-08-31 a 2026-09-30 (30 días) |
| Pedidos por día | 45 |
| Semilla | 2026 |
| Tiempo de ejecución | 322,2 s |

### Resultado

| Concepto | Valor |
|---|---|
| Pedidos generados | 1.145 |
| Ventas generadas | 1.088 |
| Pagos | 977 |
| Entregas | 1.088 |
| Pedidos cancelados | 57 |
| Entregas no concretadas | 63 |
| Pedidos con error de registro | 67 |
| Pedidos descartados por regla | 0 |

Los 57 pedidos cancelados y los 67 con error de registro son deliberados: el
simulador los genera con una probabilidad baja para que los indicadores de
corrección y de trazabilidad no salgan en 100 % por construcción, lo que los
haría incomparables con el pretest.

## 4. Indicadores del postest

Periodo 2026-08-31 a 2026-09-30. Archivo que los respalda:
[`evidencias/indicadores/proceso.json`](../evidencias/indicadores/proceso.json).

### Muestra

| | |
|---|---|
| Pedidos | 1.145 |
| Ventas | 1.088 |
| Pagos | 977 |
| Entregas | 1.088 |
| Clientes | 6 |

### Recepción y registro

| Indicador | Valor |
|---|---|
| Tiempo promedio de registro | 10,11 min |
| Pedidos registrados correctamente | 100 % |
| Pedidos con errores de registro | 5,85 % |

### Procesamiento y control

| Indicador | Valor |
|---|---|
| Tiempo promedio de procesamiento de la venta | 15,24 min |
| Ventas procesadas correctamente | 85,48 % |
| Ventas con errores | 0 % |
| Ventas con pago registrado | 100 % |
| Actualización correcta del stock | 100 % |

### Atención y seguimiento

| Indicador | Valor |
|---|---|
| Tiempo promedio de confirmación y asignación | 49,35 min |
| Tiempo promedio del ciclo completo | 212,28 min |
| Pedidos atendidos correctamente | 89,52 % |
| Pedidos con trazabilidad completa | 95,02 % |
| Entregas realizadas | 94,21 % |

### Complementarios

| Indicador | Valor |
|---|---|
| Clientes con datos completos | 100 % |
| Envases con información completa | 100 % |
| Consulta del historial de envases | 0,06 s |
| Consolidado diario | 0,007 s |

### Eficiencia por repartidor

Archivo: [`evidencias/reportes-csv/entregas.csv`](../evidencias/reportes-csv/entregas.csv).

| Repartidor | Zona | Entregas | Demora promedio |
|---|---|---:|---:|
| Miguel Chávez Rojas | Iberia centro | 350 | 21,9 min |
| Rosa Paredes Nina | Iberia perimetral | 362 | 22,4 min |
| Iván Ccorimanya Choque | Iberia y comunidades | 376 | 21,5 min |
| **Total** | | **1.088** | |

### Totales del periodo

Estos son los valores que muestra el cuadro resumen de cada reporte, con el
periodo completo:

| Reporte | Indicador | Valor |
|---|---|---:|
| Ventas | Cantidad de ventas | 1.088 |
| Ventas | Total vendido | S/ 58.734 |
| Ventas | Total cobrado | S/ 52.398 |
| Ventas | Por cobrar | S/ 6.336 |
| Pedidos | Total de pedidos | 1.145 |
| Pagos | Cantidad de pagos | 977 |
| Entregas | Total de entregas | 1.088 |
| Entregas | Entregadas | 1.025 |
| Entregas | No entregadas | 63 |
| Entregas | Porcentaje entregadas | 94,21 % |
| Envases | Movimientos registrados | 712 |
| Inventario | Movimientos registrados | 1.885 |
| Inventario | Movimientos coherentes | 1.885 |
| Inventario | Actualización correcta del stock | 100 % |

## 5. De dónde salen los tiempos

Los tiempos del postest no salen del azar sino de los retardos que el simulador
programa en cada etapa, en `scripts/simulador-proceso.ts`:

| Etapa | Retardo desde la anterior |
|---|---|
| Recepción del pedido → registro | 2 a 18 min |
| Registro → confirmación | 1 a 25 min |
| Confirmación → venta | 1 a 30 min |
| Venta → asignación de repartidor | 2 a 40 min |
| Asignación → salida a ruta | 5 a 45 min |
| Salida → entrega | 30 a 240 min |
| Demora registrada en la entrega | 0 a 45 min |

**Estos valores son un supuesto, no una medición.** Reflejan una jornada de
distribución cualquiera; los de la empresa real se registran tomando el tiempo
en cada etapa. Si la observación en campo dio otros valores, se cambian estas
líneas y se vuelve a simular: el indicador se recalcula solo.

Con los valores actuales, el tiempo de registro (10,11 min) es el intervalo
entre que el cliente pide y que alguien anota el pedido, no el tiempo que tarda
la persona en escribirlo. Conviene tenerlo presente al interpretar la
comparación.

## 6. Comparación con el pretest

Archivo: [`evidencias/indicadores/comparativo.json`](../evidencias/indicadores/comparativo.json).

| Indicador | Pretest | Postest | Variación |
|---|---:|---:|---:|
| Tiempo promedio de registro | 5 min | 10,11 min | +102,2 % |
| Tiempo de procesamiento de la venta | 10 min | 15,24 min | +52,4 % |
| Tiempo de confirmación y asignación | 8 min | 49,35 min | +516,9 % |
| Pedidos registrados correctamente | sin dato | 100 % | — |
| Ventas procesadas correctamente | sin dato | 85,48 % | — |
| Pedidos atendidos correctamente | sin dato | 89,52 % | — |
| Pedidos con trazabilidad completa | sin dato | 95,02 % | — |

### Dos advertencias sobre esta tabla

**Los tiempos del pretest son marcadores de posición.** En
`src/services/indicadores.service.ts`, `PRETEST_BASE` trae 5, 10 y 8 minutos
como valores por defecto para que la comparación se pueda ver antes de cargar la
medición real. Hasta que se registren las mediciones del pretest, **esta tabla
no sostiene ninguna conclusión**: con esos números el postest parece peor en las
tres dimensiones, pero eso dice más de los marcadores que del sistema.

**Los porcentajes del pretest están en `null` a propósito.** No se midieron, y un
0 ahí se leería como «ningún pedido se registraba bien antes», que es una
afirmación que nadie puede sostener. La interfaz los muestra como «sin dato» en
vez de como cero.

Los valores reales del pretest se cargan desde la pantalla **Indicadores**, en el
apartado de parámetros del pretest.

## 7. Adecuación funcional

Archivo: [`evidencias/indicadores/comparativo.json`](../evidencias/indicadores/comparativo.json).

| Indicador | Valor |
|---|---|
| Requisitos implementados y aprobados | 12 de 12 (100 %) |
| Casos de prueba superados | 0 % |

El seed registra 12 requisitos funcionales y 18 casos de prueba, estos últimos
en estado `PENDIENTE` porque su ejecución es una etapa de la medición y no
corresponde al seed inventarla.

**El 0 % no significa que los casos fallen: significa que aún no se ejecutaron.**
La suite automatizada del proyecto tiene 83 pruebas en verde, pero son pruebas de
integración de la API y no están mapeadas caso a caso con los `CP-01` a `CP-18`.
Para que este indicador refleje la medición, hay que registrar el resultado de
ejecutar cada caso y cargar su `estado`, `fechaEjecucion` y, si falló, el
mensaje de error.

## 8. Eficiencia y fiabilidad del sistema

Archivo: [`evidencias/indicadores/sistema.json`](../evidencias/indicadores/sistema.json).

Estos indicadores se calculan a partir de `bitacora_http`, la tabla donde el
propio sistema registra cada petición atendida.

| Indicador | Observación |
|---|---|
| Peticiones registradas | 243 |
| Tiempo de respuesta promedio | 90,94 ms |
| Mediana | 37 ms |
| Percentil 95 | 305 ms |
| Percentil 99 | 383 ms |
| Pico de peticiones por minuto | 34 |
| Transacciones sostenidas por minuto | 0,01 |
| Solicitudes fallidas | 0 |
| Incidencias registradas | 0 |
| Disponibilidad observada | 100 % |

**Estas cifras son de una sesión corta de verificación, no de un periodo de uso.**
El servidor llevaba pocos minutos levantado cuando se tomaron. Los tiempos por
ruta son válidos como muestra del comportamiento del sistema, pero el volumen
total y el rendimiento sostenido por minuto requieren un periodo de uso real
antes de citarlos en la tesis.

## 9. Archivos de evidencia

```
evidencias/
├── indicadores/
│   ├── proceso.json        Indicadores del proceso del periodo medido
│   ├── sistema.json        Eficiencia, fiabilidad y adecuación funcional
│   └── comparativo.json    Pretest, postest y su comparación
├── reportes-csv/
│   ├── ventas.csv          500 ventas del periodo
│   ├── pedidos.csv         500 pedidos
│   ├── pagos.csv           500 pagos
│   ├── entregas.csv        500 entregas
│   ├── clientes.csv        6 clientes con su saldo del periodo
│   ├── bidones.csv         Movimientos de envases
│   ├── inventario.csv      Movimientos de stock
│   └── tiempos-proceso.csv Indicadores por etapa
├── suite-pruebas.txt          Salida de `npm test` (backend)
└── suite-pruebas-frontend.txt Salida de `npx vitest run` (frontend)
```

Los CSV corresponden a la llamada con `formato=csv` y al periodo
2026-08-31 a 2026-09-30, con el administrador como usuario. Se generan con:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/api/reportes/ventas?fechaInicio=2026-08-31&fechaFin=2026-09-30&formato=csv" \
  -o ventas.csv
```

### Cómo se obtuvieron

| Archivo | Origen |
|---|---|
| `indicadores/proceso.json` | `GET /api/reportes/indicadores/proceso` |
| `indicadores/sistema.json` | `GET /api/reportes/indicadores/sistema` |
| `indicadores/comparativo.json` | `GET /api/reportes/indicadores/comparativo` |
| `reportes-csv/*.csv` | `GET /api/reportes/{reporte}?formato=csv` |
| `suite-pruebas.txt` | `npm test` (backend) |
| `suite-pruebas-frontend.txt` | `npx vitest run` (frontend) |

## 10. Pruebas automatizadas

Dos suites automatizadas, una por capa:

| Evidencia | Suite | Cobertura |
|---|---|---|
| [`evidencias/suite-pruebas.txt`](../evidencias/suite-pruebas.txt) | Backend — `npm test` (Jest) | API y reglas de negocio, contra `DATABASE_URL_TEST` |
| [`evidencias/suite-pruebas-frontend.txt`](../evidencias/suite-pruebas-frontend.txt) | Frontend — `npx vitest run` | Componentes, hooks, sesión, cliente HTTP y pantallas |

### Backend: 85 pruebas en 6 archivos, todas en verde

| Archivo | Cubre |
|---|---|
| `auth.test.ts` | Ingreso, perfil, refresco de token, autorización por rol, rutas inexistentes. |
| `pedidos.test.ts` | Alta de pedido, transiciones de estado, historial, listado y conteo. |
| `ventas-pagos.test.ts` | Alta y anulación de venta, alta y anulación de pago. |
| `entregas-bidones.test.ts` | Asignación, recorrido, saldos de envases, aislamiento del repartidor. |
| `reportes.test.ts` | Forma de las respuestas, descarga CSV, totales del resumen y control de acceso. |
| `salud-catalogo.test.ts` | Salud del servicio, catálogo, inventario y alertas. |

**85 pruebas en 6 archivos, todas en verde.**

Dos de ellas merecen mención: crean 520 filas reales para comprobar que los
totales del resumen siguen contando el periodo completo y no el detalle
recortado a 500. Ese recorte es invisible con pocas filas, así que la prueba
tiene que superar el tope a propósito.

Las pruebas se ejecutan contra `DATABASE_URL_TEST`, una base aparte. Ejecutar
`npm test` no altera los datos del postest. Para que la salida conserve los
acentos sin corromperse, la captura se hace con la redirección del proceso
(`cmd /c "npm test > archivo 2>&1"`), no pasándola por una tubería.

### Frontend: 233 pruebas en 11 archivos, todas en verde

| Archivo | Cubre |
|---|---|
| `App.test.tsx` | Protección de rutas por sesión y rol, ruta desconocida |
| `services/http.test.ts` | Token, cabecera de autorización, envoltura de la API, errores, renovación ante 401, login |
| `context/ProveedorSesion.test.tsx` | Restauración de sesión, token rechazado, fallo transitorio, inicio y cierre |
| `hooks/index.test.tsx` | `useFormulario`: valores, envío y errores del backend por campo |
| `hooks/useListado.test.ts` | Carga, búsqueda, paginación, orden y filtros |
| `components/ui.test.tsx` | Botón, campo, selección, aviso y etiqueta |
| `utils/formato.test.ts` | Importes, duraciones, fechas relativas y estados |
| `pages/Clientes.test.tsx` | Listado, alta, edición, cambio de estado y filtros |
| `pages/Pedidos.test.tsx` | Listado, autocompletado de cliente, líneas, importes, datos de entrega, registro y estados |
| `pages/Entregas.test.tsx` | Listado, asignación y ficha de la entrega |
| `pages/Pagos.test.tsx` | Resumen de cobranza, listado, permisos, registro y anulación |

Estas pruebas se ejecutan sin red ni base de datos: el cliente HTTP se
sustituye por un mock. Al escribirlas destaparon cuatro defectos reales de las
pantallas de Pagos y Entregas, ya corregidos (detalle en la auditoría de
consistencia, sección 6.3).

## 11. Cómo reproducir la medición

```bash
cd backend

# 1. Verificar que nada se rompió.
npm test

# 2. Regenerar el histórico con los mismos parámetros.
npm run simular -- --limpiar --dias=30 --pedidosPorDia=45 --semilla=2026

# 3. Levantar el servidor y capturar los reportes.
npm run dev
```

Los pasos 1 y 2 dejan el sistema en el estado en que se tomaron las evidencias.
El paso 3 se hace aparte porque `npx prisma generate` y la suite necesitan
acceso al binario del cliente de Prisma, que se bloquea si el servidor está
corriendo.

## 12. Qué falta para cerrar la medición

Estas tareas dependen de datos que el sistema no puede inventar:

1. **Medir el pretest en la empresa** y cargar los tres tiempos reales y los
   cuatro porcentajes. Sin eso, la comparación no es concluyente.
2. **Ejecutar los 18 casos de prueba** y registrar el resultado de cada uno, para
   que el indicador de adecuación funcional deje de marcar 0 %.
3. **Registrar los tiempos reales por etapa** y, si difieren de los supuestos,
   ajustar los retardos del simulador.
4. **Usar el sistema durante un periodo definido** antes de citar los
   indicadores de eficiencia y fiabilidad, que ahora reflejan una sesión de
   verificación.
