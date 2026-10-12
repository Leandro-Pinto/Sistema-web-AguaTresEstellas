import type {
  Envoltura,
  Paginacion,
  RespuestaLogin,
  RespuestaRefresh,
} from '@/types/dominio'

/**
 * Error de la API, ya normalizado.
 *
 * El backend responde siempre con la envoltura `{ exito, mensaje, datos }`
 * y, cuando falla, con un `codigo` de negocio. Se conserva ese código porque
 * la interfaz lo usa para dar mensajes concretos: "el pago supera el saldo"
 * no es lo mismo que un fallo genérico de red.
 */
export class ErrorApi extends Error {
  readonly codigo: string | null
  readonly estado: number
  readonly detalles: { campo: string; mensaje: string }[]

  constructor(
    mensaje: string,
    estado: number,
    codigo: string | null = null,
    detalles: { campo: string; mensaje: string }[] = [],
  ) {
    super(mensaje)
    this.name = 'ErrorApi'
    this.estado = estado
    this.codigo = codigo
    this.detalles = detalles
  }

  /** El error corresponde a datos que el usuario puede corregir. */
  get esValidacion(): boolean {
    return this.estado === 400 || this.estado === 422
  }

  get esNoAutorizado(): boolean {
    return this.estado === 401
  }

  get esSinPermiso(): boolean {
    return this.estado === 403
  }

  get esConflicto(): boolean {
    return this.estado === 409
  }
}

const CLAVE_TOKEN = 'aguatres.tokenAcceso'
const CLAVE_REFRESH = 'aguatres.tokenRenovacion'

/**
 * La sesión vive en `localStorage` si el usuario pidió "recordarme", y en
 * `sessionStorage` si no. En el segundo caso el navegador la descarta al
 * cerrar la pestaña, que es justo lo que el usuario pidió al no marcar la
 * casilla. Ambas ubicaciones se consultan al leer, de modo que el resto de la
 * aplicación no necesita saber en cuál está.
 */
const leer = (clave: string): string | null => {
  for (const almacen of [localStorage, sessionStorage]) {
    try {
      const valor = almacen.getItem(clave)
      if (valor) return valor
    } catch {
      // Almacenamiento bloqueado (modo privado): se prueba el siguiente.
    }
  }
  return null
}

const escribir = (clave: string, valor: string, persistente: boolean): void => {
  const destino = persistente ? localStorage : sessionStorage
  const otro = persistente ? sessionStorage : localStorage
  try {
    otro.removeItem(clave)
  } catch {
    // Sin permiso de escritura: se continúa con el destino.
  }
  try {
    destino.setItem(clave, valor)
  } catch {
    // Sin persistencia: la sesión durará lo que dure la pestaña en memoria
    // del cliente HTTP, que es el peor caso aceptable.
  }
}

/** Indica en qué almacén está guardada una clave. */
const dondeVive = (clave: string): 'local' | 'sesion' | null => {
  try {
    if (localStorage.getItem(clave)) return 'local'
  } catch {
    // Almacenamiento bloqueado.
  }
  try {
    if (sessionStorage.getItem(clave)) return 'sesion'
  } catch {
    // Almacenamiento bloqueado.
  }
  return null
}

const borrar = (clave: string): void => {
  for (const almacen of [localStorage, sessionStorage]) {
    try {
      almacen.removeItem(clave)
    } catch {
      // Nada que hacer si no se puede limpiar.
    }
  }
}

interface RespuestaCruda {
  exito?: boolean
  mensaje?: string
  datos?: unknown
  meta?: Record<string, unknown>
  codigo?: string
  detalles?: { campo: string; mensaje: string }[]
}

/** Lee un token del almacenamiento, tolerando que no exista. */
export const almacenamiento = {
  get tokenAcceso(): string | null {
    return leer(CLAVE_TOKEN)
  },
  get tokenRenovacion(): string | null {
    return leer(CLAVE_REFRESH)
  },
  guardar(tokenAcceso: string, tokenRefresh: string, persistente = true): void {
    escribir(CLAVE_TOKEN, tokenAcceso, persistente)
    escribir(CLAVE_REFRESH, tokenRefresh, persistente)
  },
  /**
   * Sustituye únicamente el token de acceso, respetando el almacén donde ya
   * vive la sesión. Si se usara `guardar`, una sesión no recordada pasaría a
   * `localStorage` al renovarse, sobreviviendo al cierre del navegador.
   */
  guardarAcceso(tokenAcceso: string): void {
    const persistente = dondeVive(CLAVE_TOKEN) === 'local'
    escribir(CLAVE_TOKEN, tokenAcceso, persistente)
  },
  limpiar(): void {
    borrar(CLAVE_TOKEN)
    borrar(CLAVE_REFRESH)
  },
}

/** Avisa a la aplicación cuando la sesión deja de ser recuperable. */
type EscuchaSesion = () => void
let alExpirarSesion: EscuchaSesion | null = null
export const alTerminarSesion = (escucha: EscuchaSesion): void => {
  alExpirarSesion = escucha
}

const BASE = '/api'

interface OpcionesPeticion {
  metodo?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  cuerpo?: unknown
  params?: Record<string, string | number | boolean | null | undefined>
  /** Peticiones de refresco: nunca deben intentar renovarse a sí mismas. */
  sinRenovar?: boolean
  signal?: AbortSignal
}

const construirUrl = (ruta: string, params?: OpcionesPeticion['params']): string => {
  const url = new URL(`${BASE}${ruta}`, window.location.origin)
  if (params) {
    for (const [clave, valor] of Object.entries(params)) {
      if (valor === undefined || valor === null || valor === '') continue
      url.searchParams.set(clave, String(valor))
    }
  }
  return `${url.pathname}${url.search}`
}



/**
 * renovación en curso, compartida entre peticiones.
 *
 * Si cinco componentes piden datos a la vez y el token expiró, sin esto se
 * dispararían cinco renovaciones simultáneas. Cuatro recibirían un token ya
 * canjeado y cerrarían la sesión de un usuario correctamente autenticado.
 */
let renovacionEnCurso: Promise<string | null> | null = null

const renovarToken = async (): Promise<string | null> => {
  const refresh = almacenamiento.tokenRenovacion
  if (!refresh) return null

  if (!renovacionEnCurso) {
    renovacionEnCurso = (async () => {
      try {
        const respuesta = await fetch(`${BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: refresh }),
        })

        if (!respuesta.ok) {
          almacenamiento.limpiar()
          return null
        }

        const cuerpo = (await respuesta.json()) as Envoltura<RespuestaRefresh>
        // El backend rota solo el token de acceso: el de renovación sigue
        // siendo válido y debe conservarse tal como está almacenado.
        almacenamiento.guardarAcceso(cuerpo.datos.tokenAcceso)
        return cuerpo.datos.tokenAcceso
      } catch {
        return null
      } finally {
        renovacionEnCurso = null
      }
    })()
  }

  return renovacionEnCurso
}

const normalizarDetalles = (detalles: RespuestaCruda['detalles']): { campo: string; mensaje: string }[] =>
  Array.isArray(detalles) ? detalles : []

/**
 * Ejecuta una petición contra la API.
 *
 * Si responde 401 y hay token de renovación, renueva una sola vez y reintenta
 * la petición original. Si tampoco eso funciona, limpia la sesión y avisa a la
 * aplicación para que vuelva al inicio de sesión.
 */
const peticion = async <T>(ruta: string, opciones: OpcionesPeticion = {}): Promise<T> => {
  const { metodo = 'GET', cuerpo, params, sinRenovar = false, signal } = opciones

  const enviar = async (token: string | null): Promise<Response> => {
    const cabeceras: Record<string, string> = {}
    if (cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json'
    if (token) cabeceras.Authorization = `Bearer ${token}`

    return fetch(construirUrl(ruta, params), {
      method: metodo,
      headers: cabeceras,
      ...(cuerpo !== undefined ? { body: JSON.stringify(cuerpo) } : {}),
      ...(signal ? { signal } : {}),
    })
  }

  let respuesta = await enviar(almacenamiento.tokenAcceso)

  if (respuesta.status === 401 && !sinRenovar && almacenamiento.tokenRenovacion) {
    const nuevoToken = await renovarToken()
    if (nuevoToken) {
      respuesta = await enviar(nuevoToken)
    } else {
      alExpirarSesion?.()
    }
  }

  let cuerpoRespuesta: RespuestaCruda | null = null
  const texto = await respuesta.text()
  if (texto) {
    try {
      cuerpoRespuesta = JSON.parse(texto) as RespuestaCruda
    } catch {
      cuerpoRespuesta = null
    }
  }

  if (!respuesta.ok) {
    // Un 5xx sin cuerpo JSON es un fallo del servidor o del proxy; el
    // mensaje técnico se muestra, pero no se filtra como si fuera de negocio.
    const mensaje =
      cuerpoRespuesta?.mensaje ??
      (respuesta.status >= 500
        ? 'El servidor no pudo completar la operación. Intente nuevamente.'
        : 'No se pudo completar la operación.')

    throw new ErrorApi(
      mensaje,
      respuesta.status,
      cuerpoRespuesta?.codigo ?? null,
      normalizarDetalles(cuerpoRespuesta?.detalles),
    )
  }

  return (cuerpoRespuesta?.datos ?? null) as T
}

/** Igual que `peticion`, pero devuelve también la cabecera `meta`. */
const peticionConMeta = async <T>(
  ruta: string,
  opciones: OpcionesPeticion = {},
): Promise<{ datos: T; meta: Record<string, unknown> | null }> => {
  const { metodo = 'GET', cuerpo, params, sinRenovar = false, signal } = opciones

  const enviar = async (token: string | null): Promise<Response> => {
    const cabeceras: Record<string, string> = {}
    if (cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json'
    if (token) cabeceras.Authorization = `Bearer ${token}`
    return fetch(construirUrl(ruta, params), {
      method: metodo,
      headers: cabeceras,
      ...(cuerpo !== undefined ? { body: JSON.stringify(cuerpo) } : {}),
      ...(signal ? { signal } : {}),
    })
  }

  let respuesta = await enviar(almacenamiento.tokenAcceso)

  if (respuesta.status === 401 && !sinRenovar && almacenamiento.tokenRenovacion) {
    const nuevoToken = await renovarToken()
    if (nuevoToken) respuesta = await enviar(nuevoToken)
    else alExpirarSesion?.()
  }

  const cuerpoRespuesta = (await respuesta.json().catch(() => null)) as RespuestaCruda | null

  if (!respuesta.ok) {
    throw new ErrorApi(
      cuerpoRespuesta?.mensaje ?? 'No se pudo completar la operación.',
      respuesta.status,
      cuerpoRespuesta?.codigo ?? null,
      normalizarDetalles(cuerpoRespuesta?.detalles),
    )
  }

  return { datos: (cuerpoRespuesta?.datos ?? null) as T, meta: cuerpoRespuesta?.meta ?? null }
}

/** Extrae la paginación de la cabecera `meta` con un valor por defecto. */
export const leerPaginacion = (meta: Record<string, unknown> | null): Paginacion => {
  const paginacion = (meta?.paginacion ?? {}) as Partial<Paginacion>
  return {
    pagina: paginacion.pagina ?? 1,
    limite: paginacion.limite ?? 20,
    total: paginacion.total ?? 0,
    totalPaginas: paginacion.totalPaginas ?? 0,
  }
}

export const http = {
  get: <T>(ruta: string, opciones?: Omit<OpcionesPeticion, 'metodo' | 'cuerpo'>) =>
    peticion<T>(ruta, { ...opciones, metodo: 'GET' }),
  post: <T>(ruta: string, cuerpo?: unknown, opciones?: Omit<OpcionesPeticion, 'metodo' | 'cuerpo'>) =>
    peticion<T>(ruta, { ...opciones, metodo: 'POST', cuerpo }),
  put: <T>(ruta: string, cuerpo?: unknown, opciones?: Omit<OpcionesPeticion, 'metodo' | 'cuerpo'>) =>
    peticion<T>(ruta, { ...opciones, metodo: 'PUT', cuerpo }),
  patch: <T>(ruta: string, cuerpo?: unknown, opciones?: Omit<OpcionesPeticion, 'metodo' | 'cuerpo'>) =>
    peticion<T>(ruta, { ...opciones, metodo: 'PATCH', cuerpo }),
  delete: <T>(ruta: string, cuerpo?: unknown, opciones?: Omit<OpcionesPeticion, 'metodo' | 'cuerpo'>) =>
    peticion<T>(ruta, { ...opciones, metodo: 'DELETE', cuerpo }),

  /**
   * Descarga un archivo generado por el backend (CSV de reportes, exportación
   * de indicadores).
   *
   * No se resuelve con un `<a href>`: la sesión viaja en la cabecera
   * `Authorization`, no en una cookie, así que un enlace plano llegaría sin
   * token y el servidor respondería 401. Por eso se pide con `fetch` y se
   * entrega al navegador como `Blob` descargable.
   */
  descargar: async (
    ruta: string,
    nombreSugerido: string,
    params?: OpcionesPeticion['params'],
  ): Promise<void> => {
    const cabeceras: Record<string, string> = {}
    if (almacenamiento.tokenAcceso) {
      cabeceras.Authorization = `Bearer ${almacenamiento.tokenAcceso}`
    }

    const respuesta = await fetch(construirUrl(ruta, params), { headers: cabeceras })
    if (!respuesta.ok) {
      throw new ErrorApi('No se pudo generar el archivo para descargar.', respuesta.status, null, [])
    }

    const objeto = URL.createObjectURL(await respuesta.blob())
    const enlace = document.createElement('a')
    enlace.href = objeto
    enlace.download = nombreSugerido
    document.body.appendChild(enlace)
    enlace.click()
    enlace.remove()
    // Sin revocar, cada descarga deja viva una copia del archivo en memoria.
    URL.revokeObjectURL(objeto)
  },

  /** Peticiones paginadas: devuelve la página y su paginación. */
  pagina: async <T>(
    ruta: string,
    params: Record<string, string | number | boolean | null | undefined>,
    opciones?: Omit<OpcionesPeticion, 'metodo' | 'cuerpo' | 'params'>,
  ): Promise<{ datos: T; paginacion: Paginacion }> => {
    const { datos, meta } = await peticionConMeta<T>(ruta, { ...opciones, params })
    return { datos, paginacion: leerPaginacion(meta) }
  },

  /**
   * `recordar` no es solo dónde se guarda el token en este navegador: el
   * backend lo usa para decidir la vigencia del token de acceso (30 días frente
   * a la corta por defecto). Sin enviarlo, marcar la casilla prolongaría la
   * sesión solo si el usuario no cerrara la pestaña, no por más tiempo.
   */
  login: (correo: string, contrasena: string, recordar = false) =>
    peticion<RespuestaLogin>('/auth/login', {
      metodo: 'POST',
      cuerpo: { email: correo, password: contrasena, recordar },
      sinRenovar: true,
    }),
}
