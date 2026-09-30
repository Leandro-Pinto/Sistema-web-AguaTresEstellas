import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Reportes from '@/pages/Reportes'
import { ContextoAutenticacion } from '@/context/autenticacion'
import type { ValorAutenticacion } from '@/context/autenticacion'
import type { NombreRol } from '@/types/dominio'

/**
 * Pantalla de reportes.
 *
 * Se prueba con la API simulada: lo que importa aquí es que la interfaz pida
 * el reporte con el rango elegido y que cada botón de descarga lleve el
 * `formato` correcto al backend (csv o pdf), porque el archivo lo arma el
 * servidor y la vista solo decide cuál pedir.
 */

const sesion = (rol: NombreRol = 'ADMINISTRADOR'): ValorAutenticacion => ({
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
    rol: { id: 1, nombre: rol, nivel: 3 },
  },
  cargando: false,
  autenticado: true,
  aviso: null,
  entrar: vi.fn(),
  salir: vi.fn(),
  refrescarPerfil: vi.fn(),
  limpiarAviso: vi.fn(),
  tieneRol: (...roles: NombreRol[]) => roles.length === 0 || roles.includes(rol),
})

const reporteVentas = {
  periodo: { fechaInicio: '2026-09-01T00:00:00Z', fechaFin: '2026-09-30T23:59:59Z' },
  resumen: {
    cantidadVentas: 2,
    totalVendido: 120,
    totalCobrado: 100,
    porCobrar: 20,
    descuentos: 5,
    ticketPromedio: 60,
  },
  porMetodoPago: [{ metodo: 'EFECTIVO', total: 100, cantidad: 1 }],
  porDia: [{ fecha: '2026-09-15T00:00:00Z', total: 120, cantidad: 2 }],
  topClientes: [{ nombre: 'María Elena Quispe', total: 120, ventas: 2 }],
  ventas: [
    {
      id: 1,
      numero: 'VEN-001',
      fecha: '2026-09-15T10:00:00Z',
      total: 120,
      saldo: 20,
      estado: 'PENDIENTE',
      cliente: { nombre: 'María Elena Quispe' },
      pedido: { codigo: 'PED-001' },
    },
  ],
}

const consolidadoDiario = {
  fecha: '2026-09-30T00:00:00Z',
  resumen: { ventas: 1, totalVendido: 15 },
}

/** Simula la API: registra las rutas pedidas y responde con el reporte dado. */
const simularApi = ({ datos = reporteVentas }: { datos?: unknown } = {}) => {
  const peticiones: string[] = []

  const falso = vi.fn(async (url: string, opciones?: RequestInit) => {
    // `http.descargar` pide el archivo con el mismo `fetch`; el URL lleva el
    // `formato` que distingue qué se quiere bajar.
    const peticion = `${opciones?.method ?? 'GET'} ${url}`
    peticiones.push(peticion)

    const cuerpo = url.includes('/reportes/diario') ? consolidadoDiario : datos
    return new Response(JSON.stringify({ exito: true, mensaje: 'ok', datos: cuerpo }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })

  globalThis.fetch = falso as unknown as typeof fetch
  return { peticiones, falso }
}

const montar = (rol: NombreRol = 'ADMINISTRADOR') =>
  render(
    <ContextoAutenticacion.Provider value={sesion(rol)}>
      <Reportes />
    </ContextoAutenticacion.Provider>,
  )

/**
 * `URL.createObjectURL` no existe en jsdom: la descarga lo usa para entregar
 * el Blob al navegador. Se simula con un vi.fn y se revierte el uso del
 * objeto creado, como haría la propia implementación.
 */
const simularDescarga = () => {
  const crear = vi.fn(() => 'blob:reporte')
  const revocar = vi.fn()
  Object.defineProperty(URL, 'createObjectURL', { value: crear, configurable: true })
  Object.defineProperty(URL, 'revokeObjectURL', { value: revocar, configurable: true })
  return { crear, revocar }
}

describe('pantalla de reportes', () => {
  it('muestra el reporte de ventas con su detalle', async () => {
    simularApi()
    montar()

    // Aparece en los mejores clientes y en el detalle de la venta.
    expect((await screen.findAllByText('María Elena Quispe')).length).toBeGreaterThan(0)
    expect(screen.getByText(/Ven-001/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /descargar csv/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /descargar pdf/i })).toBeInTheDocument()
  })

  it('descargar PDF lleva el formato correcto y el rango elegido', async () => {
    simularDescarga()
    const { peticiones } = simularApi()
    montar()

    await userEvent.click(await screen.findByRole('button', { name: /descargar pdf/i }))

    await waitFor(() => {
      expect(
        peticiones.some((p) => p.includes('/reportes/ventas') && p.includes('formato=pdf')),
      ).toBe(true)
    })
    // La descarga no pierde el periodo que el usuario está mirando.
    expect(
      peticiones.some((p) => p.includes('fechaInicio=') && p.includes('fechaFin=')),
    ).toBe(true)
    expect(await screen.findByText(/se descargó en pdf/i)).toBeInTheDocument()
  })

  it('descargar CSV pide el CSV, no el PDF', async () => {
    simularDescarga()
    const { peticiones } = simularApi()
    montar()

    await userEvent.click(await screen.findByRole('button', { name: /descargar csv/i }))

    await waitFor(() => {
      expect(
        peticiones.some((p) => p.includes('/reportes/ventas') && p.includes('formato=csv')),
      ).toBe(true)
    })
    expect(
      peticiones.some((p) => p.includes('formato=pdf')),
    ).toBe(false)
    expect(await screen.findByText(/se descargó en csv/i)).toBeInTheDocument()
  })

  it('un reporte sin exportación no ofrece botones de descarga', async () => {
    simularApi()
    montar()

    // El consolidado diario responde solo JSON en el backend; ofrecer la
    // descarga produciría un archivo que no es ni CSV ni PDF.
    await userEvent.selectOptions(await screen.findByLabelText(/^reporte/i), 'diario')

    await waitFor(() => expect(screen.getByText(/consolidado diario/i)).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /descargar csv/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /descargar pdf/i })).not.toBeInTheDocument()
  })

  it('un fallo de descarga se muestra como aviso', async () => {
    simularDescarga()
    // La capa `http.descargar` rechaza cualquier respuesta que no sea ok.
    globalThis.fetch = vi.fn(async () =>
      new Response('error', { status: 500, headers: { 'Content-Type': 'text/plain' } }),
    ) as unknown as typeof fetch
    montar()

    const boton = await screen.findByRole('button', { name: /descargar pdf/i })
    await userEvent.click(boton)

    expect(await screen.findByText(/no se pudo descargar el reporte/i)).toBeInTheDocument()
  })

  it('el repartidor no ve los reportes exclusivos del administrador', async () => {
    simularApi()
    montar('REPARTIDOR')

    const selector = await screen.findByLabelText(/^reporte/i)
    const opciones = within(selector)
    expect(opciones.queryByText('Costo de consultas')).not.toBeInTheDocument()
  })
})