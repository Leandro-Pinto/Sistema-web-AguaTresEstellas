import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PaginaPedidos } from '@/pages/Pedidos'
import { ContextoAutenticacion } from '@/context/autenticacion'
import type { ValorAutenticacion } from '@/context/autenticacion'
import type {
  ClienteRapido,
  NombreRol,
  Pedido,
  PedidoDetalle,
  ProductoFormulario,
} from '@/types/dominio'

/**
 * Registro y seguimiento de pedidos.
 *
 * Es el flujo que produce los ingresos, así que lo que se comprueba es qué
 * datos viajan al backend y qué reglas de negocio se respetan: que un pedido
 * sin productos no se acepte en silencio, que la estimación que ve el vendedor
 * no sea la que se guarda, y que las transiciones de estado ofrezcan solo las
 * que el servidor permite.
 *
 * Los importes que se comparan son los de la estimación de la pantalla. El
 * total definitivo lo recalcula el backend a partir del catálogo, y esa
 * diferencia es intencionada: el vendedor ve una cifra mientras arma el
 * pedido, no la que se cobrará.
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

const clienteBuscable: ClienteRapido = {
  id: 7,
  tipo: 'PERSONA',
  documento: '70099887',
  nombre: 'María Elena Quispe',
  telefono: '900101010',
  direccion: 'Jr. Dos de Mayo 33',
  referencia: 'Frente al parque',
}

const catalogo: ProductoFormulario[] = [
  {
    id: 1,
    codigo: 'BID20',
    nombre: 'Bidón 20 L',
    unidadMedida: 'UNIDAD',
    precioVenta: 15,
    stock: 10,
    stockMinimo: 3,
    esRetornable: true,
  },
  {
    id: 2,
    codigo: 'AGUA625',
    nombre: 'Agua 625 ml',
    unidadMedida: 'UNIDAD',
    precioVenta: 2.5,
    stock: 50,
    stockMinimo: 10,
    esRetornable: false,
  },
  {
    id: 3,
    codigo: 'BID10',
    nombre: 'Bidón 10 L',
    unidadMedida: 'UNIDAD',
    precioVenta: 9,
    stock: 2,
    stockMinimo: 3,
    esRetornable: true,
  },
]

const pedidoBase = (extra: Partial<Pedido> = {}): Pedido => ({
  id: 1,
  codigo: 'PED-0001',
  clienteId: 7,
  cliente: {
    id: 7,
    nombre: 'María Elena Quispe',
    documento: '70099887',
    telefono: '900101010',
    direccion: 'Jr. Dos de Mayo 33',
    referencia: 'Frente al parque',
  },
  recibidoEn: '2026-09-28T10:00:00.000Z',
  registradoEn: '2026-09-28T10:05:00.000Z',
  confirmadoEn: null,
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
  estado: 'PENDIENTE',
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
  ...extra,
})

const detalle = (extra: Partial<PedidoDetalle> = {}): PedidoDetalle => ({
  ...pedidoBase(),
  historial: [
    {
      id: 1,
      pedidoId: 1,
      estadoAnterior: null,
      estadoNuevo: 'PENDIENTE',
      descripcion: 'Pedido registrado',
      observaciones: null,
      incidencia: null,
      fecha: '2026-09-28T10:05:00.000Z',
      usuario: { nombreCompleto: 'Ana Quispe', rol: { nombre: 'VENDEDOR' } },
    },
  ],
  movimientosBidon: [],
  venta: null,
  ...extra,
})

interface Opciones {
  pedidos?: Pedido[]
  productos?: ProductoFormulario[]
  candidatos?: ClienteRapido[]
  crear?: (cuerpo: Record<string, unknown>) => Response
  detalle?: (id: number) => Response
  cambiarEstado?: (cuerpo: Record<string, unknown>) => Response
}

/**
 * Simula la API del módulo de pedidos y registra lo que se le pide. Cada
 * respuesta se construye con la envoltura `{ exito, mensaje, datos }` que
 * espera `services/http`.
 */
const simularApi = ({
  pedidos = [],
  productos = catalogo,
  candidatos = [clienteBuscable],
  crear,
  detalle: obtenerDetalle,
  cambiarEstado,
}: Opciones = {}) => {
  const peticiones: { url: string; metodo: string; cuerpo: unknown }[] = []

  const envolver = (datos: unknown, status = 200) =>
    new Response(JSON.stringify({ exito: true, mensaje: 'ok', datos }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })

  const falso = vi.fn(async (url: string, opciones?: RequestInit) => {
    const metodo = opciones?.method ?? 'GET'
    const cuerpo = opciones?.body ? JSON.parse(opciones.body as string) : undefined
    peticiones.push({ url, metodo, cuerpo })

    if (url.includes('/api/productos/activos')) return envolver(productos)
    if (url.includes('/api/clientes/buscar')) return envolver(candidatos)
    if (/\/api\/pedidos\/\d+\/estado/.test(url)) {
      return cambiarEstado ? cambiarEstado(cuerpo as Record<string, unknown>) : envolver(pedidoBase())
    }
    if (/\/api\/pedidos\/\d+$/.test(url)) {
      return obtenerDetalle ? obtenerDetalle(1) : envolver(detalle())
    }
    if (url.includes('/api/pedidos') && metodo === 'POST') {
      if (crear) return crear(cuerpo as Record<string, unknown>)
      return envolver(pedidoBase({ codigo: 'PED-0002' }), 201)
    }
    if (url.includes('/api/pedidos')) {
      return new Response(
        JSON.stringify({
          exito: true,
          mensaje: 'ok',
          datos: pedidos,
          meta: {
            paginacion: {
              pagina: 1,
              limite: 20,
              total: pedidos.length,
              totalPaginas: 1,
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
    return envolver(null)
  })

  globalThis.fetch = falso as unknown as typeof fetch
  return { peticiones, falso }
}

const montar = () =>
  render(
    <ContextoAutenticacion.Provider value={sesion('VENDEDOR')}>
      <PaginaPedidos />
    </ContextoAutenticacion.Provider>,
  )

/** Abre el formulario de alta y devuelve su diálogo. */
const abrirAlta = async () => {
  await userEvent.click(await screen.findByRole('button', { name: /registrar pedido/i }))
  return within(await screen.findByRole('dialog', { name: 'Registrar pedido' }))
}

/**
 * Las consultas acotadas al diálogo abierto. Se tipan con el retorno de
 * `within` para que los helpers no puedan recibir por error un elemento
 * suelto y化合ieran dos veces.
 */
type Formulario = ReturnType<typeof within>

/** Elige un cliente del autocompletado tras escribir su nombre. */
const elegirCliente = async (formulario: Formulario, termino = 'Qu') => {
  await userEvent.type(formulario.getByLabelText('Buscar cliente'), termino)
  const sugerencia = await formulario.findByRole(
    'button',
    { name: new RegExp(clienteBuscable.nombre) },
    { timeout: 2000 },
  )
  await userEvent.click(sugerencia)
}

/** Busca un producto y lo agrega como línea del pedido. */
const agregarProducto = async (
  formulario: Formulario,
  nombre: string,
  { veces = 1 }: { veces?: number } = {},
) => {
  const campo = formulario.getByLabelText('Buscar producto')
  for (let i = 0; i < veces; i += 1) {
    await userEvent.type(campo, nombre)
    const sugerencia = await formulario.findByRole(
      'button',
      { name: new RegExp(nombre) },
      { timeout: 2000 },
    )
    await userEvent.click(sugerencia)
  }
}

// --- Listado ---------------------------------------------------------------

describe('listado de pedidos', () => {
  it('muestra código, cliente, total y estado', async () => {
    simularApi({ pedidos: [pedidoBase()] })
    montar()

    expect(await screen.findByText('PED-0001')).toBeInTheDocument()
    expect(screen.getByText('María Elena Quispe')).toBeInTheDocument()
    expect(screen.getByText(/30[.,]00/)).toBeInTheDocument()
    expect(screen.getByText('Pendiente')).toBeInTheDocument()
  })

  it('señala los pedidos que requieren corrección', async () => {
    simularApi({ pedidos: [pedidoBase({ requiereCorreccion: true })] })
    montar()

    // La marca acompaña al código: es lo que el vendedor debe revisar antes
    // de sacar el pedido a ruta.
    const celda = (await screen.findByText('PED-0001')).closest('td')
    expect(within(celda as HTMLElement).getByText('revisar')).toBeInTheDocument()
  })

  it('un pedido pendiente ofrece confirmar y cancelar', async () => {
    simularApi({ pedidos: [pedidoBase({ estado: 'PENDIENTE' })] })
    montar()

    const fila = (await screen.findByText('PED-0001')).closest('tr') as HTMLElement
    expect(within(fila).getByRole('button', { name: /confirmar/i })).toBeInTheDocument()
    expect(within(fila).getByRole('button', { name: /cancelar/i })).toBeInTheDocument()
  })

  it('un pedido entregado no ofrece ninguna transición', async () => {
    // `TRANSICIONES_PEDIDO.ENTREGADO` está vacío: no hay a dónde ir. Ofrecer
    // un botón sería ofrecer algo que el servidor va a rechazar.
    simularApi({ pedidos: [pedidoBase({ estado: 'ENTREGADO' })] })
    montar()

    const fila = (await screen.findByText('PED-0001')).closest('tr') as HTMLElement
    expect(within(fila).queryByRole('button', { name: /confirmar|asignar|en ruta|entregar/i })).toBeNull()
    expect(within(fila).getByRole('button', { name: /ver/i })).toBeInTheDocument()
  })

  it('un estado vacío invita a registrar el pedido del día', async () => {
    simularApi({ pedidos: [] })
    montar()

    expect(await screen.findByText('No hay pedidos que coincidan')).toBeInTheDocument()
  })
})

// --- Autocompletado de cliente ---------------------------------------------

describe('autocompletado de cliente', () => {
  it('con un solo carácter no consulta al backend', async () => {
    const { peticiones } = simularApi()
    montar()
    const formulario = await abrirAlta()

    await userEvent.type(formulario.getByLabelText('Buscar cliente'), 'M')
    await new Promise((resolver) => setTimeout(resolver, 600))

    // El backend exige dos caracteres: preguntar antes solo devolvería una
    // lista vacía sin explicar por qué.
    expect(peticiones.some((p) => p.url.includes('termino=M'))).toBe(false)
  })

  it('no se consulta el buscador al abrir la pantalla', async () => {
    // El guardia de dos caracteres va dentro de `cargar`, no solo en las
    // dependencias: `usePeticion` corre su efecto al montarse, y como
    // `construirUrl` descarta los vacíos, la petición salía como
    // `?limite=8` sin `termino`, que el esquema del backend rechaza.
    const { peticiones } = simularApi()
    montar()
    await abrirAlta()

    expect(peticiones.some((p) => p.url.includes('/clientes/buscar'))).toBe(false)
  })

  it('seguir escribiendo vuelve a consultar con el término nuevo', async () => {
    // Las dependencias son el término retrasado, no un booleano: con un
    // booleano, pasar de "Qu" a "Quis" no volvía a preguntar y la lista
    // seguía mostrando los resultados de "Qu".
    const { peticiones } = simularApi()
    montar()
    const formulario = await abrirAlta()

    const campo = formulario.getByLabelText('Buscar cliente')
    await userEvent.type(campo, 'Qu')
    await waitFor(
      () => expect(peticiones.some((p) => p.url.includes('termino=Qu'))).toBe(true),
      { timeout: 2000 },
    )

    await userEvent.type(campo, 'is')
    await waitFor(
      () => expect(peticiones.some((p) => p.url.includes('termino=Quis'))).toBe(true),
      { timeout: 2000 },
    )
  })

  it('la ficha del cliente elegido sobrevive a limpiar el buscador', async () => {
    // Al elegir se vacía el campo de búsqueda, lo que dispara otra
    // consulta. Si la ficha se buscara dentro de los resultados, desaparecería
    // justo después de elegir, dejando un pedido sin cliente a la vista.
    simularApi()
    montar()
    const formulario = await abrirAlta()

    await elegirCliente(formulario)
    expect(formulario.getByLabelText('Buscar cliente')).toHaveValue('')

    await new Promise((resolver) => setTimeout(resolver, 600))
    expect(formulario.getByText(clienteBuscable.nombre)).toBeInTheDocument()
    expect(formulario.getByRole('button', { name: /cambiar/i })).toBeInTheDocument()
  })

  it('con dos caracteres muestra los candidatos', async () => {
    simularApi()
    montar()
    const formulario = await abrirAlta()

    await elegirCliente(formulario)
  })

  it('elegir un cliente muestra su ficha y rellena la entrega', async () => {
    simularApi()
    montar()
    const formulario = await abrirAlta()

    await elegirCliente(formulario)

    // La tarjeta resume lo que el repartidor necesita para llegar: nombre,
    // documento, teléfono y dirección.
    const tarjeta = formulario.getByText(clienteBuscable.nombre).closest('div') as HTMLElement
    expect(tarjeta).toHaveTextContent('70099887')
    expect(tarjeta).toHaveTextContent('900101010')
    // La dirección del cliente es el punto de partida, no un dato fijo: el
    // repartidor puede entregar en otro sitio si el cliente lo pide.
    expect(formulario.getByLabelText(/^dirección de entrega/i)).toHaveValue(
      'Jr. Dos de Mayo 33',
    )
    expect(formulario.getByLabelText(/^referencia\s*\*?$/i)).toHaveValue('Frente al parque')
  })

  it('cambiar de cliente libera el formulario', async () => {
    simularApi()
    montar()
    const formulario = await abrirAlta()

    await elegirCliente(formulario)
    await userEvent.click(formulario.getByRole('button', { name: /cambiar/i }))

    expect(formulario.getByLabelText('Buscar cliente')).toHaveValue('')
  })

  it('dice cuando no encuentra a nadie', async () => {
    simularApi({ candidatos: [] })
    montar()
    const formulario = await abrirAlta()

    await userEvent.type(formulario.getByLabelText('Buscar cliente'), 'Zzz')
    expect(
      await formulario.findByText('No se encontraron clientes.', undefined, { timeout: 2000 }),
    ).toBeInTheDocument()
  })
})

// --- Líneas de producto ----------------------------------------------------

describe('líneas del pedido', () => {
  it('avisa cuando no hay ningún producto agregado', async () => {
    simularApi()
    montar()
    const formulario = await abrirAlta()

    expect(
      formulario.getByText(/agregue al menos un producto/i),
    ).toBeInTheDocument()
  })

  it('agregar un producto lo incorpora con cantidad uno', async () => {
    simularApi()
    montar()
    const formulario = await abrirAlta()

    await agregarProducto(formulario, 'Bidón 20 L')

    expect(formulario.getByLabelText('Cantidad de Bidón 20 L')).toHaveValue(1)
    expect(formulario.queryByText(/agregue al menos un producto/i)).not.toBeInTheDocument()
  })

  it('volver a agregar el mismo producto suma a la línea existente', async () => {
    simularApi()
    montar()
    const formulario = await abrirAlta()

    await agregarProducto(formulario, 'Bidón 20 L', { veces: 2 })

    // Una sola fila, no dos: son dos bidones del mismo producto.
    expect(formulario.getByLabelText('Cantidad de Bidón 20 L')).toHaveValue(2)
    expect(formulario.queryByLabelText('Cantidad de Agua 625 ml')).not.toBeInTheDocument()
  })

  it('los botones de cantidad ajustan la línea', async () => {
    simularApi()
    montar()
    const formulario = await abrirAlta()

    await agregarProducto(formulario, 'Bidón 20 L')
    const cantidad = formulario.getByLabelText('Cantidad de Bidón 20 L')

    await userEvent.click(formulario.getByRole('button', { name: 'Agregar uno' }))
    expect(cantidad).toHaveValue(2)

    await userEvent.click(formulario.getByRole('button', { name: 'Quitar uno' }))
    expect(cantidad).toHaveValue(1)
  })

  it('vaciar la cantidad quita la línea', async () => {
    // El backend rechaza un detalle con cantidad 0. Un campo vacío se
    // convierte en 0 al leerlo, así que la línea desaparece en lugar de
    // dejar un detalle que el servidor va a rechazar.
    simularApi()
    montar()
    const formulario = await abrirAlta()

    await agregarProducto(formulario, 'Bidón 20 L')
    await userEvent.clear(formulario.getByLabelText('Cantidad de Bidón 20 L'))

    expect(formulario.queryByLabelText('Cantidad de Bidón 20 L')).not.toBeInTheDocument()
    expect(formulario.getByText(/agregue al menos un producto/i)).toBeInTheDocument()
  })

  it('avisa cuando la cantidad supera el stock disponible', async () => {
    simularApi()
    montar()
    const formulario = await abrirAlta()

    await agregarProducto(formulario, 'Bidón 10 L') // stock 2
    for (let i = 0; i < 4; i += 1) {
      await userEvent.click(formulario.getByRole('button', { name: 'Agregar uno' }))
    }

    expect(formulario.getByLabelText('Cantidad de Bidón 10 L')).toHaveValue(5)
    expect(formulario.getByText(/stock actual: 2/i)).toBeInTheDocument()
  })

  it('superar el stock no bloquea el registro', async () => {
    // Se permite a propósito: el pedido puede haberse tomado antes de que el
    // inventario se actualizara, y bloquear aquí dejaría al vendedor sin
    // salida. El backend es quien puede negarse.
    const { peticiones } = simularApi()
    montar()
    const formulario = await abrirAlta()

    await elegirCliente(formulario)
    await agregarProducto(formulario, 'Bidón 10 L')
    for (let i = 0; i < 4; i += 1) {
      await userEvent.click(formulario.getByRole('button', { name: 'Agregar uno' }))
    }
    await userEvent.click(formulario.getByRole('button', { name: /registrar pedido/i }))

    await waitFor(() => {
      expect(peticiones.some((p) => p.metodo === 'POST')).toBe(true)
    })
  })
})

// --- Estimación del importe ------------------------------------------------

describe('importes mostrados mientras se compone el pedido', () => {
  it('el subtotal sale del catálogo y la cantidad de cada línea', async () => {
    simularApi()
    montar()
    const formulario = await abrirAlta()

    await agregarProducto(formulario, 'Bidón 20 L', { veces: 2 })
    await agregarProducto(formulario, 'Agua 625 ml')

    // 2 × 15 + 1 × 2.50
    const subtotal = formulario.getByText(/subtotal estimado/i).querySelector('span')
    expect(subtotal).toHaveTextContent('32.50')
  })

  it('el descuento se resta del total estimado', async () => {
    simularApi()
    montar()
    const formulario = await abrirAlta()

    await agregarProducto(formulario, 'Bidón 20 L', { veces: 2 })
    await userEvent.type(formulario.getByLabelText(/^descuento/i), '5')

    // 2 × 15 − 5
    // Anclado: sin `^$`, "Total estimado" también encuentra "Subtotal estimado".
    const total = formulario.getByText(/^total estimado$/i).nextElementSibling
    expect(total).toHaveTextContent('25.00')
  })

  it('un descuento mayor que el subtotal deja el total en cero, no en negativo', async () => {
    // Un total negativo se leería como un saldo a favor del cliente, que es
    // otra cosa distinta. El backend sigue siendo quien valida el descuento.
    simularApi()
    montar()
    const formulario = await abrirAlta()

    await agregarProducto(formulario, 'Bidón 20 L')
    await userEvent.type(formulario.getByLabelText(/^descuento/i), '999')

    const total = formulario.getByText(/^total estimado$/i).nextElementSibling
    expect(total).toHaveTextContent('0.00')
  })

  it('aclara que el importe definitivo lo calcula el servidor', async () => {
    // La estimación nunca se envía: es una ayuda para el vendedor, no un dato.
    simularApi()
    montar()
    const formulario = await abrirAlta()

    expect(formulario.getByText(/el importe definitivo lo calcula el servidor/i)).toBeInTheDocument()
  })
})

// --- Datos de entrega ------------------------------------------------------

describe('datos de entrega', () => {
  it('a domicilio pide la dirección y la referencia', async () => {
    simularApi()
    montar()
    const formulario = await abrirAlta()

    expect(formulario.getByLabelText(/^dirección de entrega/i)).toBeRequired()
    expect(formulario.getByLabelText(/^referencia\s*\*?$/i)).toBeInTheDocument()
  })

  it('en retiro no pide dirección: no hay a dónde deliver', async () => {
    simularApi()
    montar()
    const formulario = await abrirAlta()

    await userEvent.selectOptions(
      formulario.getByLabelText(/modalidad de entrega/i),
      'RECOJO',
    )

    expect(formulario.queryByLabelText(/^dirección de entrega/i)).not.toBeInTheDocument()
  })
})

// --- Envío del pedido ------------------------------------------------------

describe('registro del pedido', () => {
  it('envía cliente, productos y entrega al backend', async () => {
    const { peticiones } = simularApi()
    montar()
    const formulario = await abrirAlta()

    await elegirCliente(formulario)
    await agregarProducto(formulario, 'Bidón 20 L', { veces: 2 })
    // El cliente elegido ya traía su referencia: se reemplaza en lugar de
    // añadirse al texto existente.
    const referencia = formulario.getByLabelText(/^referencia\s*\*?$/i)
    await userEvent.clear(referencia)
    await userEvent.type(referencia, 'Portón azul')
    await userEvent.click(formulario.getByRole('button', { name: /registrar pedido/i }))

    await waitFor(() => {
      const envio = peticiones.find((p) => p.metodo === 'POST')
      expect(envio).toBeDefined()
      expect(envio?.cuerpo).toMatchObject({
        clienteId: 7,
        modalidadEntrega: 'DOMICILIO',
        direccionEntrega: 'Jr. Dos de Mayo 33',
        referenciaEntrega: 'Portón azul',
        detalles: [{ productoId: 1, cantidad: 2 }],
      })
    })
  })

  it('no envía el importe estimado: el total lo recalcula el servidor', async () => {
    // Si la pantalla enviara su estimación, un cambio de precio en el catálogo
    // se convertiría en un cobro incorrecto.
    const { peticiones } = simularApi()
    montar()
    const formulario = await abrirAlta()

    await elegirCliente(formulario)
    await agregarProducto(formulario, 'Bidón 20 L', { veces: 2 })
    await userEvent.click(formulario.getByRole('button', { name: /registrar pedido/i }))

    await waitFor(() => {
      const envio = peticiones.find((p) => p.metodo === 'POST')
      expect(envio).toBeDefined()
      expect(envio?.cuerpo).not.toHaveProperty('total')
      expect(envio?.cuerpo).not.toHaveProperty('subtotal')
    })
  })

  it('los campos opcionales vacíos viajan como null, no como texto vacío', async () => {
    const { peticiones } = simularApi()
    montar()
    const formulario = await abrirAlta()

    await elegirCliente(formulario)
    await agregarProducto(formulario, 'Bidón 20 L')
    await userEvent.click(formulario.getByRole('button', { name: /registrar pedido/i }))

    await waitFor(() => {
      const envio = peticiones.find((p) => p.metodo === 'POST')
      expect(envio?.cuerpo).toMatchObject({
        observaciones: null,
        incidencias: null,
        fechaEntregaProgramada: null,
      })
    })
  })

  it('confirma en el mismo paso si se marca la casilla', async () => {
    // Confirmar de entrada reduce el tiempo de proceso, que es uno de los
    // indicadores del sistema.
    const { peticiones } = simularApi()
    montar()
    const formulario = await abrirAlta()

    await elegirCliente(formulario)
    await agregarProducto(formulario, 'Bidón 20 L')
    await userEvent.click(formulario.getByLabelText(/^confirmar el pedido ahora/i))
    await userEvent.click(formulario.getByRole('button', { name: /registrar pedido/i }))

    await waitFor(() => {
      const envio = peticiones.find((p) => p.metodo === 'POST')
      expect(envio?.cuerpo).toMatchObject({ confirmar: true })
    })
  })

  it('la incidencia se registra tal como la reportó el cliente', async () => {
    const { peticiones } = simularApi()
    montar()
    const formulario = await abrirAlta()

    await elegirCliente(formulario)
    await agregarProducto(formulario, 'Bidón 20 L')
    await userEvent.type(
      formulario.getByLabelText(/^detalle la incidencia/i),
      'El cliente pidió cinco pero recibió uno',
    )
    await userEvent.click(formulario.getByRole('button', { name: /registrar pedido/i }))

    await waitFor(() => {
      const envio = peticiones.find((p) => p.metodo === 'POST')
      expect(envio?.cuerpo).toMatchObject({
        incidencias: 'El cliente pidió cinco pero recibió uno',
      })
    })
  })

  it('la incidencia no marca el pedido por sí sola: eso es una decisión del vendedor', async () => {
    // Son dos datos distintos: la incidencia alimenta el indicador de errores
    // de registro, mientras que la marca de "requiere corrección" decide si el
    // pedido entra al proceso. Marcarse solo convertiría cualquier nota en un
    // pedido detenido, y el vendedor perdería el control de la cola.
    const { peticiones } = simularApi()
    montar()
    const formulario = await abrirAlta()

    await elegirCliente(formulario)
    await agregarProducto(formulario, 'Bidón 20 L')
    await userEvent.type(
      formulario.getByLabelText(/^detalle la incidencia/i),
      'Domicilio incompleto',
    )
    await userEvent.click(formulario.getByRole('button', { name: /registrar pedido/i }))

    await waitFor(() => {
      const envio = peticiones.find((p) => p.metodo === 'POST')
      expect(envio?.cuerpo).toMatchObject({ requiereCorreccion: false })
    })
  })

  it('la marca de requiere corrección se envía al backend', async () => {
    const { peticiones } = simularApi()
    montar()
    const formulario = await abrirAlta()

    await elegirCliente(formulario)
    await agregarProducto(formulario, 'Bidón 20 L')
    await userEvent.click(formulario.getByLabelText(/^este pedido requiere corrección/i))
    await userEvent.click(formulario.getByRole('button', { name: /registrar pedido/i }))

    await waitFor(() => {
      const envio = peticiones.find((p) => p.metodo === 'POST')
      expect(envio?.cuerpo).toMatchObject({ requiereCorreccion: true })
    })
  })

  it('muestra el código del pedido creado', async () => {
    // El código es lo que se comunica al cliente y al repartidor.
    simularApi()
    montar()
    const formulario = await abrirAlta()

    await elegirCliente(formulario)
    await agregarProducto(formulario, 'Bidón 20 L')
    await userEvent.click(formulario.getByRole('button', { name: /registrar pedido/i }))

    expect(
      await screen.findByText(/PED-0002 registrado correctamente/i),
    ).toBeInTheDocument()
  })

  it('un error del backend se sitúa en el campo que lo produjo', async () => {
    simularApi({
      crear: () =>
        new Response(
          JSON.stringify({
            exito: false,
            mensaje: 'Datos inválidos',
            detalles: [{ campo: 'direccionEntrega', mensaje: 'La dirección es obligatoria' }],
          }),
          { status: 422, headers: { 'Content-Type': 'application/json' } },
        ),
    })
    montar()
    const formulario = await abrirAlta()

    await elegirCliente(formulario)
    await agregarProducto(formulario, 'Bidón 20 L')
    await userEvent.click(formulario.getByRole('button', { name: /registrar pedido/i }))

    expect(await formulario.findByText('La dirección es obligatoria')).toBeInTheDocument()
    // El formulario sigue abierto con lo escrito: no se pierde el trabajo.
    expect(formulario.getByLabelText('Buscar producto')).toBeInTheDocument()
  })

  it('un error sin campo asociado se muestra como aviso general', async () => {
    simularApi({
      crear: () =>
        new Response(
          JSON.stringify({
            exito: false,
            mensaje: 'El cliente tiene el límite de crédito agotado',
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } },
        ),
    })
    montar()
    const formulario = await abrirAlta()

    await elegirCliente(formulario)
    await agregarProducto(formulario, 'Bidón 20 L')
    await userEvent.click(formulario.getByRole('button', { name: /registrar pedido/i }))

    expect(await formulario.findByRole('alert')).toHaveTextContent(/límite de crédito/i)
  })
})

// --- Cambios de estado -----------------------------------------------------

describe('cambio de estado', () => {
  const botonEnFila = async (nombre: RegExp) => {
    const fila = (await screen.findByText('PED-0001')).closest('tr') as HTMLElement
    return within(fila).getByRole('button', { name: nombre })
  }

  it('confirma un pedido pendiente', async () => {
    const { peticiones } = simularApi({ pedidos: [pedidoBase({ estado: 'PENDIENTE' })] })
    montar()

    await userEvent.click(await botonEnFila(/confirmar/i))
    const dialogo = within(screen.getByRole('dialog', { name: /cambiar estado a CONFIRMADO/i }))
    await userEvent.click(dialogo.getByRole('button', { name: /confirmar cambio/i }))

    await waitFor(() => {
      const cambio = peticiones.find((p) => p.url.includes('/estado'))
      expect(cambio?.cuerpo).toMatchObject({ estado: 'CONFIRMADO' })
    })
  })

  it('un pedido cancelado se reabre, y el botón lo dice', async () => {
    // La transición de CANCELADO va a PENDIENTE. Antes este botón decía
    // "Entregar", que es justo lo contrario de lo que hace: quien reabría un
    // pedido mal cancelado leía "Entregar" y creía que lo estaba entregando.
    const { peticiones } = simularApi({ pedidos: [pedidoBase({ estado: 'CANCELADO' })] })
    montar()

    await userEvent.click(await botonEnFila(/reactivar/i))
    const dialogo = within(screen.getByRole('dialog', { name: /cambiar estado a PENDIENTE/i }))
    await userEvent.click(dialogo.getByRole('button', { name: /confirmar cambio/i }))

    await waitFor(() => {
      const cambio = peticiones.find((p) => p.url.includes('/estado'))
      expect(cambio?.cuerpo).toMatchObject({ estado: 'PENDIENTE' })
    })
  })

  it('un pedido en ruta ofrece "Entregar" solo donde corresponde', async () => {
    // La hora de entrega la registra el repartidor, pero desde la lista el
    // botón existe y lleva el estado al que lleva.
    simularApi({ pedidos: [pedidoBase({ estado: 'EN_RUTA' })] })
    montar()

    const fila = (await screen.findByText('PED-0001')).closest('tr') as HTMLElement
    expect(within(fila).getByRole('button', { name: /entregar/i })).toBeInTheDocument()
  })

  it('explica que el cambio queda en el historial antes de aplicarlo', async () => {
    // El historial alimenta la medición de tiempos del proceso: un cambio sin
    // registro rompería un indicador, no solo un dato.
    simularApi({ pedidos: [pedidoBase({ estado: 'PENDIENTE' })] })
    montar()

    await userEvent.click(await botonEnFila(/confirmar/i))
    expect(
      screen.getByText(/se registrará la hora de este cambio en el historial/i),
    ).toBeInTheDocument()
  })

  it('cancelar exige un motivo', async () => {
    const { peticiones } = simularApi({ pedidos: [pedidoBase({ estado: 'PENDIENTE' })] })
    montar()

    await userEvent.click(await botonEnFila(/cancelar/i))
    const dialogo = within(screen.getByRole('dialog', { name: /cancelar pedido PED-0001/i }))
    const motivo = dialogo.getByLabelText(/^motivo de la cancelación/i)
    expect(motivo).toBeRequired()

    await userEvent.type(motivo, 'El cliente ya lo recibió por otro canal')
    await userEvent.click(dialogo.getByRole('button', { name: /cancelar pedido/i }))

    await waitFor(() => {
      const cambio = peticiones.find((p) => p.url.includes('/estado'))
      expect(cambio?.cuerpo).toMatchObject({
        estado: 'CANCELADO',
        motivo: 'El cliente ya lo recibió por otro canal',
      })
    })
  })

  it('cancelar explica que el motivo queda en la bitácora', async () => {
    simularApi({ pedidos: [pedidoBase({ estado: 'PENDIENTE' })] })
    montar()

    await userEvent.click(await botonEnFila(/cancelar/i))
    expect(
      screen.getByText(/queda en el historial del pedido y en la bitácora/i),
    ).toBeInTheDocument()
  })

  it('volver no cambia nada', async () => {
    const { peticiones } = simularApi({ pedidos: [pedidoBase({ estado: 'PENDIENTE' })] })
    montar()

    await userEvent.click(await botonEnFila(/confirmar/i))
    const dialogo = within(screen.getByRole('dialog', { name: /cambiar estado/i }))
    await userEvent.click(dialogo.getByRole('button', { name: /volver/i }))

    expect(peticiones.some((p) => p.url.includes('/estado'))).toBe(false)
  })

  it('un cambio rechazado se informa sin perder el listado', async () => {
    const { peticiones } = simularApi({
      pedidos: [pedidoBase({ estado: 'PENDIENTE' })],
      cambiarEstado: () =>
        new Response(
          JSON.stringify({ exito: false, mensaje: 'El pedido ya fue entregado' }),
          { status: 409, headers: { 'Content-Type': 'application/json' } },
        ),
    })
    montar()

    await userEvent.click(await botonEnFila(/confirmar/i))
    const dialogo = within(screen.getByRole('dialog', { name: /cambiar estado/i }))
    await userEvent.click(dialogo.getByRole('button', { name: /confirmar cambio/i }))

    expect(await screen.findByText(/el pedido ya fue entregado/i)).toBeInTheDocument()
    expect(screen.getByText('PED-0001')).toBeInTheDocument()
    expect(peticiones.filter((p) => p.url.includes('/estado'))).toHaveLength(1)
  })
})

// --- Ficha del pedido ------------------------------------------------------

describe('ficha del pedido', () => {
  it('muestra el desglose con subtotal y total', async () => {
    simularApi({ pedidos: [pedidoBase()] })
    montar()

    await userEvent.click(await screen.findByRole('button', { name: /^ver$/i }))
    const ficha = within(await screen.findByRole('dialog', { name: /pedido PED-0001/i }))

    expect(ficha.getByText('Bidón 20 L')).toBeInTheDocument()
    expect(ficha.getByText(/subtotal:/i).nextElementSibling).toHaveTextContent('30.00')
  })

  it('enseña el historial de estados', async () => {
    simularApi({ pedidos: [pedidoBase()] })
    montar()

    await userEvent.click(await screen.findByRole('button', { name: /^ver$/i }))
    const ficha = within(await screen.findByRole('dialog', { name: /pedido PED-0001/i }))

    expect(ficha.getByText('Pedido registrado')).toBeInTheDocument()
    expect(ficha.getByText(/ana quispe · vendedor/i)).toBeInTheDocument()
  })

  it('un pedido sin historial lo dice, en lugar de mostrar un hueco', async () => {
    simularApi({ pedidos: [pedidoBase()], detalle: () => envoltura(detalle({ historial: [] })) })
    montar()

    await userEvent.click(await screen.findByRole('button', { name: /^ver$/i }))
    const ficha = within(await screen.findByRole('dialog', { name: /pedido PED-0001/i }))

    expect(ficha.getByText(/sin cambios de estado registrados/i)).toBeInTheDocument()
  })

  it('muestra la venta asociada y su saldo', async () => {
    simularApi({
      pedidos: [pedidoBase()],
      detalle: () =>
        envoltura(
          detalle({
            venta: {
              id: 9,
              numero: 'V-0009',
              total: 30,
              totalPagado: 10,
              saldo: 20,
              estado: 'PENDIENTE',
              pagos: [
                {
                  id: 1,
                  monto: 10,
                  metodo: 'YAPE',
                  referencia: 'OP-9911',
                  fecha: '2026-09-28T11:00:00.000Z',
                  estado: 'CONFIRMADO',
                },
              ],
            },
          }),
        ),
    })
    montar()

    await userEvent.click(await screen.findByRole('button', { name: /^ver$/i }))
    const ficha = within(await screen.findByRole('dialog', { name: /pedido PED-0001/i }))

    expect(ficha.getByText(/venta V-0009/i)).toBeInTheDocument()
    // El saldo es lo que el vendedor necesita ver para saber si hay que
    // cobrar antes de entregar.
    expect(ficha.getByText(/saldo/i)).toHaveTextContent(/20[.,]00/)
    expect(ficha.getByText(/YAPE/)).toBeInTheDocument()
  })

  it('si la ficha no se puede cargar, avisa y cierra el diálogo', async () => {
    // Un diálogo en blanco no dice nada; un aviso explica qué pasó.
    simularApi({
      pedidos: [pedidoBase()],
      detalle: () =>
        new Response(JSON.stringify({ exito: false, mensaje: 'No se pudo abrir el pedido' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
    })
    montar()

    await userEvent.click(await screen.findByRole('button', { name: /^ver$/i }))

    expect(await screen.findByText(/no se pudo abrir el pedido/i)).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /pedido PED-0001/i })).not.toBeInTheDocument(),
    )
  })
})

/** Envoltura mínima para construir respuestas a medida. */
const envoltura = (datos: unknown) =>
  new Response(JSON.stringify({ exito: true, mensaje: 'ok', datos }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
