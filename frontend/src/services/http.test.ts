import { describe, expect, it, vi } from 'vitest'
import { ErrorApi, almacenamiento, alTerminarSesion, http } from '@/services/http'

/**
 * El cliente HTTP concentra dos comportamientos que, si fallan, dejan al
 * usuario fuera del sistema o duplican operaciones: la renovación del token
 * y la normalización de errores. Son los que se prueban aquí.
 */

/** Construye una respuesta de la API con la envoltura del backend. */
const respuesta = (
  datos: unknown,
  { status = 200, exito = true, mensaje = 'ok', codigo, detalles }: {
    status?: number
    exito?: boolean
    mensaje?: string
    codigo?: string
    detalles?: { campo: string; mensaje: string }[]
  } = {},
) =>
  new Response(JSON.stringify({ exito, mensaje, datos, codigo, detalles }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const configurarFetch = (...secuencia: Response[]) => {
  const falso = vi.fn()
  for (const r of secuencia) falso.mockResolvedValueOnce(r)
  globalThis.fetch = falso as unknown as typeof fetch
  return falso
}

describe('gestión del token', () => {
  it('guarda la sesión en localStorage cuando se pide recordar', () => {
    almacenamiento.guardar('acceso-1', 'renovacion-1', true)
    expect(localStorage.getItem('aguatres.tokenAcceso')).toBe('acceso-1')
    expect(sessionStorage.getItem('aguatres.tokenAcceso')).toBeNull()
  })

  it('guarda la sesión en sessionStorage cuando no se pide recordar', () => {
    almacenamiento.guardar('acceso-2', 'renovacion-2', false)
    expect(sessionStorage.getItem('aguatres.tokenAcceso')).toBe('acceso-2')
    expect(localStorage.getItem('aguatres.tokenAcceso')).toBeNull()
  })

  it('lee el token sin importar en qué almacén esté', () => {
    almacenamiento.guardar('en-sesion', 'r', false)
    expect(almacenamiento.tokenAcceso).toBe('en-sesion')
  })

  it('limpiar borra ambos almacenes', () => {
    almacenamiento.guardar('a', 'b', true)
    almacenamiento.limpiar()
    expect(almacenamiento.tokenAcceso).toBeNull()
    expect(almacenamiento.tokenRenovacion).toBeNull()
  })

  it('al renovar el acceso, respeta el almacén de una sesión no recordada', () => {
    // Es la regla que impide que una sesión efímera se vuelva permanente al
    // renovarse: si se guardara siempre en localStorage, sobreviviría al
    // cierre del navegador aunque el usuario no marcó "recordarme".
    almacenamiento.guardar('viejo', 'refresh', false)
    almacenamiento.guardarAcceso('nuevo')
    expect(sessionStorage.getItem('aguatres.tokenAcceso')).toBe('nuevo')
    expect(localStorage.getItem('aguatres.tokenAcceso')).toBeNull()
  })
})

describe('adjuntar la cabecera de autorización', () => {
  it('envía el token como Bearer', async () => {
    const falso = configurarFetch(respuesta({ id: 1 }))
    almacenamiento.guardar('mi-token', 'refresh', true)

    await http.get('/clientes')

    const [url, opciones] = falso.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/clientes')
    expect((opciones.headers as Record<string, string>).Authorization).toBe('Bearer mi-token')
  })

  it('no envía cabecera si no hay sesión', async () => {
    const falso = configurarFetch(respuesta({ publico: true }))
    await http.get('/salud')
    const [, opciones] = falso.mock.calls[0] as [string, RequestInit]
    expect((opciones.headers as Record<string, string>).Authorization).toBeUndefined()
  })

  it('serializa los parámetros y omite los vacíos', async () => {
    const falso = configurarFetch(respuesta([]))
    await http.pagina('/clientes', { pagina: 1, busqueda: '', activo: undefined, tipo: 'EMPRESA' })
    const [url] = falso.mock.calls[0] as [string]
    expect(url).toContain('pagina=1')
    expect(url).toContain('tipo=EMPRESA')
    expect(url).not.toContain('busqueda')
    expect(url).not.toContain('activo')
  })
})

describe('desenvuelve la envoltura de la API', () => {
  it('devuelve directamente el campo datos', async () => {
    configurarFetch(respuesta({ id: 7, nombre: 'Ana' }))
    await expect(http.get('/clientes/7')).resolves.toEqual({ id: 7, nombre: 'Ana' })
  })

  it('devuelve la paginación a partir de meta', async () => {
    const conMeta = new Response(
      JSON.stringify({
        exito: true,
        mensaje: 'ok',
        datos: [{ id: 1 }],
        meta: { paginacion: { pagina: 2, limite: 20, total: 45, totalPaginas: 3 } },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
    configurarFetch(conMeta)
    const { datos, paginacion } = await http.pagina<{ id: number }[]>('/clientes', { pagina: 2 })
    expect(datos).toEqual([{ id: 1 }])
    expect(paginacion).toEqual({ pagina: 2, limite: 20, total: 45, totalPaginas: 3 })
  })

  it('sin meta, la paginación trae valores por defecto en vez de undefined', async () => {
    configurarFetch(respuesta([]))
    const { paginacion } = await http.pagina('/clientes', { pagina: 1 })
    expect(paginacion).toEqual({ pagina: 1, limite: 20, total: 0, totalPaginas: 0 })
  })
})

describe('normalización de errores', () => {
  it('expone el código de negocio y los detalles por campo', async () => {
    configurarFetch(
      respuesta(null, {
        status: 422,
        exito: false,
        mensaje: 'Datos inválidos',
        codigo: 'VALIDACION',
        detalles: [{ campo: 'telefono', mensaje: 'Formato inválido' }],
      }),
    )

    await expect(http.post('/clientes', {})).rejects.toMatchObject({
      message: 'Datos inválidos',
      estado: 422,
      codigo: 'VALIDACION',
      detalles: [{ campo: 'telefono', mensaje: 'Formato inválido' }],
    })
  })

  it('clasifica un 422 como error de validación', async () => {
    configurarFetch(respuesta(null, { status: 422, exito: false, mensaje: 'Inválido' }))
    const fallo = await http.post('/clientes', {}).catch((e: unknown) => e)
    expect(fallo).toBeInstanceOf(ErrorApi)
    expect((fallo as ErrorApi).esValidacion).toBe(true)
  })

  it('clasifica un 401 como no autorizado y un 403 como sin permiso', async () => {
    configurarFetch(respuesta(null, { status: 401, exito: false, mensaje: 'Token vencido' }))
    const sinSesion = (await http.get('/clientes').catch((e: unknown) => e)) as ErrorApi
    expect(sinSesion.esNoAutorizado).toBe(true)

    configurarFetch(respuesta(null, { status: 403, exito: false, mensaje: 'Sin permiso' }))
    const sinPermiso = (await http.get('/clientes').catch((e: unknown) => e)) as ErrorApi
    expect(sinPermiso.esSinPermiso).toBe(true)
  })

  it('un 5xx sin cuerpo no filtra el error técnico al usuario', async () => {
    // El cuerpo vacío simula un fallo del proxy, no de la lógica de negocio.
    configurarFetch(new Response('', { status: 500 }))
    const fallo = (await http.get('/clientes').catch((e: unknown) => e)) as ErrorApi
    expect(fallo.message).toBe('El servidor no pudo completar la operación. Intente nuevamente.')
    expect(fallo.message).not.toContain('500')
  })
})

describe('renovación del token al recibir un 401', () => {
  it('renueva una vez y reintenta la petición original', async () => {
    const falso = configurarFetch(
      respuesta(null, { status: 401, exito: false, mensaje: 'Vencido' }), // original
      respuesta({ tokenAcceso: 'token-nuevo' }), // refresh
      respuesta({ id: 1, nombre: 'Ana' }), // reintento
    )
    almacenamiento.guardar('token-viejo', 'refresh-vigente', true)

    const resultado = await http.get('/clientes')

    expect(resultado).toEqual({ id: 1, nombre: 'Ana' })
    expect(falso).toHaveBeenCalledTimes(3)
    const [, tercero] = falso.mock.calls[2] as [string, RequestInit]
    expect((tercero.headers as Record<string, string>).Authorization).toBe('Bearer token-nuevo')
  })

  it('si la renovación falla, limpia la sesión y avisa a la aplicación', async () => {
    let avisado = false
    alTerminarSesion(() => {
      avisado = true
    })

    configurarFetch(
      respuesta(null, { status: 401, exito: false, mensaje: 'Vencido' }),
      new Response('', { status: 401 }),
    )
    almacenamiento.guardar('token-viejo', 'refresh-vencido', true)

    await http.get('/clientes').catch(() => undefined)

    expect(almacenamiento.tokenAcceso).toBeNull()
    expect(avisado).toBe(true)
  })

  it('sin token de renovación, no intenta renovar', async () => {
    const falso = configurarFetch(respuesta(null, { status: 401, exito: false, mensaje: 'Vencido' }))
    almacenamiento.guardar('token-viejo', 'refresh', true)
    // Se borra solo el refresh para simular una sesión sin renovación.
    localStorage.removeItem('aguatres.tokenRenovacion')

    await http.get('/clientes').catch(() => undefined)

    expect(falso).toHaveBeenCalledTimes(1)
  })

  it('una sola renovación atiende varias peticiones simultáneas', async () => {
    // Sin la promesa compartida, cinco peticiones dispararían cinco
    // renovaciones; cuatro recibirían un token ya canjeado y cerrarían la
    // sesión de un usuario autenticado.
    const intentosPorRuta = new Map<string, number>()
    let cantidadRefresh = 0

    const falso = vi.fn(async (url: string) => {
      if (url.includes('/auth/refresh')) {
        cantidadRefresh += 1
        return respuesta({ tokenAcceso: 'token-nuevo' })
      }
      // La primera llamada de cada recurso falla con 401; el reintento —que ya
      // lleva el token renovado— responde bien.
      const intentos = (intentosPorRuta.get(url) ?? 0) + 1
      intentosPorRuta.set(url, intentos)
      return intentos === 1
        ? respuesta(null, { status: 401, exito: false, mensaje: 'Vencido' })
        : respuesta({ ok: true })
    }) as unknown as typeof fetch
    globalThis.fetch = falso

    almacenamiento.guardar('token-viejo', 'refresh', true)

    await Promise.all([http.get('/clientes'), http.get('/productos'), http.get('/pedidos')])

    expect(cantidadRefresh).toBe(1)
  })
})

describe('login', () => {
  it('envía el correo como email y el recordar al backend', async () => {
    const falso = configurarFetch(
      respuesta({ tokenAcceso: 'a', tokenRefresh: 'b', usuario: { id: 1, rol: 'ADMINISTRADOR' } }),
    )

    await http.login('admin@aguarespura.pe', 'secreta', true)

    const [url, opciones] = falso.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/auth/login')
    expect(JSON.parse(opciones.body as string)).toEqual({
      email: 'admin@aguarespura.pe',
      password: 'secreta',
      recordar: true,
    })
  })

  it('no intenta renovar la sesión al fallar el propio login', async () => {
    // Un login fallido es una credencial mala, no una sesión vencida.
    const falso = configurarFetch(
      respuesta(null, { status: 401, exito: false, mensaje: 'Credenciales inválidas' }),
    )
    almacenamiento.guardar('residual', 'refresh-residual', true)

    await http.login('x@y.pe', 'mala', false).catch(() => undefined)

    expect(falso).toHaveBeenCalledTimes(1)
  })
})
