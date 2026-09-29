# Manual de usuario por rol

El sistema tiene tres perfiles. El menú lateral muestra a cada uno solo los
módulos que le corresponden, pero la restricción real la aplica el servidor: si
alguien intenta una acción no autorizada, la API responde 403 aunque la
petición se construya a mano.

---

## Acceso

1. Abra `http://localhost:5173`.
2. Ingresse con su correo y contraseña.
3. En el primer ingreso el sistema pide cambiar la contraseña. Las cuentas de
   prueba del seed nacen con `debeCambiarPassword` activo, precisamente para que
   nadie las use con la clave inicial.

Si olvida la contraseña o se bloquea la cuenta por intentos fallidos, la
reposición la hace el administrador desde **Usuarios**.

Al ingresar por primera vez, el sistema exige cambiar la contraseña temporal.

---

## Administrador

Acceso total. Es el rol que mantiene el catálogo, las personas y la evidencia.

### Tablero

Resumen del día: ventas, cobros, pedidos por estado, stock por debajo del
mínimo y alertas de envases. Es la primera pantalla al entrar.

### Pedidos

- **Listar** con búsqueda y filtro por estado. Cada fila muestra en qué punto
  del flujo está el pedido.
- **Ver detalle** con los ítems, el historial completo de cambios de estado y
  las marcas de tiempo de cada etapa. El historial es la evidencia de la
  trazabilidad que mide el postest.
- **Cambiar estado** respetando la secuencia. El sistema no permite, por
  ejemplo, pasar de `PENDIENTE` a `ENTREGADO`: salta etapas y destruye la
  medición de tiempos.
- **Crear pedido** eligiendo cliente, canal de recepción, modalidad de entrega y
  los productos con sus cantidades.

### Ventas

- Crear la venta desde un pedido confirmado. Un pedido genera **una sola** venta:
  el segundo intento se rechaza.
- Anular una venta. Es una de las pocas operaciones exclusivas del
  administrador, junto con la gestión de catálogo y usuarios.
- Descargar la constancia de la venta.

### Pagos

Registrar pagos parciales o totales. El sistema impide pagar más que el saldo
pendiente y marca la venta como `COMPLETADA` cuando el saldo llega a cero. Los
métodos admitidos son efectivo, Yape, transferencia y otro.

### Entregas

- **Asignar** un pedido confirmado a un repartidor. La asignación mueve el
  pedido a `ASIGNADO`.
- Ver el detalle de una entrega con su historial de estados.
- **Actualizar** el estado: salida a ruta, entrega realizada o no realizada. La
  entrega no realizada exige un motivo.

### Mi ruta

No aplica a este rol. Un administrador no tiene ficha de repartidor.

### Clientes

Alta, edición, activación, desactivación y eliminación lógica. El documento
identifica al cliente junto con su tipo, de modo que una persona y una empresa
pueden compartir número sin colisionar.

### Productos

Catálogo con precio de venta, costo unitario, stock y stock mínimo. Solo el
administrador crea, edita, elimina y restaura productos. El producto `BID20` es
retornable: es el que tiene control de envases.

### Inventario

Entradas y salidas de stock con su motivo y su origen. Cada movimiento queda
registrado con el usuario que lo hizo. El sistema rechaza una entrada de
cantidad negativa y, salvo que se active `PERMITIR_STOCK_NEGATIVO`, una venta
mayor al stock disponible.

### Envases

- **Saldos por cliente**: cuántos bidones tiene en su poder cada cliente.
- **Movimientos**: salidas con la entrega, devoluciones y pérdidas. Toda
  devolución reduce el saldo del cliente y repone el stock; una pérdida interna
  descuenta stock sin adeudarlo a nadie.
- **Historial por cliente**: todos los movimientos de un cliente en el tiempo.

El sistema rechaza devolver más bidones de los que el cliente tiene, salvo que
se active `PERMITIR_DEVOLUCION_EXCESIVA`.

### Repartidores

Alta de repartidores con nombre, documento, teléfono y zona. El documento es la
llave que luego enlaza al repartidor con su usuario: **sin ese vínculo el
repartidor no puede ver su ruta**. Al desactivar uno, sus entregas futuras dejan
de poder asignarse.

### Usuarios

Gestión de usuarios y de los tres roles. Al crear un repartidor, indique su
documento para que quede enlazado con su ficha.

### Reportes

Nueve reportes, con rango de fechas y, donde aplica, filtro de estado, método de
pago o resultado de entrega:

| Reporte | Qué muestra |
|---|---|
| Ventas | Total vendido, cobrado y por cobrar, método de pago, evolución diaria, mejores clientes y el detalle. |
| Pedidos | Cantidad, reparto por estado y canal, tiempos por etapa y el detalle. |
| Pagos | Total cobrado, pagos anulados, desglose por método y el detalle. |
| Entregas | Entregas realizadas y no realizadas, tiempo de salida y de entrega, desglose por repartidor. |
| Clientes | Datos completos, ventas del periodo, total comprado y saldo pendiente. |
| Envases | Saldos por cliente, movimientos por tipo y el detalle de movimientos. |
| Inventario | Stock, agotados, bajo mínimo, valor a costo y movimientos. |
| Tiempos de proceso | Duración de cada etapa y cumplimiento de los objetivos de la matriz. |
| Costo de consultas | Las veinte consultas más costosas, con su duración. Solo administrador. |

El botón **Descargar CSV** exporta el detalle del reporte con los mismos filtros
de la pantalla. El consolidado diario y el costo de consultas no se descargan.

### Indicadores

- **Recepción y registro**, **procesamiento y control**, **atención y
  seguimiento** y **complementarios**: los indicadores del postest.
- **Adecuación funcional**: requisitos implementados y casos de prueba
  superados.
- **Eficiencia y desempeño**: tiempos de respuesta y peticiones por minuto,
  calculados de lo que el sistema registró de sí mismo.
- **Fiabilidad**: solicitudes fallidas, incidencias registradas y resueltas.
- **Comparación pretest/postest**: muestra el antes, el después y la variación.
  Los valores del pretest que todavía no se han medido aparecen como «sin
  dato», nunca como cero.
- Los parámetros del pretest se editan desde la misma pantalla.
- **Exportar indicadores** produce el CSV consolidado. Es exclusivo del
  administrador.

### Evidencia

- **Incidencias**: registrar una incidencia del sistema, seguirla y resolverla
  o descartarla. Descartar exige un motivo.
- **Fiabilidad**: tasa de resolución y tiempo medio de recuperación.
- **Bitácora**: las peticiones registradas, solo para el administrador.

### Perfil

Cambio de contraseña y datos de contacto.

---

## Vendedor

Es el rol que opera el día a día: atiende al cliente, cobra y organiza la
entrega.

Puede usar **Tablero**, **Pedidos**, **Ventas**, **Pagos**, **Entregas**,
**Clientes**, **Productos**, **Inventario**, **Envases**, **Reportes**,
**Indicadores** y **Evidencia**.

No accede a **Repartidores**, **Usuarios**, **Mi ruta**, ni a la bitácora.

### Flujo de un pedido

1. **Clientes**: si el cliente no existe, créalo. El documento no puede
   repetirse dentro del mismo tipo.
2. **Pedidos**: crea el pedido con lo que pidió el cliente. Queda `PENDIENTE`.
3. Confirma el pedido. Queda `CONFIRMADO` y ya puede venderse.
4. **Ventas**: genera la venta. El stock se descuenta y queda registrado el
   movimiento.
5. **Pagos**: registra lo que el cliente paga. Al cubrirse el saldo, la venta
   queda `COMPLETADA`.
6. **Entregas**: asigna un repartidor. El pedido pasa a `ASIGNADO` y el
   repartidor ve la entrega en su ruta.

Anular una venta es del administrador. Si el proceso lo requiere, se le solicita.

---

## Repartidor

Su pantalla es **Mi ruta**. El sistema le muestra únicamente las entregas
asignadas a su ficha, y solo puede actualizarlas.

También accede a **Tablero**, **Envases**, **Reportes** y **Evidencia**.

### Recorrido

1. Ingresa y abre **Mi ruta**. Verá las entregas asignadas, ordenadas para
   seguir un recorrido.
2. Al salir, registra la **salida a ruta** de cada entrega. La hora queda
   sellada en ese momento y es la que se usa para medir la demora.
3. En cada entrega:
   - **Entregada**, si el cliente recibió el pedido. El sistema registra
     automáticamente los bidones entregados a nombre del cliente.
   - **No realizada**, si no se pudo entregar. Es obligatorio indicar el motivo.
4. Registra la devolución de bidones en **Envases** cuando el cliente devuelve
   el envase.

El tiempo entre la salida a ruta y la entrega es el `minutosDemora` que alimenta
el indicador de eficiencia por repartidor. Sin marcar la salida, la entrega no
puede cerrarse.

---

## Mensajes frecuentes

| Mensaje | Causa | Qué hacer |
|---|---|---|
| `No se encontró el pedido` | Identificador inexistente. | Verifique el código `PED-...`. |
| `El pedido debe estar confirmado para generar la venta` | Se intentó vender un pedido sin confirmar. | Confirme el pedido primero. |
| `El pedido ya tiene una venta` | Segundo intento de venta. | Consulte la venta existente en **Ventas**. |
| `El pago supera el saldo pendiente` | Monto mayor al saldo. | Registre el monto exacto o menor. |
| `Stock insuficiente` | No hay unidades disponibles. | Registre una entrada en **Inventario**. |
| `Transición de estado no permitida` | Se quiso saltar una etapa. | Siga la secuencia del flujo. |
| `La fecha de recepción no puede ser futura` | Fecha posterior a hoy. | Corrija la fecha del pedido. |
| `El repartidor no tiene usuario asociado` | Ficha sin documento enlazado. | El administrador debe crear el usuario con el documento de la ficha. |
| `El cliente no tiene bidones suficientes` | Devolución mayor al saldo. | Verifique el saldo en **Envases**. |

---

## Buenas prácticas

- **Confirme el pedido antes de vender.** Es lo que separa `PENDIENTE` de
  `CONFIRMADO` y hace medible el tiempo de confirmación.
- **Registre la salida a ruta al salir, no al volver.** La demora se mide desde
  ese instante.
- **Ponga un motivo real en las entregas no realizadas.** Es lo que permite
  distinguir una incidencia de un cliente ausente.
- **Cierre la venta al cobrar el total.** Una venta `PENDIENTE` por meses falsea
  la cartera y los indicadores.
- **Registre las devoluciones el mismo día.** El saldo de envases se descuadra
  con facilidad si se acumulan.
