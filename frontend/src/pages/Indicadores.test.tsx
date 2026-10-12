import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Indicadores from '@/pages/Indicadores'
import { ContextoAutenticacion } from '@/context/autenticacion'
import type { ValorAutenticacion } from '@/context/autenticacion'
import type { NombreRol, RegistroLineaBase } from '@/types/dominio'

/**
 * Pantalla de indicadores y su línea base del pretest.
 *
 * Lo que importa aquí es el contrato, no el cálculo (que lo hace el servidor):
 *
 *   - Sin línea base guardada, la columna del pretest dice «sin dato» y la
 *     pantalla ofrece transcribir la ficha. Decir «0» afirmaría que el proceso
 *     manual tomó cero minutos.
 *   - Guardar manda solo los nueve valores: autor y fecha los pone el servidor,
 *     que es quien los hace auditable.
 *   - Solo el administrador ve el editor.
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

const postest = {
  recepcionYRegistro: {
    tiempoPromedioRegistroMin: 3.4,
    porcentajePedidosRegistradosCorrectamente: 98,
    porcentajePedidosConErrores: 2,
  },
  procesamientoYControl: {
    tiempoPromedioProcesamientoVentaMin: 2.1,
    porcentajeVentasProcesadasCorrectamente: 99,
    porcentajeVentasConErrores: 1,
    porcentajeVentasConPagoRegistrado: 97,
    porcentajeActualizacionCorrectaStock: 100,
  },
  atencionYSeguimiento: {
    tiempoPromedioConfirmacionYAsignacionMin: 1.5,
    tiempoPromedioCicloCompletoMin: 45,
    porcentajePedidosAtendidosCorrectamente: 96,
    porcentajePedidosConTrazabilidadCompleta: 100,
  },
  complementarios: {
    porcentajeClientesConDatosCompletos: 90,
    porcentajeEnvasesConInformacionCompleta: 88,
    tiempoPromedioConsultaEnvasesSegundos: 0.4,
    tiempoPromedioConsolidadoDiarioSegundos: 0.6,
  },
  muestra: { pedidos: 120, ventas: 118, pagos: 110, entregas: 105 },
}

const sistema = {
  adecuacionFuncional: {
    porcentajeRequisitosImplementadosYApruebados: 100,
    requisitosAprobados: 24,
    totalRequisitos: 24,
    porcentajeCasosDePruebaSuperados: 100,
    casosAprobados: 103,
    totalCasosEjecutados: 103,
    porcentajeTransaccionesConResultadoEsperado: 99,
  },
  eficienciaDesempeno: {
    tiempoRespuestaMedianaMs: 90,
    tiempoRespuestaP95Ms: 210,
    rendimientoTransaccionesPorMinuto: 340,
    picoTransaccionesPorMinuto: 512,
    duracionPromedioPorRuta: [],
  },
  fiabilidad: {
    porcentajeSolicitudesFallidas: 0.4,
    solicitudesFallidas: 3,
    porcentajeDisponibilidadObservado: 99.9,
    minutosTotalesDeIndisponibilidad: 12,
    tiempoMedioRecuperacionMin: 18,
    incidenciasResueltas: 4,
    incidenciasRegistradas: 0,
  },
}

/** Fila de comparación: aún sin línea base, así que `antes` viene en null. */
const filaSinDato = {
  antes: null,
  despues: 3.4,
  unidad: 'minutos',
  diferencia: null,
  variacionPorcentual: null,
}

const registro: RegistroLineaBase = {
  tiempoRegistroMin: null,
  tiempoProcesamientoVentaMin: null,
  tiempoConfirmacionAsignacionMin: null,
  porcentajePedidosCorrectos: null,
  porcentajeVentasCorrectas: null,
  porcentajeVentasConErrores: null,
  porcentajePedidosAtendidos: null,
  porcentajePedidosConErrores: null,
  porcentajeTrazabilidadCompleta: null,
  registrada: false,
  creadoPor: null,
  creadoEn: null,
  actualizadoPor: null,
  actualizadoEn: null,
}

/**
 * Simula la API de indicadores.
 *
 * La línea base vive en una variable de este simulador, igual que vive en una
 * tabla en el servidor: el PUT la reemplaza y la lectura posterior devuelve
 * la nueva, que es justamente lo que debe comprobar la prueba de guardado.
 */
const simularApi = () => {
  const peticiones: string[] = []
  const cuerposEnviados: Record<string, unknown> = {}
  let lineaBase: RegistroLineaBase = registro

  const responder = (datos: unknown) =>
    new Response(JSON.stringify({ exito: true, mensaje: 'ok', datos }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  const falso = vi.fn(async (url: string, opciones?: RequestInit) => {
    const metodo = opciones?.method ?? 'GET'
    peticiones.push(`${metodo} ${url}`)

    if (metodo === 'PUT' && url.includes('/indicadores/pretest')) {
      const enviado = JSON.parse(String(opciones?.body)) as RegistroLineaBase
      cuerposEnviados.put = enviado
      lineaBase = {
        ...lineaBase,
        ...enviado,
        registrada: true,
        creadoPor: 'Ana Quispe',
        creadoEn: '2026-10-06T09:30:00.000Z',
        actualizadoPor: 'Ana Quispe',
        actualizadoEn: '2026-10-06T09:30:00.000Z',
      }
      return responder(lineaBase)
    }

    if (url.includes('/indicadores/pretest')) return responder(lineaBase)

    return responder({
      pretest: lineaBase,
      postest,
      sistema,
      comparacion: {
        tiempoPromedioRegistro: filaSinDato,
        porcentajeVentasConErrores: { ...filaSinDato, despues: 1, unidad: '%' },
      },
    })
  })

  globalThis.fetch = falso as unknown as typeof fetch
  return { peticiones, cuerposEnviados }
}

const montar = (rol: NombreRol = 'ADMINISTRADOR') =>
  render(
    <ContextoAutenticacion.Provider value={sesion(rol)}>
      <Indicadores />
    </ContextoAutenticacion.Provider>,
  )

describe('línea base del pretest en la pantalla de indicadores', () => {
  it('sin registro ofrece transcribir la ficha y muestra «sin dato»', async () => {
    simularApi()
    montar()

    expect(await screen.findByText(/Sin línea base registrada/)).toBeInTheDocument()
    expect(screen.getAllByText('sin dato').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /transcribir ficha/i })).toBeInTheDocument()
  })

  it('guarda los nueve valores y muestra la procedencia nueva', async () => {
    const { peticiones, cuerposEnviados } = simularApi()
    montar()

    await userEvent.click(await screen.findByRole('button', { name: /transcribir ficha/i }))
    await userEvent.type(screen.getByLabelText(/^registro \(min\)/i), '8.5')
    await userEvent.click(screen.getByRole('button', { name: /guardar línea base/i }))

    expect(await screen.findByText(/La línea base quedó guardada/)).toBeInTheDocument()

    // Solo se envían los nueve valores: autor y fecha los decide el servidor.
    expect(peticiones.some((p) => p.startsWith('PUT ') && p.includes('/indicadores/pretest'))).toBe(true)
    const enviado = cuerposEnviados.put as Record<string, unknown>
    expect(Object.keys(enviado).sort()).toEqual(
      [
        'porcentajePedidosAtendidos',
        'porcentajePedidosConErrores',
        'porcentajePedidosCorrectos',
        'porcentajeTrazabilidadCompleta',
        'porcentajeVentasConErrores',
        'porcentajeVentasCorrectas',
        'tiempoConfirmacionAsignacionMin',
        'tiempoProcesamientoVentaMin',
        'tiempoRegistroMin',
      ].sort(),
    )
    expect(enviado.tiempoRegistroMin).toBe(8.5)

    // Tras recargar, la tarjeta declara quién y cuándo registró la línea base.
    expect(await screen.findByText(/Línea base transcrita por Ana Quispe/)).toBeInTheDocument()
    expect(screen.queryByText(/Sin línea base registrada/)).not.toBeInTheDocument()
  })

  it('un fallo al guardar no borra lo que ya estaba registrado', async () => {
    globalThis.fetch = vi.fn(async (url: string, opciones?: RequestInit) => {
      if ((opciones?.method ?? 'GET') === 'PUT') {
        return new Response(
          JSON.stringify({ exito: false, mensaje: 'Los datos enviados no son válidos', datos: null }),
          { status: 422, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (url.includes('/indicadores/pretest')) {
        return new Response(
          JSON.stringify({ exito: true, mensaje: 'ok', datos: registro }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      return new Response(
        JSON.stringify({ exito: true, mensaje: 'ok', datos: { pretest: registro, postest, sistema, comparacion: { tiempoPromedioRegistro: filaSinDato } } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }) as unknown as typeof fetch
    montar()

    await userEvent.click(await screen.findByRole('button', { name: /transcribir ficha/i }))
    await userEvent.click(screen.getByRole('button', { name: /guardar línea base/i }))

    expect(await screen.findByText(/No se pudo guardar la línea base/)).toBeInTheDocument()
    // El editor sigue abierto: no se pierde lo tecleado por un rechazo.
    expect(screen.getByRole('button', { name: /guardar línea base/i })).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByText(/Sin línea base registrada/)).toBeInTheDocument(),
    )
  })

  it('el vendedor consulta, pero no encuentra el editor', async () => {
    simularApi()
    montar('VENDEDOR')

    expect(await screen.findByText(/Sin línea base registrada/)).toBeInTheDocument()
    expect(screen.getByText(/Solo el administrador puede modificarla/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /transcribir ficha/i })).not.toBeInTheDocument()
  })
})
