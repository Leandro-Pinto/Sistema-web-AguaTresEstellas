import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { App } from '@/App'
import { ContextoAutenticacion } from '@/context/autenticacion'
import type { ValorAutenticacion } from '@/context/autenticacion'
import type { NombreRol, Perfil } from '@/types/dominio'

/**
 * La guarda de rutas decide qué ve cada usuario. Estas pruebas comprueban
 * que la sesión se verifica antes de mostrar contenido y que un rol sin
 * permiso ve un mensaje claro, no una pantalla en blanco ni el error 403
 * crudo del backend.
 *
 * Se reemplazan `Tablero` y `Usuarios` por marcadores porque son páginas con
 * carga de datos: lo que se prueba aquí es la guarda, no la consulta.
 */
vi.mock('@/pages/Tablero', () => ({ PaginaTablero: () => <div>PANTALLA TABLERO</div> }))
vi.mock('@/pages/Usuarios', () => ({ PaginaUsuarios: () => <div>PANTALLA USUARIOS</div> }))

const perfilDe = (rol: NombreRol): Perfil => ({
  id: 1,
  nombres: 'Leandro',
  apellidos: 'Pinto',
  nombreCompleto: 'Leandro Pinto',
  email: 'leandro@aguarespura.pe',
  telefono: null,
  activo: true,
  ultimoAcceso: null,
  debeCambiarPassword: false,
  rol: { id: 1, nombre: rol, nivel: 1 },
})

const sesionDe = (rol: NombreRol | null): ValorAutenticacion => ({
  perfil: rol ? perfilDe(rol) : null,
  cargando: false,
  autenticado: rol !== null,
  aviso: null,
  entrar: vi.fn(),
  salir: vi.fn(),
  refrescarPerfil: vi.fn(),
  limpiarAviso: vi.fn(),
  tieneRol: (...roles: NombreRol[]) => rol !== null && (roles.length === 0 || roles.includes(rol)),
})

const montar = (sesion: ValorAutenticacion, ruta: string) =>
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <ContextoAutenticacion.Provider value={sesion}>
        <App />
      </ContextoAutenticacion.Provider>
    </MemoryRouter>,
  )

describe('protección de rutas', () => {
  it('sin sesión, cualquier ruta protegida lleva al inicio de acceso', () => {
    montar(sesionDe(null), '/pedidos')
    // El formulario de acceso es la señal de que la ruta protegida se
    // redirigió; si el guard fallara, veríamos la pantalla de pedidos.
    expect(screen.getByRole('heading', { name: /iniciar sesión/i })).toBeInTheDocument()
  })

  it('con sesión, deja entrar a la ruta solicitada', () => {
    montar(sesionDe('ADMINISTRADOR'), '/usuarios')
    expect(screen.getByText('PANTALLA USUARIOS')).toBeInTheDocument()
  })

  it('un repartidor no accede a un módulo exclusivo del administrador', () => {
    montar(sesionDe('REPARTIDOR'), '/usuarios')
    expect(screen.queryByText('PANTALLA USUARIOS')).not.toBeInTheDocument()
    expect(screen.getByText(/no tiene permisos/i)).toBeInTheDocument()
  })

  it('el mensaje de sin permisos nombra el rol del usuario', () => {
    montar(sesionDe('REPARTIDOR'), '/usuarios')
    // Se busca el párrafo concreto: la barra lateral también contiene la
    // palabra "Repartidor" y haría ambiguo un `getByText` por rol.
    expect(screen.getByText(/su rol \(repartidor\)/i)).toBeInTheDocument()
  })

  it('mientras verifica la sesión no muestra la pantalla solicitada', () => {
    // Si el guard decidiera antes de resolver el perfil, un usuario con
    // sesión válida vería un destello de la pantalla equivocada.
    montar({ ...sesionDe('ADMINISTRADOR'), cargando: true }, '/usuarios')
    expect(screen.queryByText('PANTALLA USUARIOS')).not.toBeInTheDocument()
    expect(screen.getByText(/verificando/i)).toBeInTheDocument()
  })

  it('con sesión ya activa, la pantalla de acceso devuelve al usuario a su destino', () => {
    montar(sesionDe('ADMINISTRADOR'), '/acceso')
    // Si se quedara en el formulario, el usuario autenticado vería el login
    // aunque su sesión fuera válida.
    expect(screen.queryByRole('heading', { name: /iniciar sesión/i })).not.toBeInTheDocument()
  })
})

describe('navegación de rutas desconocidas', () => {
  it('una ruta inexistente lleva al tablero, no a una pantalla vacía', () => {
    montar(sesionDe('ADMINISTRADOR'), '/ruta-que-no-existe')
    expect(screen.getByText('PANTALLA TABLERO')).toBeInTheDocument()
  })

  it('la raíz redirige al tablero con sesión iniciada', () => {
    montar(sesionDe('ADMINISTRADOR'), '/')
    expect(screen.getByText('PANTALLA TABLERO')).toBeInTheDocument()
  })

  it('la raíz sin sesión lleva al acceso', () => {
    montar(sesionDe(null), '/')
    expect(screen.getByRole('heading', { name: /iniciar sesión/i })).toBeInTheDocument()
  })
})
