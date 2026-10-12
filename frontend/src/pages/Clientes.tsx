import { useEffect, useState } from 'react'
import { BarraListado, Listado } from '@/components/Listado'
import { useListado } from '@/hooks/useListado'
import {
  AreaTexto,
  Aviso,
  Boton,
  Celda,
  Confirmacion,
  Entrada,
  Etiqueta,
  Modal,
  Pagina,
  Seleccion,
} from '@/components/ui'
import { useAutenticacion } from '@/context/autenticacion'
import { useFormulario } from '@/hooks'
import { clientes } from '@/services/api'
import type { DatosCliente } from '@/services/api'
import type { Cliente, TipoCliente } from '@/types/dominio'

const TIPOS: { valor: TipoCliente; texto: string }[] = [
  { valor: 'PERSONA', texto: 'Persona natural' },
  { valor: 'EMPRESA', texto: 'Empresa' },
  { valor: 'INSTITUCION', texto: 'Institución' },
]

/** Campos vacíos de un alta. El tipo arranca en PERSONA, el caso más común. */
const clienteVacio: DatosCliente = {
  tipo: 'PERSONA',
  documento: '',
  nombres: '',
  razonSocial: '',
  telefono: '',
  telefonoAlt: '',
  email: '',
  direccion: '',
  referencia: '',
  distrito: '',
  limiteCredito: 0,
  notas: '',
  activo: true,
}

export const PaginaClientes = () => {
  const { tieneRol } = useAutenticacion()
  const puedeEditar = tieneRol('ADMINISTRADOR', 'VENDEDOR')

  const [tipo, setTipo] = useState<'todos' | TipoCliente>('todos')
  const [estado, setEstado] = useState<'todos' | 'true' | 'false'>('todos')
  const [distrito, setDistrito] = useState('')

  const [distritos, setDistritos] = useState<string[]>([])
  const [editando, setEditando] = useState<Cliente | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [porEliminar, setPorEliminar] = useState<Cliente | null>(null)
  const [procesando, setProcesando] = useState(false)
  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; mensaje: string } | null>(null)

  const tabla = useListado<Cliente>('/clientes', { tipo, activo: estado, distrito: distrito || undefined })

  // Los distritos son un catálogo corto y estable: se piden una vez y se usan
  // como opciones del filtro. Pedirlos en cada pulsación sería innecesario.
  useEffect(() => {
    let vigente = true
    clientes
      .distritos()
      .then((lista) => {
        if (vigente) setDistritos(lista)
      })
      .catch(() => {
        // El filtro por distrito simplemente quedará vacío; el resto de la
        // pantalla sigue funcionando.
      })
    return () => {
      vigente = false
    }
  }, [])

  const formulario = useFormulario<DatosCliente>(clienteVacio)

  const abrirNuevo = () => {
    setEditando(null)
    setAbierto(true)
  }

  const abrirEdicion = (cliente: Cliente) => {
    setEditando(cliente)
    setAbierto(true)
  }

  const guardar = () => {
    void formulario.enviar(async () => {
      const datos = formulario.valores
      if (editando) {
        await clientes.actualizar(editando.id, datos)
        setAviso({ tipo: 'exito', mensaje: `Cliente ${datos.documento} actualizado.` })
      } else {
        await clientes.crear(datos)
        setAviso({ tipo: 'exito', mensaje: `Cliente ${datos.documento} registrado.` })
      }
      setAbierto(false)
      setEditando(null)
      tabla.recargar()
    })
  }

  const cambiarEstado = () => {
    if (!porEliminar) return
    setProcesando(true)
    const objetivo = porEliminar
    void clientes
      .cambiarEstado(objetivo.id, !objetivo.activo)
      .then(() => {
        setAviso({
          tipo: 'exito',
          mensaje: `Cliente ${objetivo.documento} ${objetivo.activo ? 'desactivado' : 'activado'}.`,
        })
        tabla.recargar()
      })
      .catch((fallo: unknown) => {
        setAviso({
          tipo: 'error',
          mensaje: fallo instanceof Error ? fallo.message : 'No se pudo cambiar el estado.',
        })
      })
      .finally(() => {
        setProcesando(false)
        setPorEliminar(null)
      })
  }

  // El formulario se rellena al abrir el modal, no antes: inicializarlo en
  // cada render lo borraría mientras el usuario escribe.
  useEffect(() => {
    if (!abierto) return
    if (editando) {
      formulario.reiniciar({
        tipo: editando.tipo,
        documento: editando.documento,
        nombres: editando.nombres ?? '',
        razonSocial: editando.razonSocial ?? '',
        telefono: editando.telefono,
        telefonoAlt: editando.telefonoAlt ?? '',
        email: editando.email ?? '',
        direccion: editando.direccion,
        referencia: editando.referencia ?? '',
        distrito: editando.distrito ?? '',
        limiteCredito: editando.limiteCredito,
        notas: editando.notas ?? '',
        activo: editando.activo,
      })
    } else {
      formulario.reiniciar(clienteVacio)
    }
    // Solo al cambiar de cliente en edición o de apertura del modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, editando])

  const esPersona = formulario.valores.tipo === 'PERSONA'
  // El backend exige RUC de 11 dígitos para empresas; avisarlo antes de
  // enviar evita un 422 por una regla que el usuario no puede ver.
  const rucInvalido =
    formulario.valores.tipo === 'EMPRESA' && formulario.valores.documento.length > 0
      ? formulario.valores.documento.length !== 11
      : false

  return (
    <Pagina
      titulo="Clientes"
      descripcion="Registro de personas, empresas e instituciones que compran agua."
      acciones={
        puedeEditar && (
          <Boton onClick={abrirNuevo}>
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            Nuevo cliente
          </Boton>
        )
      }
    >
      {aviso && <Aviso tipo={aviso.tipo} mensaje={aviso.mensaje} alCerrar={() => setAviso(null)} />}

      <Listado<Cliente>
        {...tabla}
        claveFila={(cliente) => cliente.id}
        barra={
          <BarraListado
            busqueda={tabla.consulta.busqueda}
            alBuscar={tabla.buscar}
            marcador="Buscar por nombre, documento o teléfono…"
            alRecargar={tabla.recargar}
          >
            <Seleccion
              etiqueta=""
              aria-label="Filtrar por tipo"
              value={tipo}
              onChange={(evento) => setTipo(evento.target.value as typeof tipo)}
              opciones={TIPOS}
              marcador="Todos los tipos"
              className="w-full sm:w-48"
            />
            <Seleccion
              etiqueta=""
              aria-label="Filtrar por estado"
              value={estado}
              onChange={(evento) => setEstado(evento.target.value as typeof estado)}
              opciones={[
                { valor: 'todos', texto: 'Activos e inactivos' },
                { valor: 'true', texto: 'Solo activos' },
                { valor: 'false', texto: 'Solo inactivos' },
              ]}
              className="w-full sm:w-44"
            />
            {distritos.length > 0 && (
              <Seleccion
                etiqueta=""
                aria-label="Filtrar por distrito"
                value={distrito}
                onChange={(evento) => setDistrito(evento.target.value)}
                opciones={distritos.map((valor) => ({ valor, texto: valor }))}
                marcador="Todos los distritos"
                className="w-full sm:w-48"
              />
            )}
          </BarraListado>
        }
        columnas={[
          { clave: 'documento', encabezado: 'Documento' },
          { clave: 'nombre', encabezado: 'Cliente' },
          { clave: 'contacto', encabezado: 'Contacto' },
          { clave: 'distrito', encabezado: 'Distrito' },
          { clave: 'pedidos', encabezado: 'Pedidos', clase: 'text-right' },
          { clave: 'estado', encabezado: 'Estado' },
          ...(puedeEditar
            ? [
                {
                  clave: 'acciones',
                  encabezado: 'Acciones',
                  clase: 'text-right',
                },
              ]
            : []),
        ]}
        vacio={{
          titulo: 'No hay clientes que coincidan',
          descripcion: puedeEditar
            ? 'Ajuste los filtros o registre un cliente nuevo.'
            : 'Ajuste los filtros para ver otros resultados.',
          accion: puedeEditar && <Boton onClick={abrirNuevo}>Registrar cliente</Boton>,
        }}
        renderFila={(cliente) => (
          <>
            <Celda className="font-medium text-slate-900">{cliente.documento}</Celda>
            <Celda>
              <span className="block max-w-[16rem] truncate" title={cliente.nombre}>
                {cliente.nombre}
              </span>
              <span className="text-xs text-slate-500">
                {cliente.tipo === 'PERSONA' ? 'Persona natural' : cliente.tipo === 'EMPRESA' ? 'Empresa' : 'Institución'}
              </span>
            </Celda>
            <Celda>
              <span className="block">{cliente.telefono}</span>
              {cliente.email && (
                <span className="block max-w-[14rem] truncate text-xs text-slate-500" title={cliente.email}>
                  {cliente.email}
                </span>
              )}
            </Celda>
            <Celda>{cliente.distrito ?? '—'}</Celda>
            <Celda numerica>{cliente.totalPedidos ?? 0}</Celda>
            <Celda>
              <Etiqueta tono={cliente.activo ? 'exito' : 'neutro'}>
                {cliente.activo ? 'Activo' : 'Inactivo'}
              </Etiqueta>
            </Celda>
            {puedeEditar && (
              <Celda className="text-right">
                <div className="flex justify-end gap-1">
                  <Boton variante="fantasma" tamano="sm" onClick={() => abrirEdicion(cliente)}>
                    Editar
                  </Boton>
                  <Boton
                    variante="fantasma"
                    tamano="sm"
                    onClick={() => setPorEliminar(cliente)}
                    className={cliente.activo ? 'text-rose-600' : 'text-emerald-700'}
                  >
                    {cliente.activo ? 'Desactivar' : 'Activar'}
                  </Boton>
                </div>
              </Celda>
            )}
          </>
        )}
      />

      <Modal
        abierto={abierto}
        titulo={editando ? `Editar cliente ${editando.documento}` : 'Nuevo cliente'}
        descripcion={
          editando
            ? 'Los cambios se aplican de inmediato. Los pedidos ya registrados conservan sus datos.'
            : 'Los datos marcados con * son obligatorios.'
        }
        ancho="lg"
        alCerrar={() => setAbierto(false)}
        pie={
          <>
            <Boton variante="secundario" onClick={() => setAbierto(false)} disabled={formulario.enviando}>
              Cancelar
            </Boton>
            <Boton onClick={guardar} cargando={formulario.enviando}>
              {editando ? 'Guardar cambios' : 'Registrar cliente'}
            </Boton>
          </>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(evento) => {
            evento.preventDefault()
            guardar()
          }}
          noValidate
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Seleccion
              etiqueta="Tipo de cliente"
              requerido
              value={formulario.valores.tipo}
              error={formulario.errores.tipo}
              onChange={(evento) =>
                formulario.cambiar('tipo', evento.target.value as TipoCliente)
              }
              opciones={TIPOS}
            />
            <Entrada
              etiqueta={formulario.valores.tipo === 'EMPRESA' ? 'RUC' : 'Documento'}
              requerido
              inputMode="numeric"
              autoComplete="off"
              ayuda={
                formulario.valores.tipo === 'EMPRESA'
                  ? '11 dígitos. Es el número de RUC de la empresa.'
                  : 'DNI, CE o documento con el que se registra la compra.'
              }
              value={formulario.valores.documento}
              error={rucInvalido ? 'El RUC debe tener 11 dígitos' : formulario.errores.documento}
              onChange={(evento) => formulario.cambiar('documento', evento.target.value.trim())}
            />
          </div>

          {/* El backend rechaza nombres sin razón social y al revés según el
              tipo. Ocultar el campo imposible deja claro cuál corresponde. */}
          {esPersona ? (
            <Entrada
              etiqueta="Nombres y apellidos"
              requerido
              autoComplete="name"
              value={formulario.valores.nombres ?? ''}
              error={formulario.errores.nombres}
              onChange={(evento) => formulario.cambiar('nombres', evento.target.value)}
            />
          ) : (
            <Entrada
              etiqueta="Razón social"
              requerido
              autoComplete="organization"
              value={formulario.valores.razonSocial ?? ''}
              error={formulario.errores.razonSocial}
              onChange={(evento) => formulario.cambiar('razonSocial', evento.target.value)}
            />
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Entrada
              etiqueta="Teléfono"
              requerido
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="987654321"
              value={formulario.valores.telefono}
              error={formulario.errores.telefono}
              onChange={(evento) => formulario.cambiar('telefono', evento.target.value)}
            />
            <Entrada
              etiqueta="Teléfono alterno"
              type="tel"
              autoComplete="tel"
              value={formulario.valores.telefonoAlt ?? ''}
              error={formulario.errores.telefonoAlt}
              onChange={(evento) => formulario.cambiar('telefonoAlt', evento.target.value)}
            />
            <Entrada
              etiqueta="Correo electrónico"
              type="email"
              autoComplete="email"
              value={formulario.valores.email ?? ''}
              error={formulario.errores.email}
              onChange={(evento) => formulario.cambiar('email', evento.target.value)}
            />
            <Entrada
              etiqueta="Distrito"
              list="distritos-cliente"
              autoComplete="address-level3"
              value={formulario.valores.distrito ?? ''}
              error={formulario.errores.distrito}
              onChange={(evento) => formulario.cambiar('distrito', evento.target.value)}
            />
            <datalist id="distritos-cliente">
              {distritos.map((valor) => (
                <option key={valor} value={valor} />
              ))}
            </datalist>
          </div>

          <Entrada
            etiqueta="Dirección"
            requerido
            autoComplete="street-address"
            value={formulario.valores.direccion}
            error={formulario.errores.direccion}
            onChange={(evento) => formulario.cambiar('direccion', evento.target.value)}
          />
          <Entrada
            etiqueta="Referencia de la dirección"
            ayuda="Punto de referencia para que el repartidor encuentre el local."
            autoComplete="address-line2"
            value={formulario.valores.referencia ?? ''}
            error={formulario.errores.referencia}
            onChange={(evento) => formulario.cambiar('referencia', evento.target.value)}
          />

          <Entrada
            etiqueta="Límite de crédito (S/)"
            type="number"
            min="0"
            step="0.01"
            ayuda="Máximo que puede comprar sin crédito aprobado."
            value={String(formulario.valores.limiteCredito ?? 0)}
            error={formulario.errores.limiteCredito}
            onChange={(evento) => formulario.cambiar('limiteCredito', Number(evento.target.value))}
          />

          <AreaTexto
            etiqueta="Notas"
            ayuda="Horario de atención, condiciones de pago, cualquier dato útil."
            value={formulario.valores.notas ?? ''}
            error={formulario.errores.notas}
            onChange={(evento) => formulario.cambiar('notas', evento.target.value)}
          />

          {formulario.errores.general && (
            <p role="alert" className="text-sm font-medium text-rose-600">
              {formulario.errores.general}
            </p>
          )}
        </form>
      </Modal>

      <Confirmacion
        abierto={porEliminar !== null}
        titulo={porEliminar?.activo ? 'Desactivar cliente' : 'Activar cliente'}
        mensaje={
          porEliminar?.activo
            ? `El cliente ${porEliminar?.nombre} dejará de aparecer al registrar nuevos pedidos. Su historial se conserva.`
            : `El cliente ${porEliminar?.nombre} podrá volver a recibir pedidos.`
        }
        textoConfirmar={porEliminar?.activo ? 'Desactivar' : 'Activar'}
        procesando={procesando}
        onConfirmar={cambiarEstado}
        onCancelar={() => setPorEliminar(null)}
      />
    </Pagina>
  )
}
