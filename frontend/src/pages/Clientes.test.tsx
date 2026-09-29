import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PaginaClientes } from '@/pages/Clientes'
import { ContextoAutenticacion } from '@/context/autenticacion'
import type { ValorAutenticacion } from '@/context/autenticacion'
import type { NombreRol } from '@/types/dominio'

/**
 * Flujo de alta de cliente, el formulario que abre el proceso de ventas.
 *
 * Se prueba con la API simulada, no contra el servidor: la regla de negocio
 * que importa aquí es que la interfaz envíe los datos correctos y muestre el
 * error del backend en el campo que corresponde.
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

const cliente = {
  id: 1,
  tipo: 'PERSONA' as const,
  documento: '70099887',
  nombres: 'María Elena Quispe',
  razonSocial: null,
  nombre: 'María Elena Quispe',
  telefono: '900101010',
  telefonoAlt: null,
  email: null,
  direccion: 'Jr. Dos de Mayo 33',
  referencia: null,
  distrito: 'IBERIA',
  limiteCredito: 0,
  notas: null,
  activo: true,
  totalPedidos: 4,
  fechaRegistro: '2026-09-01T10:00:00Z',
}

/**
 * Simula la API. `crear` permite observar el cuerpo enviado y devolver un
 * error concreto; el resto de rutas responden con listas vacías.
 */
const simularApi = ({
  filas = [],
  crear,
}: {
  filas?: unknown[]
  crear?: (cuerpo: Record<string, unknown>) => Response
} = {}) => {
  const peticiones: { url: string; cuerpo: unknown }[] = []

  const falso = vi.fn(async (url: string, opciones?: RequestInit) => {
    const cuerpo = opciones?.body ? JSON.parse(opciones.body as string) : undefined
    peticiones.push({ url, cuerpo })

    if (url.includes('/api/clientes/distritos')) {
      return new Response(JSON.stringify({ exito: true, mensaje: 'ok', datos: ['IBERIA', 'TAMBOPATA'] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (url.includes('/api/clientes') && opciones?.method === 'POST') {
      if (crear) return crear(cuerpo as Record<string, unknown>)
      return new Response(JSON.stringify({ exito: true, mensaje: 'ok', datos: cliente }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (/\/api\/clientes\/\d+/.test(url) && opciones?.method === 'PUT') {
      return new Response(JSON.stringify({ exito: true, mensaje: 'ok', datos: cliente }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (/\/api\/clientes\/\d+\/estado/.test(url) && opciones?.method === 'PATCH') {
      return new Response(JSON.stringify({ exito: true, mensaje: 'ok', datos: cliente }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(
      JSON.stringify({
        exito: true,
        mensaje: 'ok',
        datos: filas,
        meta: { paginacion: { pagina: 1, limite: 20, total: filas.length, totalPaginas: 1 } },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  })

  globalThis.fetch = falso as unknown as typeof fetch
  return { peticiones, falso }
}

const montar = (rol: NombreRol = 'VENDEDOR') =>
  render(
    <ContextoAutenticacion.Provider value={sesion(rol)}>
      <PaginaClientes />
    </ContextoAutenticacion.Provider>,
  )

/**
 * El asterisco de "obligatorio" forma parte del texto de la etiqueta, así que
 * los patrones de campo lo admiten al final. Anclarlo en `^$` sigue siendo
 * necesario: sin ancla, "Teléfono" también encontraría "Teléfono alterno" y
 * "Dirección" encontraría "Referencia de la dirección".
 */
const CAMPO = {
  tipo: /^tipo de cliente/i,
  documento: /^documento\s*\*?$/i,
  ruc: /^ruc\s*\*?$/i,
  nombres: /^nombres y apellidos\s*\*?$/i,
  razonSocial: /^razón social\s*\*?$/i,
  telefono: /^teléfono\s*\*?$/i,
  direccion: /^dirección\s*\*?$/i,
} as const

/** Abre el alta de cliente y devuelve el diálogo ya montado. */
const abrirAlta = async () => {
  await userEvent.click(await screen.findByRole('button', { name: /nuevo cliente/i }))
  return within(screen.getByRole('dialog', { name: 'Nuevo cliente' }))
}

describe('listado de clientes', () => {
  it('muestra los clientes que devuelve la API', async () => {
    simularApi({ filas: [cliente] })
    montar()

    expect(await screen.findByText('70099887')).toBeInTheDocument()
    expect(screen.getByText('María Elena Quispe')).toBeInTheDocument()
  })

  it('un cliente inactivo se distingue de uno activo', async () => {
    simularApi({ filas: [{ ...cliente, activo: false }] })
    montar()
    expect(await screen.findByText('Inactivo')).toBeInTheDocument()
  })

  it('el repartidor no ve el botón de nuevo cliente', async () => {
    simularApi()
    montar('REPARTIDOR')
    await waitFor(() => expect(screen.getByText(/clientes/i)).toBeInTheDocument())
    // El botón se oculta por rol, pero la seguridad real la aplica el backend.
    expect(screen.queryByRole('button', { name: /nuevo cliente/i })).not.toBeInTheDocument()
  })

  it('un estado vacío invita a registrar un cliente', async () => {
    simularApi({ filas: [] })
    montar()
    expect(await screen.findByText(/no hay clientes que coincidan/i)).toBeInTheDocument()
  })
})

describe('alta de cliente', () => {
  it('abre el formulario con los campos obligatorios', async () => {
    simularApi()
    montar()
    const formulario = await abrirAlta()

    expect(formulario.getByLabelText(CAMPO.tipo)).toBeInTheDocument()
    expect(formulario.getByLabelText(CAMPO.documento)).toBeRequired()
    expect(formulario.getByLabelText(CAMPO.nombres)).toBeRequired()
    expect(formulario.getByLabelText(CAMPO.telefono)).toBeRequired()
    expect(formulario.getByLabelText(CAMPO.direccion)).toBeRequired()
  })

  it('envía los datos escritos al backend', async () => {
    const { peticiones } = simularApi()
    montar()
    const formulario = await abrirAlta()

    await userEvent.type(formulario.getByLabelText(CAMPO.documento), '70111999')
    await userEvent.type(formulario.getByLabelText(CAMPO.nombres), 'Rosa Paredes Nina')
    await userEvent.type(formulario.getByLabelText(CAMPO.telefono), '900202020')
    await userEvent.type(formulario.getByLabelText(CAMPO.direccion), 'Av. Iberia 450')

    await userEvent.click(formulario.getByRole('button', { name: /registrar cliente/i }))

    await waitFor(() => {
      const envio = peticiones.find((p) => p.url.endsWith('/api/clientes') && p.cuerpo)
      expect(envio).toBeDefined()
      expect(envio?.cuerpo).toMatchObject({
        documento: '70111999',
        nombres: 'Rosa Paredes Nina',
        telefono: '900202020',
        direccion: 'Av. Iberia 450',
      })
    })
  })

  it('muestra el error del backend bajo el campo que lo produjo', async () => {
    // El backend rechaza el teléfono; el mensaje debe aparecer junto a ese
    // campo, no como un aviso general.
    simularApi({
      crear: () =>
        new Response(
          JSON.stringify({
            exito: false,
            mensaje: 'Datos inválidos',
            codigo: 'VALIDACION',
            detalles: [{ campo: 'telefono', mensaje: 'El teléfono debe tener 9 dígitos' }],
          }),
          { status: 422, headers: { 'Content-Type': 'application/json' } },
        ),
    })
    montar()
    const formulario = await abrirAlta()

    await userEvent.type(formulario.getByLabelText(CAMPO.documento), '70111999')
    await userEvent.type(formulario.getByLabelText(CAMPO.nombres), 'Rosa Paredes Nina')
    await userEvent.type(formulario.getByLabelText(CAMPO.telefono), '123')
    await userEvent.type(formulario.getByLabelText(CAMPO.direccion), 'Av. Iberia 450')
    await userEvent.click(formulario.getByRole('button', { name: /registrar cliente/i }))

    expect(await formulario.findByText('El teléfono debe tener 9 dígitos')).toBeInTheDocument()
  })

  it('un conflicto de duplicado se muestra como aviso general', async () => {
    // El 409 no viene con detalles por campo: el backend no señala qué dato
    // está repetido, así que corresponde un mensaje general.
    simularApi({
      crear: () =>
        new Response(
          JSON.stringify({
            exito: false,
            mensaje: 'Ya existe un cliente con el documento 70111999',
            codigo: 'CLIENTE_DUPLICADO',
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } },
        ),
    })
    montar()
    const formulario = await abrirAlta()

    await userEvent.type(formulario.getByLabelText(CAMPO.documento), '70111999')
    await userEvent.type(formulario.getByLabelText(CAMPO.nombres), 'Rosa Paredes Nina')
    await userEvent.type(formulario.getByLabelText(CAMPO.telefono), '900202020')
    await userEvent.type(formulario.getByLabelText(CAMPO.direccion), 'Av. Iberia 450')
    await userEvent.click(formulario.getByRole('button', { name: /registrar cliente/i }))

    expect(await formulario.findByRole('alert')).toHaveTextContent(/ya existe un cliente/i)
  })

  it('avisa antes de dejar enviar un RUC que no tiene once dígitos', async () => {
    // El backend lo rechazaría con un 422; avisar en el formulario evita un
    // ida y vuelta por una regla que el usuario no puede ver.
    simularApi()
    montar()
    const formulario = await abrirAlta()

    await userEvent.selectOptions(formulario.getByLabelText(CAMPO.tipo), 'EMPRESA')
    await userEvent.type(formulario.getByLabelText(CAMPO.ruc), '205098765')

    expect(formulario.getByText('El RUC debe tener 11 dígitos')).toBeInTheDocument()
  })

  it('un RUC de once dígitos no dispara el aviso', async () => {
    simularApi()
    montar()
    const formulario = await abrirAlta()

    await userEvent.selectOptions(formulario.getByLabelText(CAMPO.tipo), 'EMPRESA')
    await userEvent.type(formulario.getByLabelText(CAMPO.ruc), '20509876543')

    expect(formulario.queryByText('El RUC debe tener 11 dígitos')).not.toBeInTheDocument()
  })

  it('al cambiar a empresa pide la razón social en lugar de los nombres', async () => {
    simularApi()
    montar()
    const formulario = await abrirAlta()

    expect(formulario.getByLabelText(CAMPO.nombres)).toBeInTheDocument()

    await userEvent.selectOptions(formulario.getByLabelText(CAMPO.tipo), 'EMPRESA')

    expect(formulario.getByLabelText(CAMPO.razonSocial)).toBeInTheDocument()
    expect(formulario.queryByLabelText(CAMPO.nombres)).not.toBeInTheDocument()
  })

  it('cerrar el formulario sin guardar no registra nada', async () => {
    const { peticiones } = simularApi()
    montar()
    const formulario = await abrirAlta()

    await userEvent.type(formulario.getByLabelText(CAMPO.documento), '70111999')
    await userEvent.click(formulario.getByRole('button', { name: /cancelar/i }))

    expect(
      peticiones.some((p) => p.url.endsWith('/api/clientes') && p.cuerpo),
    ).toBe(false)
  })
})

describe('edición y cambio de estado', () => {
  it('el formulario de edición se rellena con los datos del cliente', async () => {
    simularApi({ filas: [cliente] })
    montar()
    await userEvent.click(await screen.findByRole('button', { name: /editar/i }))

    const formulario = within(screen.getByRole('dialog', { name: /editar cliente 70099887/i }))
    expect(formulario.getByLabelText(CAMPO.documento)).toHaveValue('70099887')
    expect(formulario.getByLabelText(CAMPO.nombres)).toHaveValue('María Elena Quispe')
    expect(formulario.getByLabelText(CAMPO.telefono)).toHaveValue('900101010')
  })

  it('desactivar un cliente pide confirmación antes de actuar', async () => {
    const { peticiones } = simularApi({ filas: [cliente] })
    montar()

    await userEvent.click(await screen.findByRole('button', { name: /desactivar/i }))

    // Nada se envía hasta que el usuario confirma.
    expect(peticiones.some((p) => p.url.includes('/estado'))).toBe(false)
    expect(screen.getByRole('dialog', { name: 'Desactivar cliente' })).toBeInTheDocument()
  })

  it('la confirmación explica que el historial se conserva', async () => {
    simularApi({ filas: [cliente] })
    montar()
    await userEvent.click(await screen.findByRole('button', { name: /desactivar/i }))

    // Es lo que el prompt exige: no se destruye información histórica.
    expect(screen.getByText(/su historial se conserva/i)).toBeInTheDocument()
  })

  it('confirmar la desactivación la ejecuta', async () => {
    const { peticiones } = simularApi({ filas: [cliente] })
    montar()
    await userEvent.click(await screen.findByRole('button', { name: /desactivar/i }))

    const dialogo = within(screen.getByRole('dialog', { name: 'Desactivar cliente' }))
    await userEvent.click(dialogo.getByRole('button', { name: /^desactivar$/i }))

    await waitFor(() => {
      expect(peticiones.some((p) => p.url.includes('/estado'))).toBe(true)
    })
  })

  it('cancelar la confirmación no desactiva al cliente', async () => {
    const { peticiones } = simularApi({ filas: [cliente] })
    montar()
    await userEvent.click(await screen.findByRole('button', { name: /desactivar/i }))

    const dialogo = within(screen.getByRole('dialog', { name: 'Desactivar cliente' }))
    await userEvent.click(dialogo.getByRole('button', { name: /cancelar/i }))

    expect(peticiones.some((p) => p.url.includes('/estado'))).toBe(false)
  })
})

describe('filtros del listado', () => {
  it('filtrar por tipo consulta al backend con el tipo elegido', async () => {
    const { peticiones } = simularApi()
    montar()

    await userEvent.selectOptions(await screen.findByLabelText(/filtrar por tipo/i), 'EMPRESA')

    await waitFor(() =>
      expect(peticiones.some((p) => p.url.includes('tipo=EMPRESA'))).toBe(true),
    )
  })

  it('el buscador llega al backend con el término escrito', async () => {
    const { peticiones } = simularApi()
    montar()

    const campo = await screen.findByPlaceholderText(/buscar por nombre/i)
    await userEvent.type(campo, 'Qu')

    // `useListado` retrasa la propagación del término: la consulta ocurre una
    // vez, no en cada tecla.
    await waitFor(() =>
      expect(peticiones.some((p) => p.url.includes('busqueda=Qu'))).toBe(true),
    )
    expect(peticiones.filter((p) => p.url.includes('busqueda='))).toHaveLength(1)
  })
})
