# Arquitectura y API

## 1. Vista general

```
┌──────────────┐        HTTP/JSON         ┌───────────────────────────┐
│  Frontend    │ ───────────────────────▶ │  Backend (Express)        │
│  React 19    │ ◀─────────────────────── │  TypeScript               │
│  Vite        │                          │                           │
└──────────────┘                          │  routes → validators →     │
                                          │  controllers → services →  │
                                          │  Prisma                    │
                                          └─────────────┬─────────────┘
                                                        │
                                          ┌─────────────▼─────────────┐
                                          │  MariaDB / MySQL          │
                                          └───────────────────────────┘
```

El backend separa las rutas (qué se puede pedir), los validadores (que la
petición sea válida), los controladores (la forma de la respuesta) y los
servicios (la regla de negocio). La regla de negocio no vive en el controlador:
así el simulador de demostración puede invocar los mismos servicios que la
aplicación, sin escribir directamente en la base.

## 2. Capas

| Capa | Ruta | Responsabilidad |
|---|---|---|
| Rutas | `src/routes/` | Declaran el método, la URL y los roles autorizados. |
| Validadores | `src/validators/` | Esquemas Zod para cuerpo, consulta y parámetros. |
| Controladores | `src/controllers/` | Traducen la petición y la respuesta HTTP. |
| Servicios | `src/services/` | Reglas de negocio y acceso a datos. |
| Middlewares | `src/middlewares/` | Autenticación, autorización, validación, bitácora y errores. |
| Utilidades | `src/utils/` | Fechas, exportación CSV y PDF, dinero. |
| Configuración | `src/config/` | Variables de entorno y cliente de Prisma. |

### Middlewares de la cadena

Se aplican en este orden, y el orden importa:

1. `helmet` — cabeceras de seguridad.
2. `cors` — solo el origen declarado en `CORS_ORIGIN`.
3. `compression` — respuestas comprimidas.
4. `express.json` / `urlencoded` — cuerpo, con tope de 1 MB.
5. Limitador de peticiones sobre `/api/auth/login`.
6. Manejador de errores de validación de Zod.
7. `marcarTiempo` — anota el instante de la petición.
8. `bitacoraHttp` — registra la petición para los indicadores del sistema.
9. Rutas.
10. `noEncontrado` y `manejadorErrores` — respuestas 404 y de error.

`bitacoraHttp` existe porque los indicadores de eficiencia del sistema (tiempo
de respuesta promedio, mediana, percentiles) se calculan a partir de lo que el
sistema registró de sí mismo, no de una medición externa.

## 3. Autenticación y autorización

### Ingreso

```
POST /api/auth/login  { email, password, recordar? }
```

Devuelve un token de acceso JWT y, si se pidió recordar, un token de refresco.
La renovación se hace con:

```
POST /api/auth/refresh  { refreshToken }
```

La contraseña se compara contra un hash bcrypt. El login tiene límite de
intentos: tras `MAX_INTENTOS_LOGIN` fallos la cuenta queda bloqueada
`MINUTOS_BLOCCO_LOGIN`. El mensaje de error es el mismo exista o no la cuenta,
para no revelar qué correos están registrados.

### Token

```
Authorization: Bearer <tokenAcceso>
```

### Roles

| Rol | Alcance |
|---|---|
| `ADMINISTRADOR` | Acceso total, incluidos catálogo, usuarios, repartidores y exportación de indicadores. |
| `VENDEDOR` | Registra pedidos, ventas y pagos; consulta clientes, productos e inventario. |
| `REPARTIDOR` | Ve únicamente su ruta y actualiza sus propias entregas. |

El aislamiento del repartidor no depende solo de la interfaz: `mis-entregas`
filtra por la ficha del usuario y `PUT /entregas/:id` rechaza la entrega si no
le pertenece. Un repartidor que alguien más le asignó no puede verla ni
cambiarla.

### Matriz de acceso por endpoint

| Grupo | Operación | Administrador | Vendedor | Repartidor |
|---|---|:--:|:--:|:--:|
| Clientes | Listar, buscar, ver | Sí | Sí | Sí |
| Clientes | Crear, editar, activar, desactivar, eliminar | Sí | Sí | No |
| Pedidos | Listar, ver, historial, conteo de estados | Sí | Sí | Sí |
| Pedidos | Crear, cambiar estado | Sí | Sí | No |
| Ventas | Listar, ver, constancia, historial | Sí | Sí | Sí |
| Ventas | Crear, anular | Sí | Sí | No |
| Pagos | Listar, ver, resumen por método | Sí | Sí | Sí |
| Pagos | Crear, anular | Sí | Sí | No |
| Entregas | Asignar entrega | Sí | Sí | No |
| Entregas | Listar entregas, historial, carga de repartidores | Sí | Sí | Sí |
| Entregas | **Mi ruta** (`mis-entregas`) | No | No | Sí |
| Entregas | Actualizar entrega | Sí | No | Sí (solo la suya) |
| Repartidores | Listar, activos, zonas, ver | Sí | Sí | Sí |
| Repartidores | Crear, editar, activar, desactivar, eliminar, restaurar | Sí | No | No |
| Productos | Listar, ver, inventario, movimientos | Sí | Sí | Sí |
| Productos | Crear, editar, eliminar, restaurar | Sí | No | No |
| Bidones | Saldos, movimientos, historial por cliente | Sí | Sí | Sí |
| Bidones | Registrar entrega, devolución o pérdida | Sí | Sí | Sí |
| Tablero | Resumen, series de ventas, productos más vendidos | Sí | Sí | Sí |
| Tablero | Indicadores del proceso, alertas de bidones | Sí | Sí | No |
| Reportes | Todos los reportes del catálogo | Sí | Sí | Sí |
| Reportes | Costo de consultas, exportar indicadores | Sí | No | No |
| Reportes | Transcribir o corregir la línea base del pretest | Sí | No | No |
| Usuarios y roles | Todo | Sí | No | No |
| Evidencia | Incidencias y fiabilidad | Sí | Sí | Sí |
| Evidencia | Crear, editar, resolver o descartar una incidencia | Sí | Sí | Sí |
| Evidencia | Bitácora de peticiones | Sí | No | No |
| Salud | `/salud` | Público | Público | Público |
| Salud | `/salud/completa` | Sí | No | No |

## 4. Modelo de datos

### Entidades

| Modelo | Qué representa | Notas |
|---|---|---|
| `Rol` | Administrador, Vendedor, Repartidor. | Nivel de jerarquía. |
| `Usuario` | Persona que ingresa al sistema. | `documento` lo enlaza con su ficha de repartidor. |
| `Empresa` | Datos de la empresa usuaria. | |
| `Cliente` | Empresa, institución o persona que compra. | Clave compuesta por tipo y documento. |
| `Producto` | Artículo vendible, incluido el bidón retornable. | `unidadMedida` distingue bidón de unidad. |
| `Repartidor` | Persona que entrega. | `documento` es la llave del vínculo con `Usuario`. |
| `Pedido` | Solicitud del cliente. | Guarda marcas de tiempo de cada etapa y su `origen`. |
| `DetallePedido` | Ítems del pedido. | |
| `Venta` | Conversión de un pedido en venta. | Un pedido genera a lo sumo una venta. |
| `DetalleVenta` | Ítems de la venta. | |
| `Pago` | Abono a una venta. | Efectivo, Yape, transferencia u otro. |
| `Entrega` | Asignación y ejecución de una entrega. | Registra salida a ruta, hora de entrega y demora. |
| `MovimientoBidon` | Salida, devolución o pérdida de un envase. | Lleva el saldo resultante del cliente. |
| `MovimientoInventario` | Entrada o salida de stock de un producto. | |
| `HistorialEstado` | Cambio de estado de pedido, venta o entrega. | Es la trazabilidad que mide la tesis. Hereda la procedencia del registro que documenta. |
| `Correlativo` | Numeración por tipo y año. | |
| `BitacoraHttp` | Petición registrada para los indicadores del sistema. | |
| `IncidenciaSistema` | Incidencia reportada en el módulo de evidencia. | |
| `LogConsulta` | Consulta lenta, para el reporte de costo de consultas. | |
| `RequisitoFuncional` | Requisito de la tesis. | Alimenta el indicador de adecuación funcional. |
| `CasoPrueba` | Caso de prueba asociado a un requisito. | Alimenta el mismo indicador. |
| `LineaBasePretest` | Los nueve valores medidos sobre el proceso manual. | Fila única; guarda quién la registró y quién la corrigió. |

### Enums

| Enum | Valores |
|---|---|
| `EstadoPedido` | `PENDIENTE`, `CONFIRMADO`, `ASIGNADO`, `EN_RUTA`, `ENTREGADO`, `CANCELADO` |
| `EstadoVenta` | `PENDIENTE`, `COMPLETADA`, `ANULADA` |
| `EstadoPago` | `PENDIENTE`, `CONFIRMADO`, `ANULADO` |
| `EstadoEntrega` | `PENDIENTE`, `ASIGNADA`, `EN_RUTA`, `ENTREGADA`, `NO_ENTREGADA`, `CANCELADA` |
| `MetodoPago` | `EFECTIVO`, `YAPE`, `TRANSFERENCIA`, `OTRO` |
| `TipoCliente` | `EMPRESA`, `INSTITUCION`, `PERSONA` |
| `CanalPedido` | `WHATSAPP`, `TELEFONO`, `PRESENCIAL`, `OTRO` |
| `ModalidadEntrega` | `DOMICILIO`, `RECOGER_EN_LOCAL` |
| `TipoMovimientoInventario` | `ENTRADA`, `SALIDA`, `AJUSTE` |
| `TipoMovimientoBidon` | `SALIDA`, `DEVOLUCION`, `PERDIDA_CLIENTE`, `PERDIDA_INTERNA` |
| `EstadoCasoPrueba` | `PENDIENTE`, `APROBADO`, `FALLIDO` |
| `OrigenDato` | `REAL`, `SIMULADO`. Procedencia de cada registro operativo; ver la sección 6. |

### Transiciones de estado

Las transiciones se validan en el servicio, no en la interfaz. Saltarse una
etapa se rechaza con 422.

```
Pedido:   PENDIENTE → CONFIRMADO → ASIGNADO → EN_RUTA → ENTREGADO
                            ↘ CANCELADO
Venta:    PENDIENTE → COMPLETADA  |  ANULADA
Entrega:  ASIGNADA → EN_RUTA → ENTREGADA | NO_ENTREGADA
```

## 5. Endpoints

Prefijo: `/api`. Excepción: la salud pública responde en `/salud`.

### Salud

| Método | Ruta | Rol |
|---|---|---|
| GET | `/salud` | Público |
| GET | `/salud/completa` | Administrador |

`/salud` comprueba que la base responda con un `SELECT 1`. Responde `200` con
`{ estado, baseDeDatos, entorno, version, horaServidor, latenciaBaseMs }` y, si
la base no responde, `503` con `codigo: "BASE_NO_DISPONIBLE"` y los mismos
campos. El entorno viaja en los dos casos porque el frontend lo usa para rotular
la cinta de demostración; una cinta que dependiera de que la base esté bien no
serviría de garantía. `/salud/completa` añade recuentos, memoria y latencia, y
por eso exige sesión.

### Autenticación

| Método | Ruta | Rol |
|---|---|---|
| POST | `/auth/login` | Público |
| POST | `/auth/refresh` | Público |
| POST | `/auth/logout` | Autenticado |
| GET | `/auth/perfil` | Autenticado |
| PUT | `/auth/perfil` | Autenticado |
| POST | `/auth/cambiar-password` | Autenticado |

### Catálogo y clientes

| Método | Ruta | Rol |
|---|---|---|
| GET | `/clientes`, `/clientes/buscar`, `/clientes/distritos`, `/clientes/:id` | Autenticado |
| POST | `/clientes` | Administrador, Vendedor |
| PUT · PATCH · DELETE | `/clientes/:id` y subrutas | Administrador, Vendedor |
| GET | `/productos`, `/productos/activos`, `/productos/:id` | Autenticado |
| GET | `/productos/inventario`, `/productos/inventario/movimientos` | Autenticado |
| POST · PUT · PATCH · DELETE | `/productos/...` | Administrador |

### Operación

| Método | Ruta | Rol |
|---|---|---|
| GET | `/pedidos`, `/pedidos/:id`, `/pedidos/:id/historial`, `/pedidos/conteo-estados` | Autenticado |
| POST | `/pedidos` | Administrador, Vendedor |
| PATCH | `/pedidos/:id/estado` | Administrador, Vendedor |
| GET | `/ventas`, `/ventas/:id`, `/ventas/:id/constancia`, `/ventas/:id/historial` | Autenticado |
| POST | `/ventas`, `/ventas/:id/anular` | Administrador, Vendedor |
| GET | `/pagos`, `/pagos/:id`, `/pagos/resumen-metodo` | Autenticado |
| POST | `/pagos`, `/pagos/:id/anular` | Administrador, Vendedor |

### Entregas, repartidores y bidones

| Método | Ruta | Rol |
|---|---|---|
| GET | `/entregas/mis-entregas` | Repartidor |
| GET | `/entregas/entregas`, `/entregas/entregas/:id`, `/entregas/entregas/:id/historial` | Autenticado |
| POST | `/entregas/entregas` | Administrador, Vendedor |
| PUT | `/entregas/entregas/:id` | Administrador, Repartidor |
| GET | `/entregas/repartidores`, `/activos`, `/zonas`, `/:id` | Autenticado |
| POST · PUT · PATCH · DELETE | `/entregas/repartidores/...` | Administrador |
| GET | `/bidones/saldos`, `/saldos/total`, `/movimientos`, `/clientes/:id/historial` | Autenticado |
| POST | `/bidones/movimientos`, `/clientes/:id/entrega`, `/clientes/:id/devolucion` | Administrador, Vendedor, Repartidor |

### Reportes e indicadores

| Método | Ruta | Rol |
|---|---|---|
| GET | `/reportes/{ventas,pedidos,pagos,entregas,clientes,bidones,inventario,tiempos-proceso,diario}` | Autenticado |
| GET | `/reportes/historial-bidones/:clienteId` | Autenticado |
| GET | `/reportes/costo-consultas` | Administrador |
| GET | `/reportes/indicadores/{proceso,sistema,comparativo,pretest,periodo}` | Autenticado |
| PUT | `/reportes/indicadores/pretest` | Administrador |
| GET | `/reportes/indicadores/exportar` | Administrador |

Los reportes aceptan `formato=csv` o `formato=pdf` para descargarse (sección 7),
y `origen=REAL|SIMULADO` para elegir qué datos se leen (sección 6). Por omisión
se lee `REAL`; pedir `SIMULADO` fuera del entorno `demo` no sirve la mezcla,
corrige el origen y lo explica en el mensaje.

## 6. Forma de las respuestas

### Envoltura

Toda respuesta JSON comparte la misma envoltura:

```json
{ "exito": true, "mensaje": "Reporte de ventas generado", "datos": { } }
```

```json
{ "exito": false, "mensaje": "No se encontró el pedido", "codigo": "NO_ENCONTRADO" }
```

Con `?formato=csv` o `?formato=pdf` la respuesta es el archivo, no la envoltura.

### Reportes con resumen y listas

Devuelven `periodo`, `resumen` y las listas del reporte. Por ejemplo, ventas:

```json
{
  "periodo": { "fechaInicio": "2026-08-31T05:00:00.000Z", "fechaFin": "2026-10-01T05:00:00.000Z" },
  "resumen": {
    "cantidadVentas": 1088, "totalVendido": 58734, "totalCobrado": 52398,
    "porCobrar": 6336, "descuentos": 0, "ticketPromedio": 53.98
  },
  "porMetodoPago": [ { "metodo": "EFECTIVO", "total": 27792.5, "cantidad": 532 } ],
  "porDia":        [ { "fecha": "2026-08-31", "total": 1204, "cantidad": 21 } ],
  "topClientes":   [ { "clienteId": 2, "nombre": "Hotel Vista del Sol S.A.C.", "total": 9757.5, "ventas": 172 } ],
  "ventas": [
    {
      "id": 2044, "numero": "VEN-2026-001065", "fecha": "2026-09-28T23:46:10Z",
      "subtotal": 5, "descuento": 0, "total": 5, "totalPagado": 5, "saldo": 0,
      "estado": "COMPLETADA", "constanciaEmitida": true,
      "cliente": { "id": 2, "nombre": "Hotel Vista del Sol S.A.C.", "documento": "20509876543" },
      "usuario": { "nombreCompleto": "Lucía Quispe Huaman" },
      "pedido": { "codigo": "PED-2026-001121" },
      "pagos": [ { "metodo": "EFECTIVO", "monto": 5 } ]
    }
  ]
}
```

El detalle viene **anidado** tal como lo devuelve Prisma. La interfaz lo lee con
notación de punto (`cliente.nombre`, `venta.cliente.nombre`), no con un
aplanado en el backend, para que el JSON que se descarga sea el mismo que se ve.

Claves en la raíz de cada reporte:

| Reporte | Raíz |
|---|---|
| ventas | `periodo`, `resumen`, `porMetodoPago`, `porDia`, `topClientes`, `ventas` |
| pedidos | `periodo`, `resumen`, `porEstado`, `porCanal`, `pedidos` |
| pagos | `periodo`, `resumen`, `porMetodo`, `porDia`, `pagos` |
| entregas | `periodo`, `resumen`, `porRepartidor`, `porEstado`, `entregas` |
| clientes | `periodo`, `resumen`, `clientes` |
| bidones | `periodo`, `resumen`, `saldos`, `porTipo`, `movimientos` |
| inventario | `periodo`, `resumen`, `porTipo`, `productos`, `movimientos` |
| tiempos-proceso | `periodo`, `muestra`, `indicadores`, `conteos` |
| diario | `fecha`, `resumen`, `pagosPorMetodo`, `pedidosPorEstado` |

`tiempos-proceso` no agrupa sus totales en un objeto `resumen`, y
`costo-consultas` devuelve un arreglo plano. La interfaz lo declara por
reporte en vez de suponer una forma única.

### Indicadores

`/reportes/indicadores/proceso` devuelve los indicadores del proceso de ventas
medidos sobre los datos del periodo:

```json
{
  "periodo": { "fechaInicio": "...", "fechaFin": "..." },
  "muestra": { "pedidos": 1145, "ventas": 1088, "pagos": 977, "entregas": 1088, "clientes": 6 },
  "recepcionYRegistro": { "tiempoPromedioRegistroMin": 10.11, "porcentajePedidosRegistradosCorrectamente": 100 },
  "procesamientoYControl": { "tiempoPromedioProcesamientoVentaMin": 15.24 },
  "atencionYSeguimiento": { "tiempoPromedioCicloCompletoMin": 212.28 },
  "complementarios": { "porcentajeClientesConDatosCompletos": 100 }
}
```

`/reportes/indicadores/comparativo` añade la línea base del pretest, los
indicadores del sistema y la comparación. Cuando un valor del pretest no se ha
medido, viaja como `null` y la interfaz lo muestra como «sin dato» en vez de
como cero: un 0 inventado se lee como una medición, y no lo es.

La línea base vive en la tabla `linea_base_pretest`, que el sistema no precarga
ni calcula. Los nueve valores se transcriben de la ficha de observación:

| Petición | Qué hace | Quién |
|---|---|---|
| `GET /reportes/indicadores/pretest` | Devuelve los nueve valores con su procedencia: `registrada`, `creadoPor`, `creadoEn`, `actualizadoPor`, `actualizadoEn`. Sin registro, `registrada` es `false` y los valores son `null`. | Autenticado |
| `PUT /reportes/indicadores/pretest` | Crea o corrige la fila única. Recibe **solo** los nueve valores. | Administrador |
| `GET /reportes/indicadores/comparativo` | Lee la fila guardada. No acepta parámetros de pretest: la tabla y el registro no pueden divergir. | Autenticado |

La escritura se valida con `pretestSchema.strict()`: porcentajes de 0 a 100,
tiempos de 0 a 1440 minutos, campos vacíos admitidos como `null` («no se midió»
y no «se midió cero») y cualquier clave desconocida rechazada con 422. El
servidor, no la interfaz, decide quién figura como autor y cuándo: es lo que
hace auditable la comparación.

### Procedencia de los datos

Todo registro operativo lleva una columna `origen` con dos valores:

| Valor | Qué significa |
|---|---|
| `REAL` | La operación real de la empresa. Es lo que se mide en la tesis. |
| `SIMULADO` | Lo generó el simulador para demostrar el sistema. |

La regla que sostiene esa distinción está en
`src/services/origen-dato.ts` y es la misma para indicadores y reportes:

- Por omisión se lee `REAL`. Un conjunto simulado no entra en una medición ni
  por descuido.
- `?origen=SIMULADO` solo se atiende en el entorno `demo`. En `prod` y `test`
  la petición se corrige al origen permitido y el mensaje de la respuesta
  explica por qué, en vez de servir la mezcla en silencio.
- Un valor fuera del catálogo se rechaza con 422.
- El simulador no arranca fuera de `demo` (`scripts/simulador-proceso.ts`).

El parámetro está disponible en `/reportes/*` y en
`/reportes/indicadores/{proceso,comparativo}` y
`/reportes/indicadores/exportar`. Los movimientos de inventarios y de envases no
tienen columna propia: se filtran por el pedido que los provocó, que sí la
tiene.

La separación está probada en `tests/origen-datos.test.ts`.

## 7. Exportación CSV y PDF

Los reportes se descargan con `?formato=csv` o `?formato=pdf`. En ambos casos la
respuesta es un archivo adjunto con cabecera `Content-Disposition
attachment`, y el nombre empieza por el prefijo del reporte y termina con la
fecha-hora de generación.

### CSV

- Con BOM y separador `;`, que es lo que Excel en español abre sin pasos extra.
- Si el reporte tiene listas, se exporta **la más extensa**, que es el detalle
  que se está viendo en pantalla. Los cuadros resumen no se cuelan en el
  archivo.
- Si el reporte no tiene ninguna lista, como `tiempos-proceso`, se exporta en
  dos columnas: `indicador` y `valor`.
- Los objetos anidados se aplanan con notación de punto: `cliente.nombre`.
- Los importes de Prisma se escriben como número. No se desarman en sus
  atributos internos.

### PDF

A diferencia del CSV, el PDF no exporta una sola tabla: reproduce el **resumen
y todas las listas** del reporte en secciones, para que sea legible impreso y
equivale a lo que el usuario ve en pantalla.

- Se genera en memoria con PDFKit y las fuentes estándar Helvetica, cuya
  codificación cubre los acentos del español sin depender de archivos de
  fuente.
- Cada lista se dibuja como una tabla de columnas proporcionales, con los
  importes y conteos alineados a la derecha.
- El documento pagina automáticamente: repite encabezado de tabla, título de
  reporte y banda superior en cada página, y lleva pie de página con fecha y
  «página X de Y».
- Si el periodo no tiene registros, la sección dice «Sin registros en el
  periodo.» en lugar de imprimir una tabla vacía.
- `diario` y `costo-consultas` no admiten exportación; la interfaz no les
  ofrece botón de descarga.

## 8. Registro y observabilidad

| Tabla | Qué guarda | Para qué |
|---|---|---|
| `bitacora_http` | Ruta, método, duración, código de respuesta. | Indicadores de eficiencia del sistema. |
| `log_consultas` | Consultas que superan el umbral de duración. | Reporte de costo de consultas. |
| `historial_estados` | Cada cambio de estado con su marca de tiempo. | Tiempos de proceso y trazabilidad. |
| `incidencias_sistema` | Incidencias reportadas, con su resolución. | Indicador de fiabilidad. |

Las tres primeras son la base de las mediciones del postest. Si no se escriben,
los indicadores salen vacíos: por eso el simulador invoca los servicios reales
en lugar de insertar filas directamente.
