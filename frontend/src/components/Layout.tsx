import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAutenticacion } from '@/context/autenticacion'
import { useRetraso } from '@/hooks'
import { Boton, Confirmacion } from '@/components/ui'
import { clases, tituloRol } from '@/utils/formato'
import type { NombreRol } from '@/types/dominio'

interface Enlace {
  a: string
  texto: string
  icono: React.ReactNode
  roles?: NombreRol[]
  /** Agrupa entradas relacionadas en el menú lateral. */
  grupo: string
}

const I = ({ d }: { d: string }) => (
  <svg
    className="h-[18px] w-[18px] shrink-0"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={d} />
  </svg>
)

const ENLACES: Enlace[] = [
  {
    a: '/tablero',
    texto: 'Tablero',
    grupo: 'Inicio',
    icono: <I d="M3 12l9-8 9 8M5 10v10h14V10M9 20v-6h6v6" />,
  },
  {
    a: '/pedidos',
    texto: 'Pedidos',
    grupo: 'Operación',
    roles: ['ADMINISTRADOR', 'VENDEDOR'],
    icono: <I d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h2m-6 4h6" />,
  },
  {
    a: '/ventas',
    texto: 'Ventas',
    grupo: 'Operación',
    roles: ['ADMINISTRADOR', 'VENDEDOR'],
    icono: <I d="M9 7h6m-6 4h6m-6 4h3M5 3h14a1 1 0 011 1v16a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z" />,
  },
  {
    a: '/pagos',
    texto: 'Pagos',
    grupo: 'Operación',
    roles: ['ADMINISTRADOR', 'VENDEDOR'],
    icono: <I d="M3 10h18M7 15h2m4 0h2m-10 6h18a1 1 0 001-1V5a1 1 0 00-1-1H3a1 1 0 00-1 1v14a1 1 0 001 1z" />,
  },
  {
    // El repartidor no entra aquí: su pantalla es «Mi ruta». El enlace queda
    // restringido a los mismos roles que acepta la ruta, para no ofrecer un
    // acceso que termina en «no tiene permisos».
    a: '/entregas',
    texto: 'Entregas',
    grupo: 'Operación',
    roles: ['ADMINISTRADOR', 'VENDEDOR'],
    icono: <I d="M3 16V7a1 1 0 011-1h10a1 1 0 011 1v9M15 10h3.5l2.5 3v3H15v-6zM7 19a2 2 0 100-4 2 2 0 000 4zm11 0a2 2 0 100-4 2 2 0 000 4z" />,
  },
  {
    a: '/mis-entregas',
    texto: 'Mi ruta',
    grupo: 'Operación',
    roles: ['REPARTIDOR'],
    icono: <I d="M9 20l-5.4-5.4a2 2 0 010-2.8l7.6-7.6a2 2 0 012.8 0l5.4 5.4a2 2 0 010 2.8L11.6 20a2 2 0 01-2.8 0zM7.5 8.5l7 7" />,
  },
  {
    a: '/clientes',
    texto: 'Clientes',
    grupo: 'Catálogo',
    roles: ['ADMINISTRADOR', 'VENDEDOR'],
    icono: <I d="M17 20v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9.5 10a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM22 20v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8" />,
  },
  {
    a: '/productos',
    texto: 'Productos',
    grupo: 'Catálogo',
    roles: ['ADMINISTRADOR', 'VENDEDOR'],
    icono: <I d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />,
  },
  {
    a: '/inventario',
    texto: 'Inventario',
    grupo: 'Catálogo',
    roles: ['ADMINISTRADOR', 'VENDEDOR'],
    icono: <I d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />,
  },
  {
    a: '/bidones',
    texto: 'Envases',
    grupo: 'Catálogo',
    roles: ['ADMINISTRADOR', 'VENDEDOR', 'REPARTIDOR'],
    icono: <I d="M6 3h12v18l-3-2-3 2-3-2-3 2V3zm3 5h6m-6 4h6" />,
  },
  {
    a: '/repartidores',
    texto: 'Repartidores',
    grupo: 'Administración',
    roles: ['ADMINISTRADOR'],
    icono: <I d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zm13 10v-2a4 4 0 00-3-3.9" />,
  },
  {
    a: '/usuarios',
    texto: 'Usuarios',
    grupo: 'Administración',
    roles: ['ADMINISTRADOR'],
    icono: <I d="M12 15a3 3 0 100-6 3 3 0 000 6zm7.4-3a7.4 7.4 0 01-.1 1.2l2 1.6-2 3.4-2.4-1a7.5 7.5 0 01-2 1.2L14.5 21h-4l-.4-2.6a7.5 7.5 0 01-2-1.2l-2.4 1-2-3.4 2-1.6a7.4 7.4 0 010-2.4l-2-1.6 2-3.4 2.4 1a7.5 7.5 0 012-1.2L10.5 3h4l.4 2.6c.7.3 1.4.7 2 1.2l2.4-1 2 3.4-2 1.6c.1.4.1.8.1 1.2z" />,
  },
  {
    // Reportes, indicadores y evidencia son de consulta y los calcula el
    // backend, así que se muestran a quien los necesita. Lo exclusivo del
    // administrador (exportar indicadores, ver la bitácora) se decide dentro de
    // la pantalla, no ocultando el módulo completo.
    a: '/reportes',
    texto: 'Reportes',
    grupo: 'Análisis',
    roles: ['ADMINISTRADOR', 'VENDEDOR', 'REPARTIDOR'],
    icono: <I d="M9 17v-6m4 6V7m4 10v-4M5 21h14a1 1 0 001-1V4a1 1 0 00-1-1H5a1 1 0 00-1 1v16a1 1 0 001 1z" />,
  },
  {
    a: '/indicadores',
    texto: 'Indicadores',
    grupo: 'Análisis',
    roles: ['ADMINISTRADOR', 'VENDEDOR'],
    icono: <I d="M9.5 3a6.5 6.5 0 100 13c1.6 0 3.1-.6 4.2-1.6L19 19.6 20.6 18l-5.2-5.2A6.5 6.5 0 009.5 3zm0 2a4.5 4.5 0 110 9 4.5 4.5 0 010-9z" />,
  },
  {
    a: '/evidencia',
    texto: 'Evidencia',
    grupo: 'Análisis',
    roles: ['ADMINISTRADOR', 'VENDEDOR', 'REPARTIDOR'],
    icono: <I d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.6L19 9.4V19a2 2 0 01-2 2z" />,
  },
]

/**
 * Estructura de la aplicación: barra lateral, cabecera y área de contenido.
 *
 * El menú se filtra por rol en el cliente porque el backend ya rechaza las
 * acciones no autorizadas con un 403. Ocultar lo que no corresponde evita
 * que el usuario descubra los límites pulsando y fallando; la validación
 * real sigue siendo la del servidor.
 */
export const Layout = () => {
  const { perfil, salir } = useAutenticacion()
  const navegar = useNavigate()
  const ubicacion = useLocation()
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [perfilAbierto, setPerfilAbierto] = useState(false)
  const [confirmandoSalida, setConfirmandoSalida] = useState(false)
  const [saliendo, setSaliendo] = useState(false)

  const visibles = useMemo(
    () => ENLACES.filter((enlace) => !enlace.roles || (perfil && enlace.roles.includes(perfil.rol.nombre))),
    [perfil],
  )

  const grupos = useMemo(() => {
    const mapa = new Map<string, Enlace[]>()
    for (const enlace of visibles) {
      const lista = mapa.get(enlace.grupo) ?? []
      lista.push(enlace)
      mapa.set(enlace.grupo, lista)
    }
    return [...mapa.entries()]
  }, [visibles])

  const busqueda = useRetraso(ubicacion.pathname, 120)
  const rutaActual = visibles.find((enlace) => busqueda.startsWith(enlace.a))
  const tituloPagina = rutaActual?.texto ?? 'Agua Tres Estrellas'

  // En móvil el menú se cierra al navegar: dejarlo abierto tapa la pantalla
  // que el usuario acaba de pedir.
  //
  // Se ajusta durante el render y no en un `useEffect`. Un efecto corre
  // después de pintar, así que el menú se vería un fotograma sobre la página
  // nueva; además dispararía un segundo render por cada navegación. Este es el
  // patrón que React documenta para ajustar estado cuando cambia una entrada.
  const [rutaVista, setRutaVista] = useState(ubicacion.pathname)
  if (rutaVista !== ubicacion.pathname) {
    setRutaVista(ubicacion.pathname)
    if (menuAbierto) setMenuAbierto(false)
    if (perfilAbierto) setPerfilAbierto(false)
  }

  useEffect(() => {
    if (!menuAbierto) return
    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setMenuAbierto(false)
    }
    document.addEventListener('keydown', alPulsar)
    return () => document.removeEventListener('keydown', alPulsar)
  }, [menuAbierto])

  const confirmarSalida = async () => {
    setSaliendo(true)
    await salir()
    navegar('/acceso', { replace: true })
  }

  return (
    <div className="min-h-dvh bg-slate-50">
      {/* Barra lateral: fija en escritorio, cajón en móvil. */}
      <aside
        className={clases(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-slate-900 transition-transform duration-200 lg:translate-x-0',
          menuAbierto ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Navegación principal"
      >
        <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-slate-800 px-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-marca-600 text-sm font-semibold text-white">
            A3
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">Agua Tres Estrellas</p>
            <p className="truncate text-xs text-slate-400">Sistema de ventas y reparto</p>
          </div>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {grupos.map(([grupo, enlaces]) => (
            <div key={grupo}>
              <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {grupo}
              </p>
              <ul className="space-y-0.5">
                {enlaces.map((enlace) => (
                  <li key={enlace.a}>
                    <NavLink
                      to={enlace.a}
                      className={({ isActive }) =>
                        clases(
                          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                          isActive
                            ? 'bg-marca-600 font-medium text-white'
                            : 'text-slate-300 hover:bg-slate-800 hover:text-white',
                        )
                      }
                    >
                      {enlace.icono}
                      {enlace.texto}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-slate-800 p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <Inicial nombre={perfil?.nombreCompleto ?? ''} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{perfil?.nombreCompleto}</p>
              <p className="truncate text-xs text-slate-400">
                {perfil ? tituloRol(perfil.rol.nombre) : ''}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {menuAbierto && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/50 lg:hidden"
          onClick={() => setMenuAbierto(false)}
          aria-hidden="true"
        />
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            onClick={() => setMenuAbierto(true)}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-400 lg:hidden"
            aria-label="Abrir menú"
            aria-expanded={menuAbierto}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
            </svg>
          </button>

          <h1 className="flex-1 truncate text-sm font-semibold text-slate-900 sm:text-base">
            {tituloPagina}
          </h1>

          <div className="relative">
            <button
              type="button"
              onClick={() => setPerfilAbierto((abierto) => !abierto)}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-400"
              aria-haspopup="menu"
              aria-expanded={perfilAbierto}
            >
              <Inicial nombre={perfil?.nombreCompleto ?? ''} />
              <span className="hidden text-sm text-slate-700 sm:block">{perfil?.nombreCompleto}</span>
              <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {perfilAbierto && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setPerfilAbierto(false)} aria-hidden="true" />
                <div
                  role="menu"
                  className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-lg bg-white py-1 shadow-lg ring-1 ring-slate-200"
                >
                  <div className="border-b border-slate-100 px-4 py-2.5">
                    <p className="truncate text-sm font-medium text-slate-900">{perfil?.nombreCompleto}</p>
                    <p className="truncate text-xs text-slate-500">{perfil?.email}</p>
                    <p className="mt-1 text-xs font-medium text-marca-700">
                      {perfil ? tituloRol(perfil.rol.nombre) : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => navegar('/perfil')}
                    className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <I d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    Mi perfil
                  </button>
                  {perfil?.debeCambiarPassword && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => navegar('/perfil')}
                      className="flex w-full items-center gap-2.5 bg-amber-50 px-4 py-2 text-left text-sm font-medium text-amber-800 hover:bg-amber-100"
                    >
                      <I d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
                      Cambiar contraseña
                    </button>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => setConfirmandoSalida(true)}
                    className="flex w-full items-center gap-2.5 border-t border-slate-100 px-4 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
                  >
                    <I d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4m7 14l5-5-5-5m5 5H9" />
                    Cerrar sesión
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        {/* Aviso de contraseña provisional: se mantiene visible hasta que el
            usuario la cambie, en lugar de desaparecer en unos segundos. */}
        {perfil?.debeCambiarPassword && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 sm:px-6">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-amber-900">
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <path d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Está usando una contraseña temporal.</span>
              <Boton variante="secundario" tamano="sm" onClick={() => navegar('/perfil')}>
                Cambiar ahora
              </Boton>
            </p>
          </div>
        )}

        <main className="px-4 py-5 sm:px-6 sm:py-6">
          <Outlet />
        </main>
      </div>

      <Confirmacion
        abierto={confirmandoSalida}
        titulo="Cerrar sesión"
        mensaje="¿Desea salir del sistema? Tendrá que iniciar sesión nuevamente para volver a entrar."
        textoConfirmar="Cerrar sesión"
        procesando={saliendo}
        onConfirmar={() => void confirmarSalida()}
        onCancelar={() => setConfirmandoSalida(false)}
      />
    </div>
  )
}

/** Iniciales para el avatar: con un solo nombre alcanza la primera letra. */
const Inicial = ({ nombre }: { nombre: string }) => {
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  const texto = partes.length >= 2 ? `${partes[0][0]}${partes[1][0]}` : (partes[0]?.slice(0, 2) ?? '?')
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-marca-100 text-xs font-semibold uppercase text-marca-800"
      aria-hidden="true"
    >
      {texto}
    </span>
  )
}
