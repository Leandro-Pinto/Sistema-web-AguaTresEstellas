# Instalación y operación

## 1. Requisitos

| Componente | Versión | Nota |
|---|---|---|
| Node.js | 20 o superior | Se verificó con Node 22.21.1. |
| MariaDB o MySQL | 10.6 o superior | El schema usa `enum`, disponible en ambos motores. |
| npm | 10 o superior | Se distribuye con Node. |

No hace falta instalar MySQL si se usa un contenedor; basta con que haya un
servidor accesible desde `127.0.0.1:3306` con el usuario configurado.

## 2. Puesta en marcha

### 2.1 Base de datos

Crear la base de datos de trabajo, la de pruebas y la de demostración. Son tres
bases separadas a propósito: ejecutar las pruebas nunca debe tocar los datos
reales, y el simulador nunca debe poder escribirlos.

```sql
CREATE DATABASE agua_tres_estrellas CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE agua_tres_estrellas_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE agua_tres_estrellas_demo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER 'agua_app'@'localhost' IDENTIFIED BY 'AguaTresEstrellas2026';
GRANT ALL PRIVILEGES ON agua_tres_estrellas.* TO 'agua_app'@'localhost';
GRANT ALL PRIVILEGES ON agua_tres_estrellas_test.* TO 'agua_app'@'localhost';
GRANT ALL PRIVILEGES ON agua_tres_estrellas_demo.* TO 'agua_app'@'localhost';
FLUSH PRIVILEGES;
```

El nombre de la base tiene que coincidir con el entorno: `demo` exige que
termine en `_demo` y `test` en `_test`. Esa comprobación se hace al arrancar la
aplicación (`backend/src/config/env.ts`) y es lo que impide que el simulador
acabe escribiendo sobre la base real.

### 2.2 Backend

```bash
cd backend
npm install
cp .env.example .env      # ajustar credenciales
npm run prisma:deploy     # aplica las migraciones
npm run seed              # carga los datos iniciales
npm run dev               # servidor en modo desarrollo
```

El backend escucha en `http://localhost:4000`. La comprobación de que arrancó:

```bash
curl http://localhost:4000/salud
```

> La ruta de salud es `/salud`, **sin** el prefijo `/api`. El prefijo se
> aplica al resto de la API. Comprueba la base con un `SELECT 1`: responde
> `200` si todo funciona y **`503`** si el proceso está vivo pero la base de
> datos no responde, con `codigo: "BASE_NO_DISPONIBLE"`. Si `curl` no devuelve
> nada, el proceso no está; si devuelve 503, revise que MariaDB esté corriendo
> y que `DATABASE_URL` apunte a la base correcta.

### 2.3 Frontend

En otra terminal:

```bash
cd frontend
npm install
npm run dev
```

La interfaz queda en `http://localhost:5173` y ya apunta al backend por
defecto. Para cambiar el destino se edita `frontend/.env`:

```
VITE_API_URL=http://localhost:4000/api
```

## 3. Variables de entorno

Todas están documentadas con su valor por defecto en `backend/.env.example`.
El archivo `.env` no se sube al repositorio.

### Entorno

| Variable | Por defecto | Para qué sirve |
|---|---|---|
| `ENTORNO` | — (**obligatoria**) | `prod`, `demo` o `test`. Decide qué base se admite y qué datos leen los indicadores. |

Es la variable que separa lo real de lo inventado:

| Entorno | Para qué sirve | Qué leen los reportes |
|---|---|---|
| `prod` | Operación real de la empresa. | Solo `REAL`. Es el único válido para una medición. |
| `demo` | Demostraciones. | `SIMULADO` por omisión, y `REAL` si se pide. La interfaz muestra una cinta de advertencia. |
| `test` | Pruebas automatizadas. | Solo `REAL`, contra `DATABASE_URL_TEST`. |

Sin `ENTORNO` la aplicación no arranca, a propósito: es mejor no levantarla que
levantarla creyendo que apunta a la base correcta.

### Base de datos

| Variable | Para qué sirve |
|---|---|
| `DATABASE_URL` | Base del entorno declarado. La usan la aplicación y el simulador. |
| `DATABASE_URL_TEST` | Base de pruebas. La usa la suite de Jest. |
| `DATABASE_URL_DEMO` | Base de demostración, documentada en `.env.example` para no tener que construir la URL a mano. |

### Servidor

| Variable | Por defecto | Para qué sirve |
|---|---|---|
| `PORT` | `4000` | Puerto del backend. |
| `API_PREFIX` | `/api` | Prefijo de las rutas de la API. |
| `CORS_ORIGIN` | `http://localhost:5173` | Origen del frontend permitido. |

### Seguridad

| Variable | Por defecto | Para qué sirve |
|---|---|---|
| `JWT_SECRET` | — | Firma de los tokens. **Cambiar en producción.** |
| `JWT_EXPIRES_IN` | `8h` | Vigencia del token de acceso. |
| `JWT_REFRESH_SECRET` | — | Firma del token de refresco. **Cambiar en producción.** |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Vigencia del token de refresco. |
| `BCRYPT_SALT_ROUNDS` | `10` | Costo del hash de contraseñas. |
| `MAX_INTENTOS_LOGIN` | `5` | Intentos fallidos antes del bloqueo temporal. |
| `MINUTOS_BLOCCO_LOGIN` | `15` | Duración del bloqueo. |

### Reglas de negocio

| Variable | Por defecto | Para qué sirve |
|---|---|---|
| `PERMITIR_STOCK_NEGATIVO` | `false` | Permite vender por debajo del stock disponible. |
| `PERMITIR_DEVOLUCION_EXCESIVA` | `false` | Permite devolver más bidones de los que el cliente tiene. |

Ambas están pensadas para políticas especiales de inventario. El administrador
puede activarlas; con `false` el sistema las rechaza, y esa validación es la
que miden varios de los casos de prueba.

## 4. Comandos

### Backend

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo con recarga automática. |
| `npm run build` | Compila `src/` a `dist/`. |
| `npm start` | Ejecuta la versión compilada. |
| `npm run typecheck` | Verifica tipos de `src/`. |
| `npm run typecheck:scripts` | Verifica tipos de `scripts/`, `prisma/` y `tests/`. |
| `npm run seed` | Carga los datos iniciales. Es idempotente. |
| `npm run simular` | Genera el conjunto de demostración. Solo con `ENTORNO="demo"`. Ver [datos-de-demostracion.md](datos-de-demostracion.md). |
| `npm test` | Suite de pruebas. |
| `npm run test:cubrimiento` | Suite con reporte de cobertura. |
| `npm run prisma:studio` | Interfaz visual de la base. |
| `npm run db:reset` | **Borra** la base y reaplica las migraciones. |

`tsconfig.json` compila únicamente `src/`, porque `dist/` debe reflejar solo el
backend. Por eso `scripts/`, `prisma/` y `tests/` se verifican aparte con
`npm run typecheck:scripts`.

### Frontend

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo de Vite. |
| `npm run build` | Verifica tipos y compila para producción. |
| `npm run lint` | Revisa estilo y errores comunes. |
| `npm run preview` | Sirve la compilación de producción. |

## 5. Cuentas de prueba

El seed crea estas cuentas, todas con la contraseña `Agua2026*` y con
`debeCambiarPassword` activo, de modo que el primer ingreso obliga a cambiar la
clave.

| Correo | Rol | Ficha de repartidor |
|---|---|---|
| `admin@aguarespura.pe` | Administrador | — |
| `vendedor@aguarespura.pe` | Vendedor | — |
| `repartidor@aguarespura.pe` | Repartidor | Miguel Chávez Rojas (`70099887`) |
| `repartidor2@aguarespura.pe` | Repartidor | Rosa Paredes Nina (`70111999`) |
| `repartidor3@aguarespura.pe` | Repartidor | Iván Ccorimanya Choque (`70223444`) |

Cada repartidor tiene su propio usuario porque el `documento` del usuario es la
clave que lo enlaza con su ficha. De esa dependencia dependen el ingreso a la
ruta, el filtro de las entregas propias y la trazabilidad de cada movimiento.

Un repartidor sin usuario en su ficha puede recibir entregas asignadas, pero no
puede entregarlas ni verlas en su ruta: el sistema lo rechaza con un mensaje
explícito en lugar de dejar la entrega sin responsible.

## 6. Operación diaria

### Puesta en marcha

1. Base de datos encendida y accesible.
2. `npm run dev` en `backend/`.
3. `npm run dev` en `frontend/`.
4. Abrir `http://localhost:5173`.

### Antes de una demostración

```bash
cd backend
npm test                                  # confirmar que nada se rompió

# Requiere ENTORNO="demo" y una base terminada en _demo.
npm run simular -- --limpiar --dias=30 --pedidosPorDia=45 --semilla=2026
```

La semilla fija hace que dos ejecuciones con los mismos parámetros produzcan el
mismo conjunto, requisito para que una demostración sea repetible. Los datos que
genera son `SIMULADO` y no sirven como resultado de la tesis.

### Antes de una medición real

1. Poner `ENTORNO="prod"` y `DATABASE_URL` apuntando a la base de la operación.
2. Correr `npm test` para confirmar que nada se rompió.
3. **No** correr `npm run simular`: el proceso se detendrá solo.
4. Capturar los reportes sin pasar `origen`, y guardarlos en `evidencias-reales/`.

## 7. Resolución de problemas

### `EADDRINUSE: address already in use :::4000`

Hay otra instancia del backend. En Windows, `tsx watch` deja procesos hijos
adoptados si se cierra la terminal, así que matar solo el proceso que escucha el
puerto no basta:

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like "*sistema-web\backend*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

### `EPERM: operation not permitted, rename ... query_engine-windows.dll.node`

Algún proceso tiene abierto el binario del cliente de Prisma. Ocurre al
ejecutar `npm test` o `npx prisma generate` con el servidor de desarrollo
levantado. Detener el backend, correr el comando y volver a levantarlo.

### `npx prisma generate` no encuentra `DATABASE_URL`

`prisma.config.ts` no carga el `.env` por sí solo. Exportar la variable o
correr los comandos desde un entorno que la tenga:

```bash
DATABASE_URL="mysql://..." npx prisma generate
```

### La suite falla al arrancar

La suite aplica migraciones y ejecuta el seed sobre `DATABASE_URL_TEST` antes
de correr, con `ENTORNO="test"` forzado en `tests/setup-env.ts` y en
`tests/global-setup.ts`. Si la base de pruebas no existe, el mensaje lo dice;
crearla según la sección 2.1.

### `Falta la variable ENTORNO en el archivo .env`

La aplicación no arranca sin `ENTORNO`. Es deliberado: define qué base se admite
y qué datos pueden leer los indicadores. Copiar `ENTORNO=prod` de
`.env.example` y ajustarlo según el uso.

### Un enum rechazado con 422

Los reportes validan los filtros contra los enums de `schema.prisma`. Si la
interfaz ofrece un valor que el backend rechaza, el enum cambió y hay que
actualizar la lista del selector en `frontend/src/pages/Reportes.tsx`.

## 8. Despliegue

1. Compilar ambos: `npm run build` en `backend/` y en `frontend/`.
2. Servir `frontend/dist` con un servidor estático.
3. Levantar el backend con `npm start`, que usa `NODE_ENV=production`.
4. Definir `ENTORNO="prod"` y comprobar que `DATABASE_URL` apunta a la base de la
   operación real.
5. Sustituir `JWT_SECRET` y `JWT_REFRESH_SECRET` por cadenas aleatorias de al
   menos 64 caracteres.
6. Poner `CORS_ORIGIN` con el dominio real del frontend.
7. Restringir el usuario de base de datos: en producción no necesita
   privilegios sobre otras bases.

El backend ya incluye `helmet`, `compression`, `cors` y un limitador de
peticiones en `/api/auth/login`.
