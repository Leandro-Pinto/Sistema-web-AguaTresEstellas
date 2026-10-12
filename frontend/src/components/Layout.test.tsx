import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Layout } from '@/components/Layout'
import { ContextoAutenticacion } from '@/context/autenticacion'
import type { ValorAutenticacion } from '@/context/autenticacion'

/**
 * Cinta de datos de demostración.
 *
 * El riesgo que cubre esta prueba no es de estilo: una captura de una
 * demostración sin rótulo es indistinguible de una captura de la medición real,
 * y en la tesis esa confusión no se puede deshacer después. La cinta existe
 * para que el documento quede marcado en el mismo momento en que se toma la
 * pantalla.
 *
 * Se comprueban los tres desenlaces posibles de la consulta a `/salud`: que el
 * servidor declare demostración, que declare producción y que no responda. El
 * tercero importa igual que el primero: sin respuesta no se afirma nada, ni que
 * son datos reales ni que son de demostración.
 */

const sesion: ValorAutenticacion = {
  perfil: {
    id: 1,
    nombres: 'Ana',
    apellidos: 'Quispe',
    nombreCompleto: 'Ana Quispe',
    email: 'ana@aguarespura.pe',
    telefono: null,
    activo: true,
    ultimoAcceso: null,
    debeCambiarPassword: false,
    rol: { id: 1, nombre: 'ADMINISTRADOR', nivel: 3 },
  },
  cargando: false,
  autenticado: true,
  aviso: null,
  entrar: vi.fn(),
  salir: vi.fn(),
  refrescarPerfil: vi.fn(),
  limpiarAviso: vi.fn(),
  tieneRol: (...roles: string[]) => roles.length === 0 || roles.includes('ADMINISTRADOR'),
}

const saludDe = (entorno: 'prod' | 'demo' | 'test') => {
  const falso = vi.fn(async () =>
    new Response(
      JSON.stringify({
        exito: true,
        mensaje: 'ok',
        datos: {
          estado: 'ok',
          baseDeDatos: `agua_${entorno}`,
          entorno,
          version: '1.0.0',
          horaServidor: '2026-10-05T17:00:00.000Z',
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ),
  )
  globalThis.fetch = falso as unknown as typeof fetch
  return falso
}

const saludCaida = () => {
  globalThis.fetch = vi.fn(async () => {
    throw new Error('sin conexión')
  }) as unknown as typeof fetch
}

const montar = () =>
  render(
    <ContextoAutenticacion.Provider value={sesion}>
      <MemoryRouter initialEntries={['/tablero']}>
        <Routes>
          <Route path="/tablero" element={<Layout />}>
            <Route index element={<div>PANTALLA TABLERO</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </ContextoAutenticacion.Provider>,
  )

describe('cinta de datos de demostración', () => {
  const original = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = original
    vi.restoreAllMocks()
  })

  it('el servidor declara demo: rotula la pantalla', async () => {
    saludDe('demo')
    montar()
    expect(await screen.findByTestId('cinta-demo')).toBeInTheDocument()
    expect(screen.getByText(/datos de demostración/i)).toBeInTheDocument()
  })

  it('el servidor declara prod: no rotula nada', async () => {
    saludDe('prod')
    montar()
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    expect(screen.queryByTestId('cinta-demo')).not.toBeInTheDocument()
  })

  it('si la salud no responde, no se afirma nada sobre los datos', async () => {
    saludCaida()
    montar()
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    expect(screen.queryByTestId('cinta-demo')).not.toBeInTheDocument()
    // La aplicación sigue siendo usable: la cinta no puede impedir el trabajo.
    expect(screen.getByText('PANTALLA TABLERO')).toBeInTheDocument()
  })
})