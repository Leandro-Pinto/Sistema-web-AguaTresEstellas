# Auditoría de consistencia con el prompt maestro

Revisión del sistema existente frente a las especificaciones del proyecto, sin
modificar el código. Registra qué coincide, qué difiere y qué se decide no
cambiar, con la razón técnica.

Fecha: 2026-09-29

---

## 1. Verificación ejecutada

| Comprobación | Comando | Resultado |
|---|---|---|
| Tipos del backend | `npm run typecheck` | Sin errores |
| Tipos de scripts/prisma/tests | `npm run typecheck:scripts` | Sin errores |
| Suite de pruebas | `npm test` | **85/85 pasan**, 6 suites, 37.7 s |
| Compilación del frontend | `npm run build` | Correcta, 484 kB (130 kB gzip) |
| Lint del frontend | `npm run lint` | Sin hallazgos |
| Módulos de Clientes | CRUD completo por API | Verificado, incluye rechazo de duplicados |
| Módulos de Productos e Inventario | Movimiento de stock por API | Verificado, autorización por rol comprobada |

**Nota sobre `prisma generate`:** falla con `EPERM` si el servidor de
desarrollo está corriendo, porque el motor de Prisma tiene bloqueado el
archivo `query_engine-windows.dll.node`. No es un defecto del código. Para
regenerar el cliente hay que detener el backend antes.

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
**Sistema:** cero archivos de prueba en `frontend/`.

**Estado: brecha real.** El backend tiene 85 pruebas de integración; el
frontend no tiene ninguna. Es la mayor carencia del proyecto frente al prompt.

### D6. Sin ESLint ni Prettier

**Prompt §8 y §33** los piden.
**Sistema:** `oxlint` en el frontend (pasa sin hallazgos); nada en el backend.

**Decisión: no se cambia el linter.** `oxlint` cumple la misma función sobre
el mismo estándar. Falta un linter en el backend, que es un añadido de bajo
riesgo.

### D7. Sin exportación a PDF

**Prompt §23:** pide PDF y Excel/CSV.
**Sistema:** solo CSV (`reportes.controller.ts:36`).

**Estado: brecha real**, de alcance conocido.

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
**Sistema:** la rama `master` no tiene ningún commit; todo está sin versionar.

**Estado: brecha real.** El trabajo existe pero no está registrado.

---

## 4. Brechas reales a resolver

Tres, en orden de prioridad:

1. **D5 — Pruebas de frontend.** Es lo que el prompt exige y no existe.
2. **D10 — Historial de Git.** Todo el trabajo está sin versionar.
3. **D7 — Exportación a PDF.**

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
