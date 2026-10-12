import { useState } from 'react'
import { BarraListado, Listado } from '@/components/Listado'
import {
  AreaTexto,
  Aviso,
  Boton,
  Celda,
  Entrada,
  Etiqueta,
  Modal,
  Pagina,
  Seleccion,
} from '@/components/ui'
import { useListado } from '@/hooks/useListado'
import { useAutenticacion } from '@/context/autenticacion'
import { useFormulario, usePeticion } from '@/hooks'
import { repartidores } from '@/services/api'
import type { Repartidor } from '@/types/dominio'
import { fechaHora } from '@/utils/formato'

interface RepartidorForm {
  nombres: string
  apellidos: string
  documento: string
  telefono: string
  direccion: string
  zona: string
}

const formularioVacio: RepartidorForm = {
  nombres: '',
  apellidos: '',
  documento: '',
  telefono: '',
  direccion: '',
  zona: '',
}

export const PaginaRepartidores = () => {
  const { tieneRol } = useAutenticacion()
  const esAdmin = tieneRol('ADMINISTRADOR')

  const [activo, setActivo] = useState<'todos' | 'true' | 'false'>('todos')
  const [zona, setZona] = useState('')
  const [incluirEliminados, setIncluirEliminados] = useState(false)

  const [editando, setEditando] = useState<Repartidor | null>(null)
  const [creando, setCreando] = useState(false)
  const [confirmando, setConfirmando] = useState<Repartidor | null>(null)
  const [procesando, setProcesando] = useState(false)
  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; mensaje: string } | null>(null)

  const tabla = useListado<Repartidor>('/entregas/repartidores', {
    activo,
    zona: zona || undefined,
    incluirEliminados: incluirEliminados ? 'true' : undefined,
  })

  const zonas = usePeticion(() => repartidores.zonas(), [])

  const alternarEstado = () => {
    if (!confirmando) return
    setProcesando(true)
    const objetivo = confirmando
    const nuevoEstado = !objetivo.activo
    void repartidores
      .cambiarEstado(objetivo.id, nuevoEstado)
      .then(() => {
        setAviso({
          tipo: 'exito',
          mensaje: `${objetivo.nombre} quedó ${nuevoEstado ? 'activo' : 'inactivo'}.`,
        })
        tabla.recargar()
        zonas.recargar()
      })
      .catch((fallo: unknown) => {
        setAviso({
          tipo: 'error',
          mensaje: fallo instanceof Error ? fallo.message : 'No se pudo cambiar el estado.',
        })
      })
      .finally(() => {
        setProcesando(false)
        setConfirmando(null)
      })
  }

  return (
    <Pagina
      titulo="Repartidores"
      descripcion="Personal de reparto, zonas asignadas y disponibilidad."
      acciones={esAdmin && <Boton onClick={() => setCreando(true)}>Nuevo repartidor</Boton>}
    >
      {aviso && <Aviso tipo={aviso.tipo} mensaje={aviso.mensaje} alCerrar={() => setAviso(null)} />}

      <Listado<Repartidor>
        {...tabla}
        claveFila={(persona) => persona.id}
        barra={
          <BarraListado
            busqueda={tabla.consulta.busqueda}
            alBuscar={tabla.buscar}
            marcador="Buscar por nombre o documento…"
            alRecargar={tabla.recargar}
          >
            <Seleccion
              etiqueta=""
              aria-label="Filtrar por estado"
              value={activo}
              onChange={(evento) => setActivo(evento.target.value as typeof activo)}
              opciones={[
                { valor: 'todos', texto: 'Todos' },
                { valor: 'true', texto: 'Activos' },
                { valor: 'false', texto: 'Inactivos' },
              ]}
              className="w-full sm:w-36"
            />
            <Seleccion
              etiqueta=""
              aria-label="Filtrar por zona"
              value={zona}
              onChange={(evento) => setZona(evento.target.value)}
              opciones={[
                { valor: '', texto: 'Todas las zonas' },
                ...(zonas.datos ?? []).map((valor) => ({ valor, texto: valor })),
              ]}
              className="w-full sm:w-44"
            />
          </BarraListado>
        }
        filtros={
          <div className="border-b border-slate-200 px-3 py-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={incluirEliminados}
                onChange={(evento) => setIncluirEliminados(evento.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-marca-600 focus:ring-marca-500"
              />
              Mostrar también los eliminados
            </label>
          </div>
        }
        columnas={[
          { clave: 'nombre', encabezado: 'Nombre' },
          { clave: 'documento', encabezado: 'Documento' },
          { clave: 'telefono', encabezado: 'Teléfono' },
          { clave: 'zona', encabezado: 'Zona' },
          { clave: 'registro', encabezado: 'Registrado' },
          { clave: 'estado', encabezado: 'Estado' },
          { clave: 'acciones', encabezado: 'Acciones', clase: 'text-right' },
        ]}
        vacio={{
          titulo: 'No hay repartidores que coincidan',
          descripcion: 'Registre al personal de reparto para poder asignarle entregas.',
        }}
        renderFila={(persona) => (
          <>
            <Celda className="font-medium text-slate-900">
              {persona.nombre}
              {persona.eliminadoEn && (
                <span className="block text-xs font-normal text-rose-600">Eliminado</span>
              )}
            </Celda>
            <Celda>{persona.documento}</Celda>
            <Celda>{persona.telefono}</Celda>
            <Celda>{persona.zona ?? '—'}</Celda>
            <Celda>{fechaHora(persona.fechaRegistro)}</Celda>
            <Celda>
              <Etiqueta tono={persona.activo ? 'exito' : 'neutro'}>
                {persona.activo ? 'Activo' : 'Inactivo'}
              </Etiqueta>
            </Celda>
            <Celda className="text-right">
              {esAdmin && !persona.eliminadoEn && (
                <div className="flex justify-end gap-1">
                  <Boton variante="fantasma" tamano="sm" onClick={() => setEditando(persona)}>
                    Editar
                  </Boton>
                  <Boton
                    variante="fantasma"
                    tamano="sm"
                    className={persona.activo ? 'text-amber-700' : 'text-marca-700'}
                    onClick={() => setConfirmando(persona)}
                  >
                    {persona.activo ? 'Desactivar' : 'Activar'}
                  </Boton>
                </div>
              )}
            </Celda>
          </>
        )}
      />

      <ModalFormulario
        abierto={creando || editando !== null}
        repartidor={editando}
        zonasDisponibles={zonas.datos ?? []}
        alCerrar={() => {
          setCreando(false)
          setEditando(null)
        }}
        alGuardar={(nombre) => {
          setCreando(false)
          setEditando(null)
          setAviso({ tipo: 'exito', mensaje: `Datos de ${nombre} guardados.` })
          tabla.recargar()
          zonas.recargar()
        }}
      />

      <Modal
        abierto={confirmando !== null}
        titulo={confirmando?.activo ? 'Desactivar repartidor' : 'Reactivar repartidor'}
        descripcion={
          confirmando?.activo
            ? 'Un repartidor inactivo no puede recibir nuevas entregas; las suyas en curso no se cancelan.'
            : 'Volverá a estar disponible para recibir entregas.'
        }
        ancho="sm"
        alCerrar={() => setConfirmando(null)}
        pie={
          <>
            <Boton variante="secundario" onClick={() => setConfirmando(null)} disabled={procesando}>
              Volver
            </Boton>
            <Boton
              variante={confirmando?.activo ? 'peligro' : 'primario'}
              onClick={alternarEstado}
              cargando={procesando}
            >
              {confirmando?.activo ? 'Desactivar' : 'Reactivar'}
            </Boton>
          </>
        }
      >
        <p className="text-sm text-slate-700">
          {confirmando?.nombres} {confirmando?.apellidos} ({confirmando?.documento})
        </p>
      </Modal>
    </Pagina>
  )
}

const ModalFormulario = ({
  abierto,
  repartidor,
  zonasDisponibles,
  alCerrar,
  alGuardar,
}: {
  abierto: boolean
  repartidor: Repartidor | null
  zonasDisponibles: string[]
  alCerrar: () => void
  alGuardar: (nombre: string) => void
}) => {
  const formulario = useFormulario<RepartidorForm>(formularioVacio)
  const [cargado, setCargado] = useState<number | null>(null)

  // Se rellena al abrir, no en cada render: volver a escribir el formulario en
  // cada pasada borraría lo que el usuario ya completó.
  if (repartidor && cargado !== repartidor.id) {
    setCargado(repartidor.id)
    formulario.reiniciar({
      nombres: repartidor.nombres,
      apellidos: repartidor.apellidos,
      documento: repartidor.documento,
      telefono: repartidor.telefono,
      direccion: repartidor.direccion ?? '',
      zona: repartidor.zona ?? '',
    })
  }

  const guardar = () => {
    void formulario.enviar(async () => {
      const datos = {
        nombres: formulario.valores.nombres.trim(),
        apellidos: formulario.valores.apellidos.trim(),
        documento: formulario.valores.documento.trim().toUpperCase(),
        telefono: formulario.valores.telefono.trim(),
        direccion: formulario.valores.direccion.trim() || null,
        zona: formulario.valores.zona.trim() || null,
      }
      const guardado = repartidor
        ? await repartidores.actualizar(repartidor.id, datos)
        : await repartidores.crear(datos)
      formulario.reiniciar()
      setCargado(null)
      alGuardar(guardado.nombre)
    })
  }

  const cerrar = () => {
    formulario.reiniciar()
    setCargado(null)
    alCerrar()
  }

  return (
    <Modal
      abierto={abierto}
      titulo={repartidor ? `Editar a ${repartidor.nombre}` : 'Nuevo repartidor'}
      descripcion="El nombre completo se arma con los nombres y apellidos; el documento identifica al repartidor en las entregas."
      ancho="md"
      alCerrar={cerrar}
      pie={
        <>
          <Boton variante="secundario" onClick={cerrar} disabled={formulario.enviando}>
            Cancelar
          </Boton>
          <Boton onClick={guardar} cargando={formulario.enviando}>
            Guardar
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Entrada
            etiqueta="Nombres"
            requerido
            autoComplete="given-name"
            value={formulario.valores.nombres}
            onChange={(evento) => formulario.cambiar('nombres', evento.target.value)}
            error={formulario.errores.nombres}
          />
          <Entrada
            etiqueta="Apellidos"
            requerido
            autoComplete="family-name"
            value={formulario.valores.apellidos}
            onChange={(evento) => formulario.cambiar('apellidos', evento.target.value)}
            error={formulario.errores.apellidos}
          />
          <Entrada
            etiqueta="Documento"
            requerido
            ayuda="DNI o documento de identidad."
            value={formulario.valores.documento}
            onChange={(evento) => formulario.cambiar('documento', evento.target.value)}
            error={formulario.errores.documento}
          />
          <Entrada
            etiqueta="Teléfono"
            requerido
            type="tel"
            autoComplete="tel"
            value={formulario.valores.telefono}
            onChange={(evento) => formulario.cambiar('telefono', evento.target.value)}
            error={formulario.errores.telefono}
          />
        </div>

        <div>
          <Entrada
            etiqueta="Zona"
            ayuda="Opcional. Se puede elegir una registrada o escribir una nueva."
            list="zonas-repartidor"
            value={formulario.valores.zona}
            onChange={(evento) => formulario.cambiar('zona', evento.target.value)}
            error={formulario.errores.zona}
          />
          <datalist id="zonas-repartidor">
            {zonasDisponibles.map((valor) => (
              <option key={valor} value={valor} />
            ))}
          </datalist>
        </div>

        <AreaTexto
          etiqueta="Dirección"
          filas={2}
          autoComplete="street-address"
          ayuda="Opcional."
          value={formulario.valores.direccion}
          onChange={(evento) => formulario.cambiar('direccion', evento.target.value)}
          error={formulario.errores.direccion}
        />

        {formulario.errores.general && (
          <p className="text-sm text-rose-600">{formulario.errores.general}</p>
        )}
      </div>
    </Modal>
  )
}
