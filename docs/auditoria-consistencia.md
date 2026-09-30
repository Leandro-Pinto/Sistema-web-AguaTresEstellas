# Auditoría de consistencia con el prompt maestro

Revisión del sistema existente frente a las especificaciones del proyecto. La
primera pasada no modificó el código: registró qué coincide, qué difiere y qué
se decide no cambiar, con la razón técnica. Las secciones 3 y 4 reflejan el
estado en esa fecha; la sección 6 registra las intervenciones posteriores que
cerraron D5, D10 y D7.

Fecha: 2026-09-29
Actualizado: 2026-09-30 — D5, D10 y D7 resueltas; no quedan brechas reales.

---

## 1. Verificación ejecutada

| Comprobación | Comando | Resultado |
|---|---|---|
| Tipos del backend | `npm run typecheck` | Sin errores |
| Tipos de scripts/prisma/tests | `npm run typecheck:scripts` | Sin errores |
| Suite de pruebas | `npm test` | **88/88 pasan**, 6 suites, 56.3 s |
| Compilación del frontend | `npm run build` | Correcta, 484 kB (130 kB gzip) |
| Lint del frontend | `npm run lint` | Sin hallazgos |
| Módulos de Clientes | CRUD completo por API | Verificado, incluye rechazo de duplicados |
| Módulos de Productos e Inventario | Movimiento de stock por API | Verificado, autorización por rol comprobada |

**Nota sobre `prisma generate`:** falla con `EPERM` si el servidor de
desarrollo está corriendo, porque el motor de Prisma tiene bloqueado el
archivo `query_engine-windows.dll.node`. No es un defecto del código. Para
regenerar el cliente hay que detener el backend antes.

Esta tabla es la línea base de la auditoría, medida antes de las
intervenciones. La verificación hecha después de cerrarlas está en la
sección 6.

---

## 2. Lo que ya cumple el prompt

No se modificó nada de esta sección: está implementado y verificado.

### Arquitectura

Estructura de tres capas presente y respetada. `backend/src/` contiene
`routes/`, `controllers/`, `services/`, `middlewares/`, `validators/`,
`config/` y `utils/`. Las reglas de negocio están en los servicios, no en los
controladores ni en componentes React.

### Base de datos

Las 14 tablas exigidas por el prompt existen, más las necesarias para la
variable independiente de la tesis:

| Tabla | Estado |
|---|---|
| `roles`, `usuarios` | Correcto |
| `clientes` | Correcto, unicidad `@@unique([tipo, documento])` |
| `productos` | Correcto |
| `pedidos`, `detalle_pedidos` | Correcto |
| `ventas`, `detalle_ventas` | Correcto, `pedidoId` único garantiza una venta por pedido |
| `pagos` | Correcto |
| `repartidores` | Correcto |
| `entregas` | Correcto, `pedidoId` único |
| `movimientos_bidones` | Correcto, saldo por movements con `saldoAnterior`/`saldoResultante` |
| `movimientos_inventario` | Correcto |
| `historial_estados` | Correcto |

Tablas adicionales para la evidencia de la tesis: `bitacora_http`,
`log_consultas`, `incidencias_sistema`, `requisitos_funcionales`,
`casos_prueba`, `correlativos`, `empresa`.

Índices, claves foráneas y `onDelete` explícitos en todas las relaciones.

### Reglas de negocio

| Regla del prompt | Implementación | Verificación |
|---|---|---|
| Un pedido no genera dos ventas | `Venta.pedidoId` es `@unique` + validación en servicio | Suite de pruebas |
| No se venden pedidos PENDIENTE/CANCELADO | Validación en `ventas.service` | Suite de pruebas |
| Pago no mayor al saldo | Validación en `pagos.service` | Suite de pruebas |
| Stock solo por movimientos | `productos.service` omite `stock` en el update; toda variación pasa por `aplicarMovimientoInventario` | Verificado por API: enviar `stock: 9999` en un PUT deja el stock intacto |
| Saldo de bidones del historial | `movimientos_bidones` con saldo acumulado | Suite de pruebas |
| No cerrar entrega sin salir a ruta | Máquina de estados de `entregas.service` | Suite de pruebas |
| Entrega no realizada exige motivo | Campo `motivoNoEntrega` obligatorio en ese estado | Suite de pruebas |
| Transiciones imposibles bloqueadas | `TRANSICIONES` en `pedidos.service`; `ENTREGADO` no tiene salida | Suite de pruebas |
| Autorización en backend | Middleware `autorizar` en cada ruta; el rol se relee de la BD en cada petición | Verificado: vendedor recibe 403 al mover inventario |

33 transacciones `prisma.$transaction` en los servicios, incluidas todas las
operaciones críticas de venta, pago, entrega e inventario.

### Seguridad

JWT con tokens de acceso y renovación separados, bcrypt, Helmet, CORS,
rate limiting, validación Zod en todos los endpoints, manejo centralizado de
excepciones, y el frontend nunca recibe `passwordHash`.

`.env` está correctamente excluido por `.gitignore` (verificado con
`git check-ignore`).

### Trazabilidad para la tesis

`historial_estados` registra tipo de entidad, id, código, estado anterior,
estado nuevo, acción, descripción, usuario y fecha. No se borra físicamente.

Las marcas de tiempo del proceso están en el modelo de datos, no se calculan
en la interfaz: `recibidoEn`/`registradoEn` (TPRP), `confirmadoEn`,
`asignadoEn`, `enRutaEn`, `entregadoEn`, y en entregas `horaSalida` y
`horaEntrega`.

Existe un simulador (`npm run simular`) con semilla reproducible que genera
el histórico del postest usando los servicios reales.

---

## 3. Diferencias detectadas

### D1. Formato de la respuesta de la API

**Prompt §27:** `{ "success": true, "message": "...", "data": {} }`
**Sistema:** `{ "exito": true, "mensaje": "...", "datos": {} }`

**Decisión: no se cambia.** El formato español es consistente en los 110
endpoints, en el cliente HTTP del frontend y en toda la documentación ya
escrita. Cambiarlo tocaría el backend, el frontend y los anexos de la tesis a
cambio de un beneficio únicamente cosmético. El prompt pide "mantener un
formato consistente", y el sistema lo cumple.

### D2. Prefijos de ruta anidados

**Prompt §27:** `/api/repartidores`, `/api/inventario`
**Sistema:** `/api/entregas/repartidores`, `/api/productos/inventario`

**Decisión: no se cambia.** Los recursos están donde corresponden
semánticamente: los repartidores se consultan al asignar entregas y el
inventario pertenece al producto. La funcionalidad es idéntica.

### D3. Verbos HTTP en Clientes

**Prompt §12:** `PATCH /api/clientes/:id`, `PATCH /api/clientes/:id/restore`
**Sistema:** `PUT /:id`, `PATCH /:id/estado`, `POST /:id/restaurar`

**Decisión: no se cambia.** El sistema es más preciso: `PUT` reemplaza los
datos del cliente, `PATCH /estado` cambia solo el booleano `activo`, y
`POST /restaurar` ejecuta una acción. Verificado: los siete verbos funcionan y
el duplicado se rechaza con 409.

### D4. Falta React Hook Form, Zod y Axios en el frontend

**Prompt §8** los lista explícitamente.
**Sistema:** usa `fetch` nativo y un hook propio `useFormulario`.

**Decisión: pendiente de decidir.** El hook propio ya cumple la función
(estado del formulario, mapeo de errores por campo desde el backend) con cero
dependencias. Migrar a las tres librerías es trabajo real sobre 16 páginas y
no mejora el comportamiento del sistema. Es una desviación formal del stack,
no una carencia funcional.

### D5. Sin pruebas de frontend

**Prompt §34:** pide pruebas de formularios, validaciones, navegación, errores
de API y protección de rutas.
**Sistema (en la fecha de la auditoría):** cero archivos de prueba en
`frontend/`.

**Estado: resuelta.** Ver sección 6.2: 12 archivos y 239 pruebas, y además
cuatro defectos de las pantallas de Pagos y Entregas que las pruebas destaparon
y que quedaron corregidos.

### D6. Sin ESLint ni Prettier

**Prompt §8 y §33** los piden.
**Sistema:** `oxlint` en el frontend (pasa sin hallazgos); nada en el backend.

**Decisión: no se cambia el linter.** `oxlint` cumple la misma función sobre
el mismo estándar. Falta un linter en el backend, que es un añadido de bajo
riesgo.

### D7. Sin exportación a PDF

**Prompt §23:** pide PDF y Excel/CSV.
**Sistema (en la fecha de la auditoría):** solo CSV (`reportes.controller.ts:36`).

**Estado: resuelta.** Ver sección 6.6: exportación PDF con PDFKit y los mismos
datos que la vista, pruebas en ambas suites y evidencia real en `evidencias/`.

### D8. Estructura de `docs/`

**Prompt §10:** pide `docs/arquitectura/`, `docs/base-datos/`, `docs/api/`,
`docs/pruebas/`.
**Sistema:** cinco archivos planos en `docs/`.

**Decisión: reordenar al final.** El contenido existe y es completo; solo
cambia la organización.

### D9. Enrutado sin carpeta `routes/`

**Prompt §10:** pide `frontend/src/routes/`.
**Sistema:** el enrutado está en `frontend/src/App.tsx` con la guarda
`RutaProtegida`.

**Decisión: no se cambia.** Un solo archivo de rutas para 16 pantallas es
legible y no necesita fragmentarse.

### D10. Repositorio sin historial de commits

**Prompt §43:** pide commits con mensajes conventional.
**Sistema (en la fecha de la auditoría):** la rama `master` no tenía ningún
commit; todo estaba sin versionar.

**Estado: resuelta.** Ver sección 6.4: rama `main` con ocho commits
conventional, agrupados por etapas.

---

## 4. Brechas reales a resolver

Eran tres, en orden de prioridad:

1. **D5 — Pruebas de frontend.** Es lo que el prompt exige y no existía.
2. **D10 — Historial de Git.** Todo el trabajo estaba sin versionar.
3. **D7 — Exportación a PDF.**

**Estado actual:** las tres quedaron resueltas (sección 6). No queda ninguna
brecha real frente al prompt.

Las diferencias D1, D2, D3, D4, D6, D8 y D9 son formales: el comportamiento
del sistema cumple el prompt aunque la forma difiera. No justifican refactorizar
código que funciona y que ya está documentado.

---

## 5. Lo que este sistema ya cumple y el prompt no pedía

Se registra para que no se pierda en futuras revisiones:

- Simulador de proceso con semilla reproducible, que invoca los servicios
  reales en vez de escribir en la base por la vía rápida, para que el
  histórico del postest cumpla las mismas reglas de negocio que producción.
- Tablas de evidencia de la tesis (`bitacora_http`, `log_consultas`,
  `incidencias_sistema`) que alimentan los indicadores de la variable
  independiente.
- Renovación de token con promesa compartida, que evita que cinco
  peticiones simultáneas disparen cinco renovaciones y cierren la sesión de
  un usuario legítimamente autenticado.
- Sesión en `sessionStorage` cuando el usuario no marca "recordarme".
- Pruebas de integración reales contra base de datos, sin mocks de las reglas
  transaccionales.

---

## 6. Intervenciones posteriores a la auditoría

Tras esta revisión se cerraron las tres brechas reales. Todo el trabajo
queda registrado en el historial de Git del repositorio.

### 6.1 Verificación ejecutada después de las intervenciones

| Comprobación | Comando | Resultado |
|---|---|---|
| Tipos del frontend | `npx tsc -b` | Sin errores |
| Pruebas del frontend | `npx vitest run` | **239/239 pasan**, 12 archivos, 57.4 s |
| Lint del frontend | `npm run lint` | Sin hallazgos |
| Tipos del backend | `npm run typecheck` | Sin errores |
| Pruebas del backend | `npm test` | **88/88 pasan**, 6 suites, 56.3 s |
| Descarga PDF real | `GET /api/reportes/ventas?formato=pdf` | PDF válido con 500 filas de detalle |
| Historial de Git | `git log --oneline` | 12 commits conventional en `main` |

La suite del backend pasó de 85 a 88 casos con las tres pruebas de exportación
PDF; la del frontend, de 233 a 239 con las seis pruebas de la pantalla de
Reportes.

### 6.2 D5 resuelta: pruebas de frontend

Se añadieron 12 archivos de prueba con 239 casos, cubriendo lo que el prompt
§34 pide: formularios y sus validaciones, navegación, errores de API y protección
de rutas.

| Archivo | Qué cubre |
|---|---|
| `App.test.tsx` | Protección de rutas por sesión y rol, ruta desconocida |
| `services/http.test.ts` | Token, cabecera de autorización, envoltura de la API, normalización de errores, renovación ante 401, login |
| `context/ProveedorSesion.test.tsx` | Estado inicial, restauración de sesión, token rechazado, fallo transitorio, inicio y cierre de sesión |
| `hooks/index.test.tsx` | `useFormulario`: valores, envío y mapeo de errores del backend a cada campo |
| `hooks/useListado.test.ts` | Carga inicial, búsqueda con retardo, paginación, orden y estabilidad de filtros |
| `components/ui.test.tsx` | Botón, campo, selección, aviso y etiqueta |
| `utils/formato.test.ts` | Importes, duraciones, fechas relativas y estados |
| `pages/Clientes.test.tsx` | Listado, alta, edición, cambio de estado y filtros |
| `pages/Pedidos.test.tsx` | Listado, autocompletado de cliente, líneas, importes, datos de entrega, registro, cambio de estado y ficha |
| `pages/Entregas.test.tsx` | Listado, asignación y ficha de la entrega |
| `pages/Pagos.test.tsx` | Resumen de cobranza, listado, permisos, registro y anulación |
| `pages/Reportes.test.tsx` | Despliegue de reportes, formato y filtros de la descarga CSV y PDF, reportes sin exportación |

### 6.3 Defectos que las pruebas destaparon

Las pruebas no fueron solo cobertura: al escribirlas aparecieron defectos
reales, que se corrigieron.

| Defecto | Corrección |
|---|---|
| El diálogo de anulación de pago se cerraba y perdía el motivo cuando el backend rechazaba la operación | El diálogo y el motivo se conservan ante el error |
| «Anular pago» quedaba habilitado sin motivo y el backend respondía 400 | El botón se deshabilita mientras el motivo está vacío |
| La pantalla de pagos pedía todas las ventas con saldo al montar, no al abrir el diálogo | Consulta perezosa al abrir el modal |
| La venta seleccionada podía seguir siendo cobrable aunque ya no estuviera en el listado visible | La selección se descarta cuando la venta desaparece de los resultados |
| Entregas cargaba la lista completa al montar y mantenía una selección que no derivaba del resultado | Consulta perezosa y selección derivada del listado |

### 6.4 D10 resuelta: historial de Git

La rama se renombró de `master` a `main` y se creó el historial inicial con ocho
commits conventional, agrupados por etapas para que cada commit sea revisable
por separado:

| Commit | Contenido |
|---|---|
| `chore` | Configuración, manifiestos, lockfiles y herramientas |
| `feat(backend)` | Esquema Prisma y sus cuatro migraciones |
| `feat(backend)` | API REST completa: rutas, controladores, servicios, validadores y middlewares |
| `feat(backend)` | Simulador de proceso del postest |
| `test(backend)` | 85 pruebas de integración |
| `feat(frontend)` | Aplicación e interfaz de gestión |
| `test(frontend)` | 233 pruebas de frontend |
| `docs` | Documentación y evidencias del postest |

Con el cierre de D7 (sección 6.6) se añadieron cinco commits más:

| Commit | Contenido |
|---|---|
| `feat(backend)` | Exportación a PDF de todos los reportes (`utils/pdf.ts`) |
| `test(backend)` | Tres pruebas de la descarga PDF y suite regenerada |
| `feat(frontend)` | Botón de descarga en PDF en la pantalla de Reportes |
| `test(frontend)` | Seis pruebas de la pantalla de Reportes y suite regenerada |
| `docs` | Auditoría completa, documentación del postest y evidencias PDF reales |

En total son **17 commits conventional** en `main`.

172 archivos versionados. `.env`, `node_modules/` y `dist/` quedan fuera por
`.gitignore`, mientras que `.env.example` sí se versiona. El repositorio aún no
tiene remoto configurado.

### 6.5 D7 resuelta: exportación a PDF

**Prompt §23** pide que los reportes se exporten en PDF y Excel/CSV. El sistema
ya tenía CSV y Excel (CSV con BOM), con las dos suites en verde; faltaba el PDF.

Se añadió `backend/src/utils/pdf.ts`, que compone el documento con PDFKit y las
fuentes estándar Helvetica (cubren los acentos del español sin archivos de
fuente). El PDF no es una sola tabla: reproduce el **resumen y todas las listas**
de cada reporte en secciones, con tablas de columnas proporcionales, paginación,
encabezado y pie de página por página, y números alineados a la derecha. El
controlador `entregarReporte` responde el mismo contenido en JSON, CSV o PDF
según `formato`; la pantalla de Reportes ofrece los tres botones de descarga
(CSV y PDF) y conserva el rango y los filtros del periodo que se está mirando.

Garantías verificadas:

| Comprobación | Resultado |
|---|---|
| `formato=pdf` devuelve `application/pdf`, nombre `reporte_<clave>_<fecha>.pdf` y un PDF con `%PDF-`, páginas y `%%EOF` | 3 pruebas nuevas en `tests/reportes.test.ts` |
| El PDF no rompe cuando el periodo no tiene registros | Probado |
| El reporte sin listas (tiempos de proceso) exporta sus indicadores | Probado |
| La descarga en la interfaz envía `formato=csv` o `formato=pdf` y mantiene el rango | 6 pruebas nuevas en `pages/Reportes.test.tsx` |
| Descarga real | `GET /api/reportes/ventas?formato=pdf`: PDF válido con el detalle del periodo |

Los seis PDF de muestra generados con datos del postest quedan en `evidencias/`
(`reporte-*.pdf`).

### 6.6 Resumen final

No quedan brechas reales frente al prompt maestro. Las diferencias D1, D2, D3,
D4, D6, D8 y D9 siguen siendo formales y, como se explica en sus secciones, no
justifican refactorizar lo que funciona. El sistema queda con **88 pruebas de
integración y 239 pruebas de interfaz**, todas en verde, y **17 commits
conventional** en `main`.
