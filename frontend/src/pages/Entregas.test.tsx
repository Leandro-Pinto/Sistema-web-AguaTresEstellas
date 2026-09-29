import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PaginaEntregas } from '@/pages/Entregas'
import type { Entrega, Pedido, Repartidor } from '@/types/dominio'

/**
 * Asignación de repartidores y seguimiento de las entregas.
 *
 * La asignación es el punto donde un pedido sale a la calle, así que lo que se
 * comprueba es qué pedidos se ofrecen y qué se le manda al backend: que solo
 * aparezcan los confirmados que aún no tienen reparto (el backend rechaza los
 * demás con `ENTREGA_DUPLICADA` o `PEDIDO_NO_CONFIRMADO`), que se envíen el
 * pedido y el repartidor elegidos, y que una asignación rechazada no cierre el
 * diálogo dejando al usuario sin saber qué pasó.
 *
 * Los mensajes de error que se comparan son los literales de
 * `backend/src/services/entregas.service.ts`: si el backend cambia una regla,
 * esta suite debe avisar en la misma revisión.
 */

const repartidorBase = (extra: Partial<Repartidor> = {}): Repartidor => ({
  id: 3,
  nombres: 'Luis',
  apellidos: 'Ramírez',
  nombre: 'Luis Ramírez',
  documento: '45678912',
  telefono: '900202020',
  direccion: 'Av. Arequipa 1200',
  zona: 'Surco',
  activo: true,
  fechaRegistro: '2026-01-10T08:00:00.000Z',
  eliminadoEn: null,
  ...extra,
})

const reparto = (): Repartidor[] => [
  repartidorBase(),
  repartidorBase({ id: 4, nombre: 'Diego Salas', telefono: '900303030', zona: 'Lurín' }),
]

const pedidoCliente = {
  id: 7,
  nombre: 'María Elena Quispe',
  documento: '70099887',
  telefono: '900101010',
  direccion: 'Jr. Dos de Mayo 33',
  referencia: 'Frente al parque',
}

const pedidoConfirmado = (extra: Partial<Pedido> = {}): Pedido => ({
  id: 1,
  codigo: 'PED-0001',
  clienteId: 7,
  cliente: pedidoCliente,
  recibidoEn: '2026-09-28T10:00:00.000Z',
  registradoEn: '2026-09-28T10:05:00.000Z',
  confirmadoEn: '2026-09-28T11:00:00.000Z',
  asignadoEn: null,
  enRutaEn: null,
  entregadoEn: null,
  canceladoEn: null,
  canal: 'WHATSAPP',
  modalidadEntrega: 'DOMICILIO',
  direccionEntrega: 'Jr. Dos de Mayo 33',
  referenciaEntrega: 'Frente al parque',
  fechaEntregaProgramada: null,
  subtotal: 30,
  descuento: 0,
  total: 30,
  observaciones: null,
  incidencias: null,
  requiereCorreccion: false,
  usuarioId: 1,
  usuario: { id: 1, nombreCompleto: 'Ana Quispe' },
  estado: 'CONFIRMADO',
  detalles: [
    {
      id: 1,
      productoId: 1,
      producto: {
        id: 1,
        codigo: 'BID20',
        nombre: 'Bidón 20 L',
        unidadMedida: 'UNIDAD',
        esRetornable: true,
        stock: 10,
      },
      cantidad: 2,
      precioUnitario: 15,
      subtotal: 30,
      observaciones: null,
    },
  ],
  entrega: null,
  ...extra,
})

const entregaBase = (extra: Partial<Entrega> = {}): Entrega => ({
  id: 55,
  pedidoId: 1,
  pedido: {
    id: 1,
    codigo: 'PED-0001',
    estado: 'ASIGNADO',
    total: 30,
    direccionEntrega: 'Jr. Dos de Mayo 33',
    cliente: {
      id: 7,
      nombre: 'María Elena Quispe',
      telefono: '900101010',
      distrito: 'Miraflores',
    },
    detalles: [
      {
        id: 1,
        productoId: 1,
        producto: {
          id: 1,
          codigo: 'BID20',
          nombre: 'Bidón 20 L',
          unidadMedida: 'UNIDAD',
          esRetornable: true,
          stock: 10,
        },
        cantidad: 2,
        precioUnitario: 15,
        subtotal: 30,
        observaciones: null,
      },
    ],
  },
  repartidorId: 3,
  repartidor: { id: 3, nombre: 'Luis Ramírez', telefono: '900202020' },
  fechaAsignacion: '2026-09-29T08:30:00.000Z',
  horaSalida: null,
  horaEntrega: null,
  minutosDemora: null,
  bidonesEntregados: 0,
  bidonesDevueltos: 0,
  montoRecibido: 0,
  observaciones: null,
  motivoNoEntrega: null,
  recibeFirma: false,
  estado: 'ASIGNADA',
  ...extra,
})

interface Opciones {
  entregas?: Entrega[]
  repartidores?: Repartidor[]
  pedidos?: Pedido[]
  registrar?: (cuerpo: Record<string, unknown>) => Response
}

/**
 * Simula la API del módulo de entregas y registra lo que se le pide. Cada
 * respuesta se construye con la envoltura `{ exito, mensaje, datos }` que
 * espera `services/http`.
 */
const simularApi = ({
  entregas = [],
  repartidores = reparto(),
  pedidos = [pedidoConfirmado()],
  registrar,
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
        meta: {
          paginacion: {
            pagina: 1,
            limite: 20,
            total: datos.length,
            totalPaginas: 1,
          },
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )

  const falso = vi.fn(async (url: string, opciones?: RequestInit) => {
    const metodo = opciones?.method ?? 'GET'
    const cuerpo = opciones?.body ? JSON.parse(opciones.body as string) : undefined
    peticiones.push({ url, metodo, cuerpo })

    if (url.includes('/api/entregas/repartidores/activos')) return envolver(repartidores)
    // El alta va contra la misma ruta que el listado: el método las separa.
    if (url.includes('/api/entregas/entregas') && metodo === 'POST') {
      if (registrar) return registrar(cuerpo as Record<string, unknown>)
      return envolver(entregaBase({ estado: 'ASIGNADA' }), 201)
    }
    if (url.includes('/api/entregas/entregas')) return paginar(entregas)
    if (url.includes('/api/pedidos')) {
      // El backend busca por código, cliente, documento o dirección; para estas
      // pruebas basta el código, que es lo que se escribe en el recuadro.
      const termino = new URL(url, 'http://prueba').searchParams.get('busqueda') ?? ''
      return paginar(termino ? pedidos.filter((p) => p.codigo.includes(termino)) : pedidos)
    }
    return envolver(null)
  })

  globalThis.fetch = falso as unknown as typeof fetch
  return { peticiones, falso }
}

const montar = () => render(<PaginaEntregas />)

/** Peticiones al listado de entregas, para contar recargas. */
const listado = (peticiones: { url: string }[]) =>
  peticiones.filter((peticion) => peticion.url.includes('/api/entregas/entregas'))

/** Las consultas de pedidos que alimentan los candidatos a repartir. */
const consultaCandidatos = (peticiones: { url: string }[]) =>
  peticiones.filter((peticion) => peticion.url.includes('/api/pedidos'))

type Formulario = ReturnType<typeof within>

/** Abre el diálogo de asignación y devuelve su alcance. */
const abrirAsignacion = async (): Promise<Formulario> => {
  await userEvent.click(await screen.findByRole('button', { name: /asignar entrega/i }))
  return within(await screen.findByRole('dialog', { name: 'Asignar entrega' }))
}

/** Elige un pedido del recuadro de candidatos. */
const elegirPedido = async (formulario: Formulario, codigo = 'PED-0001') => {
  await userEvent.click(
    await formulario.findByRole('button', { name: new RegExp(codigo) }, { timeout: 2000 }),
  )
}

/** Elige un repartidor del desplegable del diálogo. */
const elegirRepartidor = async (formulario: Formulario, id = '3') => {
  await userEvent.selectOptions(formulario.getByLabelText(/^repartidor\s*\*?$/i), id)
}

/** Deja el formulario listo para enviar: pedido y repartidor. */
const prepararAsignacion = async (formulario: Formulario) => {
  await elegirPedido(formulario)
  await elegirRepartidor(formulario)
}

// --- Listado ---------------------------------------------------------------

describe('listado de entregas', () => {
  it('muestra el pedido, el cliente y el repartidor de cada entrega', async () => {
    simularApi({ entregas: [entregaBase()] })
    montar()

    expect(await screen.findByText('PED-0001')).toBeInTheDocument()
    expect(screen.getByText('María Elena Quispe')).toBeInTheDocument()
    expect(screen.getByText('Miraflores')).toBeInTheDocument()

    // El repartidor y el estado se comprueban dentro de la fila: los mismos
    // nombres están también en el desplegable de filtros de la barra.
    const fila = (await screen.findByText('PED-0001')).closest('tr') as HTMLElement
    expect(within(fila).getByText('Luis Ramírez')).toBeInTheDocument()
    expect(within(fila).getByText('Asignada')).toBeInTheDocument()
  })

  it('una entrega sin repartidor lo dice en vez de dejar la celda vacía', async () => {
    // Una celda en blanco obliga a adivinar si falta el dato o si no hay
    // repartidor; "Sin asignar" es un dato.
    simularApi({ entregas: [entregaBase({ repartidorId: 0, repartidor: undefined })] })
    montar()

    expect(await screen.findByText('Sin asignar')).toBeInTheDocument()
  })

  it('una entrega que sigue en ruta no muestra fecha de entrega', async () => {
    simularApi({
      entregas: [entregaBase({ estado: 'EN_RUTA', horaSalida: '2026-09-29T09:00:00.000Z' })],
    })
    montar()

    const celda = (await screen.findByText('En ruta')).closest('td')?.previousElementSibling
    expect(celda).toHaveTextContent('—')
    expect(celda).not.toHaveTextContent('min de demora')
  })

  it('la demora solo aparece cuando la hubo', async () => {
    simularApi({
      entregas: [
        entregaBase({
          estado: 'ENTREGADA',
          horaEntrega: '2026-09-29T10:15:00.000Z',
          minutosDemora: 25,
        }),
      ],
    })
    montar()

    expect(await screen.findByText('25 min de demora')).toBeInTheDocument()
    const fila = (await screen.findByText('25 min de demora')).closest('tr') as HTMLElement
    expect(within(fila).getByText('Entregada')).toBeInTheDocument()
  })

  it('el filtro de estado ofrece el circuito completo de la entrega', async () => {
    // Los estados del filtro tienen que ser los mismos que acepta el backend
    // en `actualizarEntregaSchema`; un estado de más sería un 422 al filtrar.
    simularApi()
    montar()

    const opciones = within(
      await screen.findByLabelText('Filtrar por estado'),
    ).getAllByRole('option')

    expect(opciones.map((opcion) => (opcion as HTMLOptionElement).value)).toEqual([
      'todos',
      'PENDIENTE',
      'ASIGNADA',
      'EN_RUTA',
      'ENTREGADA',
      'NO_ENTREGADO',
      'CANCELADA',
    ])
  })

  it('filtrar por estado se lo pregunta al backend', async () => {
    const { peticiones } = simularApi()
    montar()

    await userEvent.selectOptions(await screen.findByLabelText('Filtrar por estado'), 'NO_ENTREGADO')

    await waitFor(() =>
      expect(listado(peticiones).some((peticion) => peticion.url.includes('estado=NO_ENTREGADO'))).toBe(
        true,
      ),
    )
  })

  it('el filtro de repartidor se arma con los repartidores activos', async () => {
    const { peticiones } = simularApi()
    montar()

    const select = await screen.findByLabelText('Filtrar por repartidor')
    expect(within(select).getByRole('option', { name: 'Luis Ramírez' })).toBeInTheDocument()
    expect(within(select).getByRole('option', { name: 'Diego Salas' })).toBeInTheDocument()

    await userEvent.selectOptions(select, '4')
    await waitFor(() =>
      expect(listado(peticiones).some((peticion) => peticion.url.includes('repartidorId=4'))).toBe(true),
    )
  })

  it('el rango de fechas se envía como fechas, no como texto vacío', async () => {
    const { peticiones } = simularApi()
    montar()

    fireEvent.change(await screen.findByLabelText('Desde'), { target: { value: '2026-09-01' } })
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-09-30' } })

    await waitFor(() => {
      const consulta = listado(peticiones).at(-1)?.url ?? ''
      expect(consulta).toContain('fechaInicio=2026-09-01')
      expect(consulta).toContain('fechaFin=2026-09-30')
    })
  })

  it('sin fechas escritas no viajan parámetros de fecha', async () => {
    // `construirUrl` ya descarta los vacíos; la comprueba es que el filtro
    // arranque limpio en vez de mandar `fechaInicio=` sin valor.
    const { peticiones } = simularApi()
    montar()

    await screen.findByText('Entregas')
    const inicial = listado(peticiones)[0]?.url ?? ''
    expect(inicial).not.toContain('fechaInicio')
    expect(inicial).not.toContain('fechaFin')
  })

  it('la búsqueda espera a que se termine de escribir', async () => {
    const { peticiones } = simularApi()
    montar()

    await userEvent.type(screen.getByRole('searchbox', { name: /buscar por pedido o cliente/i }), 'PED')

    await waitFor(
      () => expect(listado(peticiones).some((peticion) => peticion.url.includes('busqueda=PED'))).toBe(true),
      { timeout: 2000 },
    )
  })

  it('sin coincidencias explica cómo crear la primera entrega', async () => {
    simularApi({ entregas: [] })
    montar()

    expect(await screen.findByText('No hay entregas que coincidan')).toBeInTheDocument()
    expect(
      screen.getByText(/asigne un repartidor a un pedido confirmado/i),
    ).toBeInTheDocument()
  })
})

// --- Asignación de entrega -------------------------------------------------

describe('asignación de entrega', () => {
  it('al abrir se piden solo pedidos confirmados y en cantidad acotada', async () => {
    const { peticiones } = simularApi()
    montar()

    await abrirAsignacion()

    const consulta = consultaCandidatos(peticiones).at(-1)?.url ?? ''
    expect(consulta).toContain('estado=CONFIRMADO')
    expect(consulta).toContain('limite=50')
  })

  it('los pedidos que ya tienen reparto no se ofrecen', async () => {
    // El backend rechaza con `ENTREGA_DUPLICADA` un pedido con entrega, así que
    // ofrecerlo convertiría un error evitable en un rechazo del servidor.
    simularApi({
      pedidos: [
        pedidoConfirmado(),
        pedidoConfirmado({ id: 2, codigo: 'PED-0002', entrega: entregaBase({ id: 9, pedidoId: 2 }) }),
      ],
    })
    montar()
    const formulario = await abrirAsignacion()

    expect(await formulario.findByRole('button', { name: /PED-0001/ })).toBeInTheDocument()
    expect(formulario.queryByRole('button', { name: /PED-0002/ })).toBeNull()
  })

  it('sin pedidos que repartir el recuadro lo explica', async () => {
    simularApi({ pedidos: [] })
    montar()
    const formulario = await abrirAsignacion()

    expect(
      await formulario.findByText('Sin pedidos por asignar', undefined, { timeout: 2000 }),
    ).toBeInTheDocument()
  })

  it('no se puede asignar sin elegir pedido y repartidor', async () => {
    simularApi()
    montar()
    const formulario = await abrirAsignacion()

    const enviar = () => formulario.getByRole('button', { name: /asignar entrega/i })
    expect(enviar()).toBeDisabled()

    await elegirPedido(formulario)
    expect(enviar()).toBeDisabled()

    await elegirRepartidor(formulario)
    await waitFor(() => expect(enviar()).toBeEnabled())
  })

  it('elegir un pedido muestra su punto de entrega', async () => {
    // La dirección y el teléfono son lo que el repartidor necesita; sin ellos
    // la asignación se hace a ciegas.
    simularApi()
    montar()
    const formulario = await abrirAsignacion()

    await elegirPedido(formulario)

    const ficha = (await formulario.findByText('Punto de entrega')).closest('section') as HTMLElement
    expect(ficha).toHaveTextContent('Jr. Dos de Mayo 33')
    expect(ficha).toHaveTextContent('900101010')
    expect(ficha).toHaveTextContent('Entrega a domicilio')
  })

  it('un pedido para recoger en tienda no se presenta como domicilio', async () => {
    simularApi({
      pedidos: [pedidoConfirmado({ modalidadEntrega: 'RECOJO', direccionEntrega: '' })],
    })
    montar()
    const formulario = await abrirAsignacion()

    await elegirPedido(formulario)

    const ficha = (await formulario.findByText('Punto de entrega')).closest('section') as HTMLElement
    expect(ficha).toHaveTextContent('Recogida en tienda')
    expect(ficha).toHaveTextContent('Sin dirección registrada')
  })

  it('buscar en el recuadro vuelve a consultar con el término escrito', async () => {
    const { peticiones } = simularApi()
    montar()
    const formulario = await abrirAsignacion()

    await userEvent.type(formulario.getByLabelText('Buscar pedido confirmado'), 'PED-0009')

    await waitFor(
      () =>
        expect(consultaCandidatos(peticiones).some((peticion) => peticion.url.includes('busqueda=PED-0009'))).toBe(
          true,
        ),
      { timeout: 2000 },
    )
  })

  it('cambiar la búsqueda retira el pedido elegido si ya no está en la lista', async () => {
    // Antes, la ficha seguía mostrando el pedido viejo y el botón quedaba
    // habilitado: se podía enviar el reparto de un pedido que ya no aparecía en
    // la lista, sin que nada en pantalla lo delatara.
    simularApi({
      pedidos: [pedidoConfirmado(), pedidoConfirmado({ id: 2, codigo: 'PED-0002' })],
    })
    montar()
    const formulario = await abrirAsignacion()

    // Se elige PED-0001 y luego se busca PED-0002: el pedido elegido desaparece
    // de la lista y la ficha tiene que irse con él.
    await prepararAsignacion(formulario)
    expect(formulario.getByText('Punto de entrega')).toBeInTheDocument()

    await userEvent.type(formulario.getByLabelText('Buscar pedido confirmado'), 'PED-0002')

    await waitFor(() => expect(formulario.queryByRole('button', { name: /PED-0001/ })).toBeNull())
    expect(formulario.getByRole('button', { name: /PED-0002/ })).toBeInTheDocument()
    // La ficha y el botón se derivan de la misma lista, así que desaparecen en
    // el mismo render: no hay un momento en que la tarjeta siga describiendo un
    // pedido que la lista ya no muestra.
    expect(formulario.queryByText('Punto de entrega')).toBeNull()
    expect(formulario.getByRole('button', { name: /asignar entrega/i })).toBeDisabled()
  })

  it('la elección se conserva si el pedido sigue en los resultados', async () => {
    // El invariante es "el pedido elegido está a la vista", no "no se ha
    // escrito nada": corregir una errata no debe borrar lo ya elegido.
    const { peticiones } = simularApi({
      pedidos: [pedidoConfirmado(), pedidoConfirmado({ id: 2, codigo: 'PED-0002' })],
    })
    montar()
    const formulario = await abrirAsignacion()

    await prepararAsignacion(formulario)
    await userEvent.type(formulario.getByLabelText('Buscar pedido confirmado'), 'PED-000')

    // Se espera a que la consulta termine, no solo a que esté escrita: la
    // pregunta es si la elección sobrevive a la lista nueva.
    await waitFor(
      () =>
        expect(consultaCandidatos(peticiones).some((peticion) => peticion.url.includes('busqueda=PED-000'))).toBe(
          true,
        ),
      { timeout: 2000 },
    )
    expect(formulario.getByText('Punto de entrega')).toBeInTheDocument()
    expect(formulario.getByRole('button', { name: /asignar entrega/i })).toBeEnabled()
  })

  it('envía el pedido, el repartidor y las observaciones escritas', async () => {
    const { peticiones } = simularApi()
    montar()
    const formulario = await abrirAsignacion()

    await prepararAsignacion(formulario)
    await userEvent.type(
      formulario.getByLabelText(/^observaciones para el repartidor$/i),
      'Tocar el timbre del 3B',
    )
    await userEvent.click(formulario.getByRole('button', { name: /asignar entrega/i }))

    await waitFor(() => {
      const envio = peticiones.find(
        (peticion) => peticion.metodo === 'POST' && peticion.url.includes('/api/entregas/entregas'),
      )
      expect(envio?.cuerpo).toEqual({
        pedidoId: 1,
        repartidorId: 3,
        observaciones: 'Tocar el timbre del 3B',
      })
    })
  })

  it('sin observaciones el cuerpo lleva null y no una cadena vacía', async () => {
    // El backend valida con `textoOpcional`, que trata la cadena vacía como
    // texto escrito; mandar `null` deja claro que el campo no se llenó.
    const { peticiones } = simularApi()
    montar()
    const formulario = await abrirAsignacion()

    await prepararAsignacion(formulario)
    await userEvent.click(formulario.getByRole('button', { name: /asignar entrega/i }))

    await waitFor(() => {
      const envio = peticiones.find((peticion) => peticion.metodo === 'POST')
      expect(envio?.cuerpo).toMatchObject({ pedidoId: 1, repartidorId: 3, observaciones: null })
    })
  })

  it('al asignar avisa con el nombre del repartidor, cierra y recarga la tabla', async () => {
    const { peticiones } = simularApi()
    montar()
    const formulario = await abrirAsignacion()

    await prepararAsignacion(formulario)
    await userEvent.click(formulario.getByRole('button', { name: /asignar entrega/i }))

    const aviso = await screen.findByRole('status')
    expect(aviso).toHaveTextContent('Entrega del pedido PED-0001 asignada a Luis Ramírez.')
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Asignar entrega' })).not.toBeInTheDocument(),
    )
    await waitFor(() => expect(listado(peticiones).length).toBeGreaterThan(1))
  })

  it('un pedido que ya tenía reparto explica el rechazo y deja el diálogo abierto', async () => {
    // Cierra el diálogo y el usuario solo ve que nada pasó: se queda con el
    // formulario puesto y el motivo a la vista.
    simularApi({
      registrar: () =>
        new Response(
          JSON.stringify({
            exito: false,
            mensaje: 'El pedido ya tiene una entrega asignada',
            codigo: 'ENTREGA_DUPLICADA',
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } },
        ),
    })
    montar()
    const formulario = await abrirAsignacion()

    await prepararAsignacion(formulario)
    await userEvent.click(formulario.getByRole('button', { name: /asignar entrega/i }))

    expect(
      await formulario.findByText('El pedido ya tiene una entrega asignada'),
    ).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Asignar entrega' })).toBeInTheDocument()
  })

  it('un repartidor que se dio de baja se explica sin perder lo escrito', async () => {
    // El reparto se cargó al abrir la pantalla: entre entonces y el envío el
    // repartidor pudo desactivarse, y el aviso debe nombrar ese motivo.
    simularApi({
      registrar: () =>
        new Response(
          JSON.stringify({
            exito: false,
            mensaje: 'El repartidor seleccionado no está activo',
            codigo: 'REPARTIDOR_INACTIVO',
          }),
          { status: 422, headers: { 'Content-Type': 'application/json' } },
        ),
    })
    montar()
    const formulario = await abrirAsignacion()

    await prepararAsignacion(formulario)
    await userEvent.type(
      formulario.getByLabelText(/^observaciones para el repartidor$/i),
      'Dejar en portera',
    )
    await userEvent.click(formulario.getByRole('button', { name: /asignar entrega/i }))

    expect(
      await formulario.findByText('El repartidor seleccionado no está activo'),
    ).toBeInTheDocument()
    expect(formulario.getByLabelText(/^observaciones para el repartidor$/i)).toHaveValue(
      'Dejar en portera',
    )
  })

  it('si el servidor no responde se muestra un mensaje que invite a reintentar', async () => {
    // Sin cuerpo JSON, el mensaje concreto no existe: el cliente debe decir el
    // suyo en vez de dejar la cadena vacía.
    simularApi({ registrar: () => new Response('', { status: 503 }) })
    montar()
    const formulario = await abrirAsignacion()

    await prepararAsignacion(formulario)
    await userEvent.click(formulario.getByRole('button', { name: /asignar entrega/i }))

    expect(
      await formulario.findByText(/el servidor no pudo completar la operación/i),
    ).toBeInTheDocument()
  })

  it('cerrar el diálogo descarta lo que se había elegido', async () => {
    // Si el formulario se conservara, el siguiente reparto se enviaría con el
    // pedido y el repartidor del reparto anterior.
    simularApi()
    montar()
    const formulario = await abrirAsignacion()

    await prepararAsignacion(formulario)
    await userEvent.type(
      formulario.getByLabelText(/^observaciones para el repartidor$/i),
      'Tocar el timbre',
    )
    await userEvent.click(formulario.getByRole('button', { name: /^cancelar$/i }))

    const limpio = await abrirAsignacion()
    expect(limpio.queryByText('Punto de entrega')).toBeNull()
    expect(limpio.getByLabelText(/^observaciones para el repartidor$/i)).toHaveValue('')
    expect(limpio.getByLabelText(/^repartidor\s*\*?$/i)).toHaveValue('')
    expect(limpio.getByRole('button', { name: /asignar entrega/i })).toBeDisabled()
  })

  it('el diálogo y el filtro del listado ofrecen la misma gente', async () => {
    // Si divergieran, se podría asignar a un repartidor que el filtro no
    // muestra, y el seguimiento de "sus entregas" no lo encontraría.
    simularApi()
    montar()
    const formulario = await abrirAsignacion()

    const opciones = within(formulario.getByLabelText(/^repartidor\s*\*?$/i)).getAllByRole('option')
    expect(opciones.map((opcion) => (opcion as HTMLOptionElement).textContent)).toEqual([
      'Seleccione un repartidor activo',
      'Luis Ramírez',
      'Diego Salas',
    ])
  })

  it('no se piden los candidatos hasta que se abre el diálogo', async () => {
    // El componente de asignación está siempre montado y `usePeticion` corre
    // su efecto al montar: sin el guardia ligado a `abierto`, cada visita a la
    // pantalla arrastraba la consulta de hasta cincuenta pedidos confirmados
    // aunque nadie asignara un reparto.
    const { peticiones } = simularApi()
    montar()

    await screen.findByText('Entregas')
    expect(consultaCandidatos(peticiones)).toHaveLength(0)

    await abrirAsignacion()
    await waitFor(() => expect(consultaCandidatos(peticiones).length).toBeGreaterThan(0))
  })

  it('cerrar el diálogo no vuelve a pedir los candidatos', async () => {
    const { peticiones } = simularApi()
    montar()
    const formulario = await abrirAsignacion()

    await waitFor(() => expect(consultaCandidatos(peticiones).length).toBe(1))
    await userEvent.click(formulario.getByRole('button', { name: /^cancelar$/i }))

    // Al reabrir se consulta de nuevo, no antes: la lista del diálogo anterior
    // no se reutiliza porque el reparto pudo cambiar mientras tanto.
    await waitFor(() => expect(consultaCandidatos(peticiones)).toHaveLength(1))
    await abrirAsignacion()
    await waitFor(() => expect(consultaCandidatos(peticiones).length).toBe(2))
  })
})

// --- Ficha de la entrega ---------------------------------------------------

describe('ficha de la entrega', () => {
  const abrirFicha = async () => {
    const fila = (await screen.findByText('PED-0001')).closest('tr') as HTMLElement
    await userEvent.click(within(fila).getByRole('button', { name: /ver/i }))
    return within(await screen.findByRole('dialog', { name: /entrega del pedido PED-0001/i }))
  }

  it('se abre nombrando el pedido al que pertenece', async () => {
    simularApi({ entregas: [entregaBase()] })
    montar()

    const ficha = await abrirFicha()
    expect(ficha.getByText('María Elena Quispe')).toBeInTheDocument()
    expect(ficha.getByText('Asignada')).toBeInTheDocument()
  })

  it('resume estado, salida, entrega y monto recibido', async () => {
    simularApi({
      entregas: [
        entregaBase({
          estado: 'ENTREGADA',
          horaSalida: '2026-09-29T09:00:00.000Z',
          horaEntrega: '2026-09-29T10:15:00.000Z',
          montoRecibido: 30,
        }),
      ],
    })
    montar()

    const ficha = await abrirFicha()
    expect(ficha.getByText('Estado').parentElement).toHaveTextContent('Entregada')
    // El monto es lo que el repartidor cobró; el saldo del pedido se ve en
    // Ventas, no aquí.
    expect(ficha.getByText('Monto recibido').parentElement).toHaveTextContent(/30[.,]00/)
  })

  it('marca con un guion los horarios que aún no existen', async () => {
    // En una entrega recién asignada no hay salida ni entrega: dos celdas en
    // blanco se leen como un dato faltante en la base.
    simularApi({ entregas: [entregaBase()] })
    montar()

    const ficha = await abrirFicha()
    expect(ficha.getByText('Salida').parentElement).toHaveTextContent('—')
    expect(ficha.getByText('Entrega').parentElement).toHaveTextContent('—')
  })

  it('detalla repartidor, contacto y estado del pedido', async () => {
    simularApi({ entregas: [entregaBase()] })
    montar()

    const ficha = await abrirFicha()
    expect(ficha.getByText('Repartidor').nextElementSibling).toHaveTextContent('Luis Ramírez')
    expect(ficha.getByText('Teléfono').nextElementSibling).toHaveTextContent('900202020')
    // El pedido va a "Asignado" cuando se asigna el reparto: son dos estados
    // distintos y confundirlos hace creer que la entrega ya salió.
    expect(ficha.getByText('Estado del pedido').nextElementSibling).toHaveTextContent('Asignado')
  })

  it('una entrega sin repartidor lo dice también en la ficha', async () => {
    simularApi({ entregas: [entregaBase({ repartidorId: 0, repartidor: undefined })] })
    montar()

    const ficha = await abrirFicha()
    expect(ficha.getByText('Repartidor').nextElementSibling).toHaveTextContent('Sin asignar')
    expect(ficha.getByText('Teléfono').nextElementSibling).toHaveTextContent('—')
  })

  it('cuenta los bidones entregados y devueltos', async () => {
    simularApi({
      entregas: [entregaBase({ bidonesEntregados: 3, bidonesDevueltos: 1 })],
    })
    montar()

    const ficha = await abrirFicha()
    expect(ficha.getByText('Bidones').nextElementSibling).toHaveTextContent(
      '3 entregados / 1 devueltos',
    )
  })

  it('la demora, la firma y el motivo solo aparecen cuando existen', async () => {
    simularApi({
      entregas: [
        entregaBase({
          estado: 'NO_ENTREGADO',
          minutosDemora: 12,
          recibeFirma: true,
          motivoNoEntrega: 'El cliente no atendió',
        }),
      ],
    })
    montar()

    const ficha = await abrirFicha()
    expect(ficha.getByText('Demora').nextElementSibling).toHaveTextContent('12 minutos')
    expect(ficha.getByText('Firma').nextElementSibling).toHaveTextContent('Recibida')
    expect(ficha.getByText('No entregado porque').nextElementSibling).toHaveTextContent(
      'El cliente no atendió',
    )
  })

  it('una entrega corriente no inventa demora, firma ni motivo', async () => {
    // Filas vacías en la ficha enseñan a desconfiar de las que sí tienen
    // información.
    simularApi({ entregas: [entregaBase()] })
    montar()

    const ficha = await abrirFicha()
    expect(ficha.queryByText('Demora')).toBeNull()
    expect(ficha.queryByText('Firma')).toBeNull()
    expect(ficha.queryByText('No entregado porque')).toBeNull()
  })

  it('muestra las observaciones que dejó quien asignó el reparto', async () => {
    simularApi({ entregas: [entregaBase({ observaciones: 'Avisar por WhatsApp al llegar' })] })
    montar()

    const ficha = await abrirFicha()
    expect(ficha.getByText('Observaciones').nextElementSibling).toHaveTextContent(
      'Avisar por WhatsApp al llegar',
    )
  })

  it('lista los productos a entregar con su cantidad', async () => {
    simularApi({ entregas: [entregaBase()] })
    montar()

    const ficha = await abrirFicha()
    const productos = ficha.getByText('Productos a entregar').closest('section') as HTMLElement
    expect(productos).toHaveTextContent('Bidón 20 L')
    expect(productos).toHaveTextContent('2 UNIDAD')
  })

  it('una entrega cuyos productos no se conocen omite ese bloque', async () => {
    simularApi({
      entregas: [entregaBase({ pedido: { ...entregaBase().pedido!, detalles: [] } })],
    })
    montar()

    const ficha = await abrirFicha()
    expect(ficha.queryByText('Productos a entregar')).toBeNull()
  })

  it('cerrar la ficha la devuelve al listado', async () => {
    simularApi({ entregas: [entregaBase()] })
    montar()

    const ficha = await abrirFicha()
    // El diálogo tiene dos salidas con el mismo nombre: la "X" de la esquina y
    // el botón del pie. Se pulsa el del pie, que es el que ve el usuario.
    const [, delPie] = ficha.getAllByRole('button', { name: /^cerrar$/i })
    await userEvent.click(delPie)

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /entrega del pedido/i })).not.toBeInTheDocument(),
    )
    expect(screen.getByText('PED-0001')).toBeInTheDocument()
  })
})
