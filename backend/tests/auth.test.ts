/**
 * Pruebas de autenticación y autorización.
 *
 * Verifica el acceso de cada rol y, sobre todo, que la seguridad se aplica en
 * el backend: el frontend solo oculta botones, así que un 403 aquí es la
 * garantía real de que un vendedor no puede, por ejemplo, anular una venta.
 */
import request from 'supertest';
import {
  app,
  CREDENCIALES,
  credenciales,
  PASSWORD,
  cabecera,
  cerrarPrisma,
  desbloquearCuentas,
  iniciarSesion,
  limpiarOperativo,
} from './helpers';

afterAll(cerrarPrisma);
afterEach(desbloquearCuentas);

describe('POST /api/auth/login', () => {
  it('inicia sesión con credenciales válidas y devuelve ambos tokens', async () => {
    const respuesta = await request(app)
      .post('/api/auth/login')
      .send(CREDENCIALES.vendedor)
      .expect(200);

    expect(respuesta.body.exito).toBe(true);
    expect(respuesta.body.datos.tokenAcceso).toEqual(expect.any(String));
    expect(respuesta.body.datos.tokenRefresh).toEqual(expect.any(String));
    expect(respuesta.body.datos.usuario.rol).toBe('VENDEDOR');
    // El seed marca la cuenta para forzar el cambio de contraseña en el primer
    // ingreso: el frontend debe enterarse para redirigir al cambio.
    expect(respuesta.body.datos.usuario.debeCambiarPassword).toBe(true);
  });

  it('registra el último acceso del usuario', async () => {
    await request(app).post('/api/auth/login').send(credenciales('vendedor')).expect(200);

    const { prisma } = await import('../src/config/prisma');
    const usuario = await prisma.usuario.findUniqueOrThrow({
      where: { email: CREDENCIALES.vendedor.email },
      select: { ultimoAcceso: true },
    });
    expect(usuario.ultimoAcceso).not.toBeNull();
  });

  it('rechaza una contraseña incorrecta sin revelar si el correo existe', async () => {
    const respuesta = await request(app)
      .post('/api/auth/login')
      .send({ email: CREDENCIALES.vendedor.email, password: 'incorrecta' })
      .expect(401);

    const correoInexistente = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nadie@aguarespura.pe', password: 'incorrecta' })
      .expect(401);

    // Mismo mensaje en ambos casos: no se permite enumerar usuarios.
    expect(respuesta.body.mensaje).toBe(correoInexistente.body.mensaje);
    expect(respuesta.body.codigo).toBe('NO_AUTENTICADO');
  });

  it('bloquea la cuenta tras superar los intentos permitidos', async () => {
    const intentos = 5;

    // Los primeros intentos responden 401; el que alcanza el máximo ya
    // devuelve 423 porque el bloqueo se aplica en esa misma petición.
    for (let intento = 1; intento < intentos; intento += 1) {
      await request(app)
        .post('/api/auth/login')
        .send({ email: CREDENCIALES.repartidor.email, password: 'incorrecta' })
        .expect(401);
    }

    const bloqueo = await request(app)
      .post('/api/auth/login')
      .send({ email: CREDENCIALES.repartidor.email, password: 'incorrecta' })
      .expect(423);
    expect(bloqueo.body.codigo).toBe('CUENTA_BLOQUEADA');

    // Aunque la contraseña sea correcta, la cuenta sigue bloqueada.
    const reintento = await request(app)
      .post('/api/auth/login')
      .send(credenciales('repartidor'))
      .expect(423);
    expect(reintento.body.codigo).toBe('CUENTA_BLOQUEADA');
  });

  it('valida el formato del correo antes de tocar la base de datos', async () => {
    const respuesta = await request(app)
      .post('/api/auth/login')
      .send({ email: 'no-es-un-correo', password: PASSWORD })
      .expect(422);
    expect(respuesta.body.codigo).toBe('VALIDACION');
  });
});

describe('GET /api/auth/perfil', () => {
  it('devuelve el perfil con su rol', async () => {
    const token = await iniciarSesion('vendedor');
    const respuesta = await request(app)
      .get('/api/auth/perfil')
      .set(cabecera(token))
      .expect(200);

    expect(respuesta.body.datos.email).toBe(CREDENCIALES.vendedor.email);
    expect(respuesta.body.datos.rol.nombre).toBe('VENDEDOR');
  });

  it('rechaza la petición sin token', async () => {
    const respuesta = await request(app).get('/api/auth/perfil').expect(401);
    expect(respuesta.body.codigo).toBe('NO_AUTENTICADO');
  });

  it('rechaza un token con firma inválida', async () => {
    await request(app)
      .get('/api/auth/perfil')
      .set(cabecera('token.inventado.abc'))
      .expect(401);
  });
});

describe('POST /api/auth/refresh', () => {
  it('emite un token de acceso nuevo a partir del de renovación', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send(credenciales('admin'))
      .expect(200);

    const respuesta = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: login.body.datos.tokenRefresh })
      .expect(200);

    expect(respuesta.body.datos.tokenAcceso).toEqual(expect.any(String));
  });

  it('rechaza un token de acceso usado como token de renovación', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send(credenciales('admin'))
      .expect(200);

    await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: login.body.datos.tokenAcceso })
      .expect(401);
  });
});

describe('Autorización por rol', () => {
  it('impide al vendedor anular una venta (exclusivo del administrador)', async () => {
    const token = await iniciarSesion('vendedor');
    const respuesta = await request(app)
      .post('/api/ventas/1/anular')
      .set(cabecera(token))
      .send({ motivo: 'Prueba de permisos' })
      .expect(403);
    expect(respuesta.body.codigo).toBe('SIN_PERMISOS');
  });

  it('impide al repartidor crear usuarios', async () => {
    const token = await iniciarSesion('repartidor');
    await request(app)
      .post('/api/usuarios')
      .set(cabecera(token))
      .send({ nombres: 'Intruso', apellidos: 'Malicioso', email: 'x@y.pe', password: 'Aa123456' })
      .expect(403);
  });

  it('impide al vendedor registrar movimientos de inventario', async () => {
    const token = await iniciarSesion('vendedor');
    await request(app)
      .post('/api/productos/inventario/movimientos')
      .set(cabecera(token))
      .send({ productoId: 1, tipo: 'ENTRADA', cantidad: 5, origen: 'PRUEBA' })
      .expect(403);
  });

  it('permite al administrador usar los módulos restringidos', async () => {
    const token = await iniciarSesion('admin');
    await request(app).get('/api/usuarios').set(cabecera(token)).expect(200);
    await request(app).get('/api/usuarios/roles').set(cabecera(token)).expect(200);
  });

  it('permite al repartidor consultar su propia ruta', async () => {
    const token = await iniciarSesion('repartidor');
    const respuesta = await request(app)
      .get('/api/entregas/mis-entregas')
      .set(cabecera(token))
      .expect(200);
    expect(Array.isArray(respuesta.body.datos)).toBe(true);
  });

  it('impide a un vendedor consultar la ruta del repartidor', async () => {
    const token = await iniciarSesion('vendedor');
    await request(app)
      .get('/api/entregas/mis-entregas')
      .set(cabecera(token))
      .expect(403);
  });
});

describe('Rutas inexistentes', () => {
  it('responde 404 con un mensaje claro', async () => {
    const token = await iniciarSesion('admin');
    const respuesta = await request(app)
      .get('/api/modulo-inexistente')
      .set(cabecera(token))
      .expect(404);
    expect(respuesta.body.codigo).toBe('RUTA_NO_ENCONTRADA');
  });
});

describe('Aislamiento de los datos operativos', () => {
  it('la limpieza no borra el catálogo sembrado', async () => {
    await limpiarOperativo();
    const { prisma } = await import('../src/config/prisma');
    expect(await prisma.producto.count()).toBeGreaterThan(0);
    expect(await prisma.cliente.count()).toBeGreaterThan(0);
  });
});

