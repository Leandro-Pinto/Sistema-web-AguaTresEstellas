import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ErrorApi, almacenamiento, alTerminarSesion, http } from '@/services/http'
import { auth } from '@/services/api'
import { ContextoAutenticacion } from '@/context/autenticacion'
import type { ValorAutenticacion } from '@/context/autenticacion'
import type { NombreRol, Perfil } from '@/types/dominio'

export const ProveedorAutenticacion = ({ children }: { children: ReactNode }) => {
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [cargando, setCargando] = useState(true)
  const [aviso, setAviso] = useState<string | null>(null)

  /**
   * La sesión se decide consultando el perfil, no mirando si existe un token.
   *
   * Un token puede haber caducado o haber sido revocado mientras la pestaña
   * estaba cerrada. Confiar en su presencia dejaría entrar a un usuario sin
   * acceso real, y la primera pantalla fallaría con un 401 en lugar de
   * llevarle al inicio de sesión.
   */
  useEffect(() => {
    let vigente = true

    const comprobar = async () => {
      if (!almacenamiento.tokenAcceso) {
        if (vigente) setCargando(false)
        return
      }
      try {
        const datos = await auth.perfil()
        if (vigente) setPerfil(datos)
      } catch (fallo) {
        // Un 401 aquí significa que el token guardado ya no sirve: se limpia
        // para que un próximo intento de renovación no vuelva a usarlo.
        if (vigente && fallo instanceof ErrorApi && fallo.esNoAutorizado) {
          almacenamiento.limpiar()
        } else if (vigente) {
          // Cualquier otro fallo es transitorio (por ejemplo, el límite de
          // peticiones). El token sigue siendo válido, así que no se borra:
          // se avisa y se deja que el usuario reintente, en vez de expulsarlo
          // a esta pantalla sin explicación.
          setAviso(
            'No se pudo verificar su sesión. Vuelva a iniciar sesión; si el problema continúa, intente en unos minutos.',
          )
        }
      } finally {
        if (vigente) setCargando(false)
      }
    }

    void comprobar()
    return () => {
      vigente = false
    }
  }, [])

  // La capa HTTP avisa desde aquí cuando la renovación ya no es posible.
  useEffect(() => {
    alTerminarSesion(() => {
      setPerfil(null)
      setAviso('Su sesión terminó. Vuelva a iniciar sesión.')
    })
  }, [])

  const entrar = useCallback(async (correo: string, contrasena: string, recordar: boolean) => {
    // `recordar` viaja al backend porque allí decide la vigencia del token de
    // acceso, y se usa aquí porque decide en qué almacén queda la sesión: con la
    // casilla marcada va a localStorage; sin ella, a sessionStorage, que el
    // navegador descarta al cerrar la pestaña.
    const sesion = await http.login(correo, contrasena, recordar)
    almacenamiento.guardar(sesion.tokenAcceso, sesion.tokenRefresh, recordar)
    setAviso(null)

    // `POST /auth/login` devuelve un resumen con menos campos que `/perfil`.
    // Se pide el perfil completo para que el resto de la aplicación no tenga
    // que trabajar con dos formas distintas del mismo usuario.
    try {
      setPerfil(await auth.perfil())
    } catch {
      // Si el perfil falla, la sesión sigue siendo válida: se arma desde el
      // resumen para no expulsar a un usuario que sí se autenticó bien.
      setPerfil({
        id: sesion.usuario.id,
        nombres: sesion.usuario.nombreCompleto,
        apellidos: '',
        nombreCompleto: sesion.usuario.nombreCompleto,
        email: sesion.usuario.email,
        telefono: null,
        activo: true,
        ultimoAcceso: null,
        debeCambiarPassword: sesion.usuario.debeCambiarPassword,
        rol: { id: 0, nombre: sesion.usuario.rol, nivel: 0 },
      })
    }
  }, [])

  const salir = useCallback(async () => {
    try {
      await auth.logout()
    } catch {
      // Si el servidor ya no reconoce la sesión, el cierre local debe
      // completarse igual; de lo contrario el usuario quedaría "dentro" de la
      // aplicación sin ningún medio para salir de ella.
    }
    almacenamiento.limpiar()
    setPerfil(null)
  }, [])

  const refrescarPerfil = useCallback(async () => {
    try {
      setPerfil(await auth.perfil())
    } catch {
      setPerfil(null)
    }
  }, [])

  const limpiarAviso = useCallback(() => setAviso(null), [])

  const tieneRol = useCallback(
    (...roles: NombreRol[]) => {
      if (!perfil) return false
      if (roles.length === 0) return true
      return roles.includes(perfil.rol.nombre)
    },
    [perfil],
  )

  const valor = useMemo<ValorAutenticacion>(
    () => ({
      perfil,
      cargando,
      autenticado: perfil !== null,
      aviso,
      entrar,
      salir,
      refrescarPerfil,
      limpiarAviso,
      tieneRol,
    }),
    [perfil, cargando, aviso, entrar, salir, refrescarPerfil, limpiarAviso, tieneRol],
  )

  return <ContextoAutenticacion.Provider value={valor}>{children}</ContextoAutenticacion.Provider>
}
