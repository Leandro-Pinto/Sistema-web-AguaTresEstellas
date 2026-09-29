import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ProveedorAutenticacion } from '@/context/ProveedorSesion'
import { useAutenticacion } from '@/context/autenticacion'
import { almacenamiento } from '@/services/http'

/**
 * El contexto de sesión decide si la aplicación muestra la pantalla de
 * acceso o el sistema. Su regla principal es que la sesión se comprueba
 * contra el servidor, no suponiendo que un token guardado sigue siendo
 * válido: un token caducado llevaría al usuario a ver pantallas que fallan
 * con un 401 en lugar de al inicio de acceso.
 */

const perfil = {
  id: 1,
  nombres: 'Leandro',
  apellidos: 'Pinto',
  nombreCompleto: 'Leandro Pinto',
  email: 'leandro@aguarespura.pe',
  telefono: null,
  activo: true,
  ultimoAcceso: null,
  debeCambiarPassword: false,
  rol: { id: 1, nombre: 'ADMINISTRADOR' as const, nivel: 1 },
}

/** Muestra el estado del contexto de forma que la prueba pueda leerlo. */
const Sonda = () => {
  const { perfil, cargando, autenticado, aviso } = useAutenticacion()
  return (
    <div>
      <span data-testid="cargando">{String(cargando)}</span>
      <span data-testid="autenticado">{String(autenticado)}</span>
      <span data-testid="rol">{perfil?.rol.nombre ?? 'ninguno'}</span>
      <span data-testid="aviso">{aviso ?? 'sin aviso'}</span>
    </div>
  )
}

const envoltura = (datos: unknown) =>
  new Response(JSON.stringify({ exito: true, mensaje: 'ok', datos }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })

describe('estado inicial sin token', () => {
  it('termina cargando=false y sin autenticar, sin llamar al servidor', async () => {
    const falso = vi.fn()
    globalThis.fetch = falso as unknown as typeof fetch

    render(
      <ProveedorAutenticacion>
        <Sonda />
      </ProveedorAutenticacion>,
    )

    await waitFor(() => expect(screen.getByTestId('cargando')).toHaveTextContent('false'))
    expect(screen.getByTestId('autenticado')).toHaveTextContent('false')
    // Sin token no hay nada que comprobar: una llamada sería trabajo inútil.
    expect(falso).not.toHaveBeenCalled()
  })
})

describe('restauración de sesión con token válido', () => {
  it('consulta el perfil y autentica', async () => {
    globalThis.fetch = vi.fn(async () => envoltura(perfil)) as unknown as typeof fetch
    almacenamiento.guardar('token-valido', 'refresh', true)

    render(
      <ProveedorAutenticacion>
        <Sonda />
      </ProveedorAutenticacion>,
    )

    await waitFor(() => expect(screen.getByTestId('autenticado')).toHaveTextContent('true'))
    expect(screen.getByTestId('rol')).toHaveTextContent('ADMINISTRADOR')
  })
})

describe('token que el servidor ya no reconoce', () => {
  it('un 401 al pedir el perfil limpia la sesión y deja al usuario fuera', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ exito: false, mensaje: 'Token vencido' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
    ) as unknown as typeof fetch
    almacenamiento.guardar('token-caducado', 'refresh', true)

    render(
      <ProveedorAutenticacion>
        <Sonda />
      </ProveedorAutenticacion>,
    )

    await waitFor(() => expect(screen.getByTestId('autenticado')).toHaveTextContent('false'))
    // El token se borra para que un próximo intento de renovación no lo reuse.
    expect(almacenamiento.tokenAcceso).toBeNull()
  })
})

describe('fallo transitorio al comprobar la sesión', () => {
  it('un error que no es 401 no borra el token y explica la situación', async () => {
    // Si el servidor devuelve 500 por un límite de peticiones, expulsar al
    // usuario sería incorrecto: su sesión sigue siendo válida.
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ exito: false, mensaje: 'Demasiadas peticiones' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        }),
    ) as unknown as typeof fetch
    almacenamiento.guardar('token-valido', 'refresh', true)

    render(
      <ProveedorAutenticacion>
        <Sonda />
      </ProveedorAutenticacion>,
    )

    await waitFor(() => expect(screen.getByTestId('aviso')).not.toHaveTextContent('sin aviso'))
    expect(almacenamiento.tokenAcceso).toBe('token-valido')
  })
})

describe('inicio y cierre de sesión', () => {
  it('entrar guarda los tokens y deja al usuario autenticado', async () => {
    const falso = vi.fn(async (url: string) => {
      if (url.includes('/auth/login')) {
        return envoltura({
          tokenAcceso: 'nuevo',
          tokenRefresh: 'nuevo-refresh',
          usuario: {
            id: 1,
            nombreCompleto: 'Leandro Pinto',
            email: 'leandro@aguarespura.pe',
            rol: 'ADMINISTRADOR',
            debeCambiarPassword: false,
          },
        })
      }
      return envoltura(perfil)
    })
    globalThis.fetch = falso as unknown as typeof fetch

    const Accion = () => {
      const { entrar, autenticado } = useAutenticacion()
      return (
        <button
          onClick={() => void entrar('leandro@aguarespura.pe', 'secreta', true)}
          disabled={autenticado}
        >
          Entrar
        </button>
      )
    }

    render(
      <ProveedorAutenticacion>
        <Accion />
        <Sonda />
      </ProveedorAutenticacion>,
    )

    await waitFor(() => expect(screen.getByTestId('cargando')).toHaveTextContent('false'))
    await userEvent.click(screen.getByRole('button', { name: /entrar/i }))

    await waitFor(() => expect(screen.getByTestId('autenticado')).toHaveTextContent('true'))
    expect(almacenamiento.tokenAcceso).toBe('nuevo')
  })

  it('salir borra la sesión aunque el servidor falle', async () => {
    // Si el cierre local dependiera de la respuesta del servidor, un token
    // ya caducado dejaría al usuario dentro de la aplicación sin poder salir.
    globalThis.fetch = vi.fn(
      async () =>
        new Response('', { status: 500 }),
    ) as unknown as typeof fetch
    almacenamiento.guardar('token', 'refresh', true)

    const Accion = () => {
      const { salir, autenticado } = useAutenticacion()
      return (
        <button onClick={() => void salir()} disabled={autenticado}>
          Salir
        </button>
      )
    }

    render(
      <ProveedorAutenticacion>
        <Accion />
        <Sonda />
      </ProveedorAutenticacion>,
    )

    await waitFor(() => expect(screen.getByTestId('cargando')).toHaveTextContent('false'))
    await userEvent.click(screen.getByRole('button', { name: /salir/i }))

    await waitFor(() => expect(almacenamiento.tokenAcceso).toBeNull())
  })
})
