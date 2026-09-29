import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PaginaPagos } from '@/pages/Pagos'
import { ContextoAutenticacion } from '@/context/autenticacion'
import type { ValorAutenticacion } from '@/context/autenticacion'
import type { NombreRol, Pago, Venta } from '@/types/dominio'

/**
 * Registro y anulación de cobros.
 *
 * El dinero es lo que produce y revierte esta pantalla, así que lo que se
 * comprueba es qué viaja al backend y qué se protege: que el resumen de
 * cobranza respete el rango de fechas pero no los demás filtros, que al
 * registrar solo se ofrezcan ventas con saldo y no se cobre una venta que ya
 * no está a la vista, y que un rechazo del servidor al anular no cierre el
 * diálogo borrando la justificación escrita.
 *
 * Los mensajes que se comparan son los literales de
 * `backend/src/validators/operaciones.validator.ts`: si el backend cambia una
 * regla, esta suite debe avisar en la misma revisión.
 */

const sesion = (rol: NombreRol): ValorAutenticacion => ({
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
    rol: { id: 2, nombre: rol, nivel: 2 },
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

const clienteDeVenta = {
  id: 7,
  nombre: 'María Elena Quispe',
  documento: '70099887',
  telefono: '900101010',
  direccion: 'Jr. Dos de Mayo 33',
}

const ventaDePago = (
  extra: Partial<NonNullable<Pago['venta']>> = {},
): NonNullable<Pago['venta']> => ({
  id: 1,
  numero: 'VEN-0001',
  total: 30,
  totalPagado: 0,
  saldo: 30,
  estado: 'PENDIENTE',
  cliente: clienteDeVenta,
  ...extra,
})

const pagoBase = (extra: Partial<Pago> = {}): Pago => ({
  id: 11,
  ventaId: 1,
  venta: ventaDePago(),
  monto: 30,
  metodo: 'EFECTIVO',
  referencia: null,
  fecha: '2026-09-29T15:00:00.000Z',
  creadoEn: '2026-09-29T15:00:00.000Z',
  recibidoPor: { id: 1, nombreCompleto: 'Ana Quispe' },
  observaciones: null,
  estado: 'REGISTRADO',
  anuladoEn: null,
  motivoAnulacion: null,
  ...extra,
})

/** Venta candidata a cobrar: lo que devuelve `GET /ventas?soloConSaldo=true`. */
const ventaConSaldo = (extra: Partial<Venta> = {}): Venta => ({
  id: 1,
  numero: 'VEN-0001',
  pedidoId: 1,
  pedido: null,
  clienteId: 7,
  cliente: clienteDeVenta,
  usuarioId: 1,
  usuario: { id: 1, nombreCompleto: 'Ana Quispe' },
  fecha: '2026-09-29T14:00:00.000Z',
  subtotal: 30,
  descuento: 0,
  total: 30,
  totalPagado: 0,
  saldo: 30,
  estado: 'PENDIENTE',
  constanciaEmitida: false,
  constanciaCodigo: null,
  constanciaEmitidaEn: null,
  observaciones: null,
  anuladaEn: null,
  motivoAnulacion: null,
  detalles: [],
  pagos: [],
  ...extra,
})

const resumenBase = [
  { metodo: 'EFECTIVO', total: 100, cantidad: 2 },
  { metodo: 'YAPE', total: 40, cantidad: 2 },
  { metodo: 'OTRO', total: 10, cantidad: 1 },
]

interface Opciones {
  pagos?: Pago[]
  resumen?: { metodo: string; total: number; cantidad: number }[]
  ventas?: Venta[]
  crear?: (cuerpo: Record<string, unknown>) => Response
  anular?: (cuerpo: Record<string, unknown>) => Response
}

/**
 * Simula la API del módulo de pagos y registra lo que se le pide. Cada
 * respuesta se construye con la envoltura `{ exito, mensaje, datos }` que espera
 * `services/http`.
 */
const simularApi = ({
  pagos = [],
  resumen = resumenBase,
  ventas = [ventaConSaldo()],
  crear,
  anular,
}: Opciones = {}) => {
  const peticiones: { url: string; metodo: string; cuerpo: unknown }[] = []

  const envolver = (datos: unknown, status = 200) =>
    new Response(JSON.stringify({ exito: true, mensaje: 'ok', datos }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })

  const paginar = (datos: unknown[]) =>
    new Response(
      JSON.stringify({
        exito: true,
        mensaje: 'ok',
        datos,
        meta: { paginacion: { pagina: 1, limite: 20, total: datos.length, totalPaginas: 1 } },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )

  const falso = vi.fn(async (url: string, opciones?: RequestInit) => {
    const metodo = opciones?.method ?? 'GET'
    const cuerpo = opciones?.body ? JSON.parse(opciones.body as string) : undefined
    peticiones.push({ url, metodo, cuerpo })

    // El resumen se comprueba antes que el listado: comparten prefijo de ruta.
    if (url.includes('/api/pagos/resumen-metodo')) return envolver(resumen)
    if (/\/api\/pagos\/\d+\/anular$/.test(url)) {
      if (anular) return anular(cuerpo as Record<string, unknown>)
      return envolver(pagoBase({ estado: 'ANULADO' }))
    }
    if (url.includes('/api/pagos') && metodo === 'POST') {
      if (crear) return crear(cuerpo as Record<string, unknown>)
      return envolver(pagoBase(), 201)
    }
    if (url.includes('/api/pagos')) return paginar(pagos)
    if (url.includes('/api/ventas')) {
      const termino = new URL(url, 'http://prueba').searchParams.get('busqueda') ?? ''
      return paginar(termino ? ventas.filter((v) => v.numero.includes(termino)) : ventas)
    }
    return envolver(null)
  })

  globalThis.fetch = falso as unknown as typeof fetch
  return { peticiones, falso }
}

const montar = (rol: NombreRol = 'ADMINISTRADOR') =>
  render(
    <ContextoAutenticacion.Provider value={sesion(rol)}>
      <PaginaPagos />
    </ContextoAutenticacion.Provider>,
  )

/** Peticiones al listado de pagos (GET), para contar recargas y filtros. */
const listadoPagos = (peticiones: { url: string; metodo: string }[]) =>
  peticiones.filter(
    (peticion) =>
      peticion.metodo === 'GET' &&
      peticion.url.includes('/api/pagos') &&
      !peticion.url.includes('resumen-metodo'),
  )

/** Consultas del resumen de cobranza por método. */
const consultasResumen = (peticiones: { url: string }[]) =>
  peticiones.filter((peticion) => peticion.url.includes('/api/pagos/resumen-metodo'))

/** Construye un 422 de validación con el formato que consume `services/http`. */
const validacion = (mensaje: string, detalles: { campo: string; mensaje: string }[]) =>
  new Response(JSON.stringify({ exito: false, mensaje, codigo: 'VALIDACION', detalles }), {
    status: 422,
    headers: { 'Content-Type': 'application/json' },
  })

type Formulario = ReturnType<typeof within>

/** Abre el alta de pago y devuelve su diálogo. */
const abrirRegistro = async (): Promise<Formulario> => {
  await userEvent.click(await screen.findByRole('button', { name: /^registrar pago$/i }))
  return within(await screen.findByRole('dialog', { name: 'Registrar pago' }))
}

/** Abre la anulación del primer pago y devuelve su diálogo. */
const abrirAnulacion = async (numero = 'VEN-0001'): Promise<Formulario> => {
  const fila = (await screen.findByText(numero)).closest('tr') as HTMLElement
  await userEvent.click(within(fila).getByRole('button', { name: /^anular$/i }))
  return within(await screen.findByRole('dialog', { name: /anular pago/i }))
}

/** Elige una venta del recuadro de candidatas. */
const elegirVenta = async (formulario: Formulario, numero = 'VEN-0001') => {
  await userEvent.click(
    await formulario.findByRole('button', { name: new RegExp(numero) }, { timeout: 2000 }),
  )
}

// --- Resumen de cobranza ---------------------------------------------------

describe('resumen de cobranza', () => {
  it('muestra el total cobrado y una tarjeta por método', async () => {
    simularApi()
    montar()

    expect(await screen.findByText(/150[.,]00/)).toBeInTheDocument()
    expect(screen.getByText('Efectivo', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByText('Yape', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByText('Otro', { selector: 'p' })).toBeInTheDocument()
  })

  it('concuerda el número con el singular y el plural', async () => {
    simularApi()
    montar()

    expect(await screen.findByText('1 cobro')).toBeInTheDocument()
    expect(screen.getAllByText('2 cobros')).toHaveLength(2)
  })

  it('pasa de histórico completo a rango seleccionado y acota la consulta', async () => {
    const { peticiones } = simularApi()
    montar()

    expect(await screen.findByText('Histórico completo')).toBeInTheDocument()
    expect(consultasResumen(peticiones)[0]?.url).not.toContain('fechaInicio')

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-09-01' } })

    expect(await screen.findByText('Rango seleccionado')).toBeInTheDocument()
    expect(consultasResumen(peticiones).at(-1)?.url).toContain('fechaInicio=2026-09-01')
  })

  it('no reconsulta el resumen al cambiar los filtros de la tabla', async () => {
    const { peticiones } = simularApi()
    montar()
    await screen.findByText('No hay pagos que coincidan')

    expect(consultasResumen(peticiones)).toHaveLength(1)

    await userEvent.selectOptions(screen.getByLabelText('Filtrar por método'), 'YAPE')

    await waitFor(() => expect(listadoPagos(peticiones).at(-1)?.url).toContain('metodo=YAPE'))
    // El resumen es un total de cobranza, no una vista del listado filtrado.
    expect(consultasResumen(peticiones)).toHaveLength(1)
  })
})

// --- Listado ---------------------------------------------------------------

describe('listado de pagos', () => {
  it('muestra venta, cliente, referencia, monto y quién recibió', async () => {
    simularApi({ pagos: [pagoBase({ referencia: 'OP-123' })] })
    montar()

    const fila = (await screen.findByText('VEN-0001')).closest('tr') as HTMLElement
    expect(within(fila).getByText('María Elena Quispe')).toBeInTheDocument()
    expect(within(fila).getByText('OP-123')).toBeInTheDocument()
    expect(within(fila).getByText(/30[.,]00/)).toBeInTheDocument()
    expect(within(fila).getByText('Registrado')).toBeInTheDocument()
    expect(within(fila).getByText('Ana Quispe')).toBeInTheDocument()
  })

  it('marca los pagos anulados', async () => {
    simularApi({ pagos: [pagoBase({ estado: 'ANULADO' })] })
    montar()

    const fila = (await screen.findByText('VEN-0001')).closest('tr') as HTMLElement
    expect(within(fila).getByText('Anulado')).toBeInTheDocument()
  })

  it('tolera un pago cuya venta ya no existe', async () => {
    simularApi({ pagos: [pagoBase({ venta: null })] })
    montar()

    expect(await screen.findByText(/30[.,]00/)).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('un listado vacío explica desde dónde se registra un pago', async () => {
    simularApi({ pagos: [] })
    montar()

    expect(await screen.findByText('No hay pagos que coincidan')).toBeInTheDocument()
    expect(screen.getByText(/venta con saldo pendiente/i)).toBeInTheDocument()
  })

  it('manda los filtros de método, estado y fechas', async () => {
    const { peticiones } = simularApi({ pagos: [] })
    montar()
    await screen.findByText('No hay pagos que coincidan')

    await userEvent.selectOptions(screen.getByLabelText('Filtrar por método'), 'YAPE')
    await waitFor(() => expect(listadoPagos(peticiones).at(-1)?.url).toContain('metodo=YAPE'))

    await userEvent.selectOptions(screen.getByLabelText('Filtrar por estado'), 'ANULADO')
    await waitFor(() => expect(listadoPagos(peticiones).at(-1)?.url).toContain('estado=ANULADO'))

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-09-01' } })
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-09-30' } })
    await waitFor(() => {
      const url = listadoPagos(peticiones).at(-1)?.url ?? ''
      expect(url).toContain('fechaInicio=2026-09-01')
      expect(url).toContain('fechaFin=2026-09-30')
    })
  })

  it('la búsqueda llega al backend con retardo', async () => {
    const { peticiones } = simularApi({ pagos: [] })
    montar()
    await screen.findByText('No hay pagos que coincidan')

    await userEvent.type(screen.getByLabelText(/buscar por venta/i), 'VEN-0009')

    await waitFor(() =>
      expect(listadoPagos(peticiones).some((p) => p.url.includes('busqueda=VEN-0009'))).toBe(true),
    )
  })
})

// --- Permisos --------------------------------------------------------------

describe('permisos', () => {
  it('el vendedor cobra pero no puede anular', async () => {
    simularApi({ pagos: [pagoBase()] })
    montar('VENDEDOR')

    expect(await screen.findByRole('button', { name: /^registrar pago$/i })).toBeInTheDocument()
    const fila = (await screen.findByText('VEN-0001')).closest('tr') as HTMLElement
    expect(within(fila).queryByRole('button', { name: /^anular$/i })).toBeNull()
  })

  it('el admin solo puede anular pagos registrados', async () => {
    simularApi({
      pagos: [
        pagoBase(),
        pagoBase({ id: 12, estado: 'ANULADO', venta: ventaDePago({ id: 2, numero: 'VEN-0002' }) }),
      ],
    })
    montar('ADMINISTRADOR')

    const registrada = (await screen.findByText('VEN-0001')).closest('tr') as HTMLElement
    const anulada = screen.getByText('VEN-0002').closest('tr') as HTMLElement
    expect(within(registrada).getByRole('button', { name: /^anular$/i })).toBeInTheDocument()
    expect(within(anulada).queryByRole('button', { name: /^anular$/i })).toBeNull()
  })

  it('el repartidor no registra cobros', async () => {
    simularApi({ pagos: [] })
    montar('REPARTIDOR')

    expect(await screen.findByText('No hay pagos que coincidan')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^registrar pago$/i })).toBeNull()
  })
})

// --- Registro de pago ------------------------------------------------------

describe('registro de pago', () => {
  it('consulta las ventas con saldo solo al abrir el formulario', async () => {
    const { peticiones } = simularApi()
    montar()
    await screen.findByText('No hay pagos que coincidan')

    // El alta está siempre montada: no debe pedir ventas hasta que se abra.
    expect(peticiones.some((p) => p.url.includes('/api/ventas'))).toBe(false)

    await userEvent.click(screen.getByRole('button', { name: /^registrar pago$/i }))
    await waitFor(() => expect(peticiones.some((p) => p.url.includes('/api/ventas'))).toBe(true))

    const consulta = peticiones.find((p) => p.url.includes('/api/ventas'))
    expect(consulta?.url).toContain('soloConSaldo=true')
    expect(consulta?.url).toContain('limite=50')
  })

  it('ofrece las ventas con saldo y exige elegir una', async () => {
    simularApi({ ventas: [ventaConSaldo()] })
    montar()
    const formulario = await abrirRegistro()

    expect(formulario.getByRole('button', { name: /registrar pago/i })).toBeDisabled()
    expect(await formulario.findByRole('button', { name: /VEN-0001/ })).toBeInTheDocument()
    expect(formulario.getByText('María Elena Quispe')).toBeInTheDocument()
  })

  it('precarga el monto con el saldo de la venta elegida', async () => {
    simularApi({ ventas: [ventaConSaldo({ total: 45, saldo: 45 })] })
    montar()
    const formulario = await abrirRegistro()

    await elegirVenta(formulario)

    expect(formulario.getByLabelText(/^monto/i)).toHaveValue(45)
  })

  it('envía el cobro con el monto, el método y la fecha elegidos', async () => {
    const { peticiones } = simularApi({ ventas: [ventaConSaldo()] })
    montar()
    const formulario = await abrirRegistro()
    await elegirVenta(formulario)

    const monto = formulario.getByLabelText(/^monto/i)
    await userEvent.clear(monto)
    await userEvent.type(monto, '20')
    await userEvent.selectOptions(formulario.getByLabelText(/método/i), 'YAPE')
    await userEvent.type(formulario.getByLabelText(/referencia/i), 'OP-777')
    await userEvent.type(formulario.getByLabelText(/observaciones/i), 'Pago parcial')
    fireEvent.change(formulario.getByLabelText(/^fecha$/i), { target: { value: '2026-09-15' } })
    await userEvent.click(formulario.getByRole('button', { name: /registrar pago/i }))

    await waitFor(() =>
      expect(peticiones.some((p) => p.metodo === 'POST' && p.url.includes('/api/pagos'))).toBe(
        true,
      ),
    )
    const alta = peticiones.find((p) => p.metodo === 'POST' && p.url.includes('/api/pagos'))
    expect(alta?.cuerpo).toMatchObject({
      ventaId: 1,
      monto: 20,
      metodo: 'YAPE',
      referencia: 'OP-777',
      observaciones: 'Pago parcial',
    })
    const cuerpo = alta?.cuerpo as { fecha?: string } | undefined
    expect(cuerpo?.fecha).toBe(new Date('2026-09-15').toISOString())
  })

  it('avisa, cierra y recarga al registrar el cobro', async () => {
    const { peticiones } = simularApi({ ventas: [ventaConSaldo()] })
    montar()
    const formulario = await abrirRegistro()
    await elegirVenta(formulario)
    await userEvent.click(formulario.getByRole('button', { name: /registrar pago/i }))

    expect(await screen.findByText(/pago de .* registrado/i)).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Registrar pago' })).toBeNull(),
    )
    await waitFor(() => {
      expect(listadoPagos(peticiones).length).toBeGreaterThan(1)
      expect(consultasResumen(peticiones).length).toBeGreaterThan(1)
    })
  })

  it('señala el campo cuando el servidor rechaza el monto', async () => {
    simularApi({
      ventas: [ventaConSaldo()],
      crear: () =>
        validacion('Datos inválidos', [
          { campo: 'monto', mensaje: 'El monto del pago debe ser mayor que cero' },
        ]),
    })
    montar()
    const formulario = await abrirRegistro()
    await elegirVenta(formulario)
    await userEvent.click(formulario.getByRole('button', { name: /registrar pago/i }))

    expect(
      await formulario.findByText(/monto del pago debe ser mayor que cero/i),
    ).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Registrar pago' })).toBeInTheDocument()
  })

  it('muestra un error general cuando el servidor falla sin detalles', async () => {
    simularApi({
      ventas: [ventaConSaldo()],
      crear: () =>
        new Response(JSON.stringify({ exito: false, mensaje: 'No se pudo registrar el pago.' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
    })
    montar()
    const formulario = await abrirRegistro()
    await elegirVenta(formulario)
    await userEvent.click(formulario.getByRole('button', { name: /registrar pago/i }))

    expect(await formulario.findByText('No se pudo registrar el pago.')).toBeInTheDocument()
  })

  it('cancelar descarta la venta elegida', async () => {
    simularApi({ ventas: [ventaConSaldo()] })
    montar()
    const formulario = await abrirRegistro()
    await elegirVenta(formulario)
    await userEvent.click(formulario.getByRole('button', { name: /^cancelar$/i }))

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Registrar pago' })).toBeNull(),
    )
    const reabierto = await abrirRegistro()
    expect(reabierto.getByRole('button', { name: /registrar pago/i })).toBeDisabled()
  })

  it('no permite cobrar una venta que dejó de estar a la vista', async () => {
    simularApi({ ventas: [ventaConSaldo()] })
    montar()
    const formulario = await abrirRegistro()
    await elegirVenta(formulario)
    expect(formulario.getByRole('button', { name: /registrar pago/i })).toBeEnabled()

    // Al buscar otro término, la venta elegida desaparece de la lista: cobrarla
    // apuntaría a una venta que el usuario ya no ve.
    await userEvent.type(formulario.getByLabelText(/buscar venta con saldo/i), 'ZZZ')

    await waitFor(() =>
      expect(formulario.queryByRole('button', { name: /VEN-0001/ })).toBeNull(),
    )
    expect(formulario.getByRole('button', { name: /registrar pago/i })).toBeDisabled()
  })
})

// --- Anulación de pago -----------------------------------------------------

describe('anulación de pago', () => {
  it('muestra la venta y el saldo antes de anular', async () => {
    simularApi({ pagos: [pagoBase()] })
    montar()
    const dialogo = await abrirAnulacion()

    expect(dialogo.getByText('VEN-0001')).toBeInTheDocument()
    expect(dialogo.getByText(/María Elena Quispe/)).toBeInTheDocument()
    expect(dialogo.getByText(/saldo actual/i)).toHaveTextContent(/30[.,]00/)
  })

  it('no deja anular sin motivo', async () => {
    simularApi({ pagos: [pagoBase()] })
    montar()
    const dialogo = await abrirAnulacion()

    const boton = dialogo.getByRole('button', { name: /^anular pago$/i })
    expect(boton).toBeDisabled()

    await userEvent.type(dialogo.getByLabelText(/motivo/i), 'Cobro duplicado')
    expect(boton).toBeEnabled()
  })

  it('manda el motivo y recarga al anular', async () => {
    const { peticiones } = simularApi({ pagos: [pagoBase()] })
    montar()
    const dialogo = await abrirAnulacion()
    await userEvent.type(dialogo.getByLabelText(/motivo/i), 'Cobro duplicado')
    await userEvent.click(dialogo.getByRole('button', { name: /^anular pago$/i }))

    expect(await screen.findByText(/anulado correctamente/i)).toBeInTheDocument()
    const anulacion = peticiones.find((p) => p.metodo === 'POST' && p.url.includes('/anular'))
    expect(anulacion?.url).toContain('/api/pagos/11/anular')
    expect(anulacion?.cuerpo).toEqual({ motivo: 'Cobro duplicado' })
    await waitFor(() => expect(consultasResumen(peticiones).length).toBeGreaterThan(1))
  })

  it('mantiene el diálogo abierto si el servidor rechaza la anulación', async () => {
    simularApi({
      pagos: [pagoBase()],
      anular: () =>
        new Response(
          JSON.stringify({ exito: false, mensaje: 'El pago ya está anulado.', codigo: 'ANULADO' }),
          { status: 409, headers: { 'Content-Type': 'application/json' } },
        ),
    })
    montar()
    const dialogo = await abrirAnulacion()
    await userEvent.type(dialogo.getByLabelText(/motivo/i), 'Cobro duplicado')
    await userEvent.click(dialogo.getByRole('button', { name: /^anular pago$/i }))

    expect(await screen.findByText('El pago ya está anulado.')).toBeInTheDocument()
    // El diálogo sigue abierto y conserva lo escrito: el rechazo no debe borrar
    // la justificación que el usuario redactó.
    expect(screen.getByRole('dialog', { name: /anular pago/i })).toBeInTheDocument()
    expect(dialogo.getByLabelText(/motivo/i)).toHaveValue('Cobro duplicado')
  })

  it('volver cierra sin anular', async () => {
    const { peticiones } = simularApi({ pagos: [pagoBase()] })
    montar()
    const dialogo = await abrirAnulacion()
    await userEvent.type(dialogo.getByLabelText(/motivo/i), 'Algo')
    await userEvent.click(dialogo.getByRole('button', { name: /^volver$/i }))

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /anular pago/i })).toBeNull(),
    )
    expect(peticiones.some((p) => p.url.includes('/anular'))).toBe(false)
  })
})
