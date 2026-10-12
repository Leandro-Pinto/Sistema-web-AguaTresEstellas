import { useState } from 'react'
import { BarraListado, Listado } from '@/components/Listado'
import {
  Aviso,
  Boton,
  Casilla,
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
import { roles, usuarios } from '@/services/api'
import type { Usuario } from '@/types/dominio'
import { fechaHora } from '@/utils/formato'

interface UsuarioForm {
  nombres: string
  apellidos: string
  email: string
  documento: string
  telefono: string
  password: string
  rolId: string
  activo: boolean
  debeCambiarPassword: boolean
}

const formularioVacio: UsuarioForm = {
  nombres: '',
  apellidos: '',
  email: '',
  documento: '',
  telefono: '',
  password: '',
  rolId: '',
  activo: true,
  debeCambiarPassword: true,
}

export const PaginaUsuarios = () => {
  const { perfil } = useAutenticacion()

  const [rolId, setRolId] = useState('')
  const [activo, setActivo] = useState<'todos' | 'true' | 'false'>('todos')
  const [incluirEliminados, setIncluirEliminados] = useState(false)

  const [creando, setCreando] = useState(false)
  const [editando, setEditando] = useState<Usuario | null>(null)
  const [reseteando, setReseteando] = useState<Usuario | null>(null)
  const [confirmando, setConfirmando] = useState<Usuario | null>(null)
  const [procesando, setProcesando] = useState(false)
  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; mensaje: string } | null>(null)

  const tabla = useListado<Usuario>('/usuarios', {
    rolId: rolId || undefined,
    activo,
    incluirEliminados: incluirEliminados ? 'true' : undefined,
  })
  const catalogoRoles = usePeticion<{ id: number; nombre: string }[]>(
    () => roles.listar({ limite: 50, activo: 'true' }).then((pagina) => pagina.datos),
    [],
  )

  const alternarEstado = () => {
    if (!confirmando) return
    setProcesando(true)
    const objetivo = confirmando
    const nuevoEstado = !objetivo.activo
    void usuarios
      .cambiarEstado(objetivo.id, nuevoEstado)
      .then(() => {
        setAviso({
          tipo: 'exito',
          mensaje: `${objetivo.nombreCompleto} quedó ${nuevoEstado ? 'activo' : 'desactivado'}.`,
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
        setConfirmando(null)
      })
  }

  return (
    <Pagina
      titulo="Usuarios"
      descripcion="Cuentas de acceso al sistema, su rol y su estado."
      acciones={<Boton onClick={() => setCreando(true)}>Nuevo usuario</Boton>}
    >
      {aviso && <Aviso tipo={aviso.tipo} mensaje={aviso.mensaje} alCerrar={() => setAviso(null)} />}

      <Listado<Usuario>
        {...tabla}
        claveFila={(usuario) => usuario.id}
        barra={
          <BarraListado
            busqueda={tabla.consulta.busqueda}
            alBuscar={tabla.buscar}
            marcador="Buscar por nombre, correo o documento…"
            alRecargar={tabla.recargar}
          >
            <Seleccion
              etiqueta=""
              aria-label="Filtrar por rol"
              value={rolId}
              onChange={(evento) => setRolId(evento.target.value)}
              opciones={[
                { valor: '', texto: 'Todos los roles' },
                ...(catalogoRoles.datos ?? []).map((rol: { id: number; nombre: string }) => ({
                  valor: String(rol.id),
                  texto: rol.nombre,
                })),
              ]}
              className="w-full sm:w-44"
            />
            <Seleccion
              etiqueta=""
              aria-label="Filtrar por estado"
              value={activo}
              onChange={(evento) => setActivo(evento.target.value as typeof activo)}
              opciones={[
                { valor: 'todos', texto: 'Todos' },
                { valor: 'true', texto: 'Activos' },
                { valor: 'false', texto: 'Desactivados' },
              ]}
              className="w-full sm:w-40"
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
          { clave: 'email', encabezado: 'Correo' },
          { clave: 'rol', encabezado: 'Rol' },
          { clave: 'acceso', encabezado: 'Último acceso' },
          { clave: 'estado', encabezado: 'Estado' },
          { clave: 'acciones', encabezado: 'Acciones', clase: 'text-right' },
        ]}
        vacio={{
          titulo: 'No hay usuarios que coincidan',
          descripcion: 'Cree una cuenta y asígnele el rol que corresponde.',
        }}
        renderFila={(usuario) => {
          // Desactivarse a uno mismo dejaría la sesión sin acceso válido.
          const esPropia = usuario.id === perfil?.id
          return (
            <>
              <Celda className="font-medium text-slate-900">
                {usuario.nombreCompleto}
                {usuario.documento && (
                  <span className="block text-xs font-normal text-slate-500">
                    {usuario.documento}
                  </span>
                )}
              </Celda>
              <Celda>{usuario.email}</Celda>
              <Celda>
                <Etiqueta tono={usuario.rol.nombre === 'ADMINISTRADOR' ? 'info' : 'neutro'}>
                  {usuario.rol.nombre}
                </Etiqueta>
              </Celda>
              <Celda>
                {usuario.ultimoAcceso ? (
                  fechaHora(usuario.ultimoAcceso)
                ) : (
                  <span className="text-slate-400">Nunca</span>
                )}
              </Celda>
              <Celda>
                <Etiqueta tono={usuario.activo ? 'exito' : 'neutro'}>
                  {usuario.activo ? 'Activo' : 'Desactivado'}
                </Etiqueta>
                {usuario.debeCambiarPassword && usuario.activo && (
                  <span className="block text-xs text-amber-700">Debe cambiar su clave</span>
                )}
              </Celda>
              <Celda className="text-right">
                <div className="flex justify-end gap-1">
                  <Boton variante="fantasma" tamano="sm" onClick={() => setEditando(usuario)}>
                    Editar
                  </Boton>
                  <Boton
                    variante="fantasma"
                    tamano="sm"
                    onClick={() => setReseteando(usuario)}
                  >
                    Clave
                  </Boton>
                  {!esPropia && (
                    <Boton
                      variante="fantasma"
                      tamano="sm"
                      className={usuario.activo ? 'text-amber-700' : 'text-marca-700'}
                      onClick={() => setConfirmando(usuario)}
                    >
                      {usuario.activo ? 'Desactivar' : 'Reactivar'}
                    </Boton>
                  )}
                </div>
              </Celda>
            </>
          )
        }}
      />

      <ModalFormularioUsuario
        abierto={creando || editando !== null}
        usuario={editando}
        catalogoRoles={(catalogoRoles.datos ?? []).map((rol: { id: number; nombre: string }) => ({ id: rol.id, nombre: rol.nombre }))}
        alCerrar={() => {
          setCreando(false)
          setEditando(null)
        }}
        alGuardar={(nombre) => {
          setCreando(false)
          setEditando(null)
          setAviso({ tipo: 'exito', mensaje: `Usuario ${nombre} guardado.` })
          tabla.recargar()
        }}
      />

      <ModalResetearClave
        usuario={reseteando}
        alCerrar={() => setReseteando(null)}
        alConfirmar={() => {
          setReseteando(null)
          setAviso({ tipo: 'exito', mensaje: 'Se generó una contraseña nueva.' })
          tabla.recargar()
        }}
      />

      <Modal
        abierto={confirmando !== null}
        titulo={confirmando?.activo ? 'Desactivar usuario' : 'Reactivar usuario'}
        descripcion={
          confirmando?.activo
            ? 'Un usuario desactivado no puede iniciar sesión; su historial se conserva intacto.'
            : 'Volverá a poder iniciar sesión con su contraseña actual.'
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
          {confirmando?.nombreCompleto} ({confirmando?.email})
        </p>
      </Modal>
    </Pagina>
  )
}

const ModalFormularioUsuario = ({
  abierto,
  usuario,
  catalogoRoles,
  alCerrar,
  alGuardar,
}: {
  abierto: boolean
  usuario: Usuario | null
  catalogoRoles: { id: number; nombre: string }[]
  alCerrar: () => void
  alGuardar: (nombre: string) => void
}) => {
  const formulario = useFormulario<UsuarioForm>(formularioVacio)
  const [cargado, setCargado] = useState<number | null>(null)

  if (usuario && cargado !== usuario.id) {
    setCargado(usuario.id)
    formulario.reiniciar({
      nombres: usuario.nombres,
      apellidos: usuario.apellidos,
      email: usuario.email,
      documento: usuario.documento ?? '',
      telefono: usuario.telefono ?? '',
      password: '',
      rolId: String(usuario.rol.id),
      activo: usuario.activo,
      debeCambiarPassword: usuario.debeCambiarPassword,
    })
  }

  const guardar = () => {
    void formulario.enviar(async () => {
      const comunes = {
        nombres: formulario.valores.nombres.trim(),
        apellidos: formulario.valores.apellidos.trim(),
        email: formulario.valores.email.trim().toLowerCase(),
        documento: formulario.valores.documento.trim() || null,
        telefono: formulario.valores.telefono.trim() || null,
        rolId: Number(formulario.valores.rolId),
        activo: formulario.valores.activo,
        debeCambiarPassword: formulario.valores.debeCambiarPassword,
      }

      const guardado = usuario
        ? await usuarios.actualizar(usuario.id, comunes)
        : await usuarios.crear({ ...comunes, password: formulario.valores.password })

      formulario.reiniciar()
      setCargado(null)
      alGuardar(guardado.nombreCompleto)
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
      titulo={usuario ? `Editar a ${usuario.nombreCompleto}` : 'Nuevo usuario'}
      descripcion={
        usuario
          ? 'La contraseña no se cambia aquí: use el botón "Clave" para generar una nueva.'
          : 'La contraseña se envía una sola vez; marque el cambio obligatorio para que el usuario la elija en su primer ingreso.'
      }
      ancho="md"
      alCerrar={cerrar}
      pie={
        <>
          <Boton variante="secundario" onClick={cerrar} disabled={formulario.enviando}>
            Cancelar
          </Boton>
          <Boton
            onClick={guardar}
            cargando={formulario.enviando}
            disabled={!usuario && (!formulario.valores.rolId || !formulario.valores.password)}
          >
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
            etiqueta="Correo electrónico"
            requerido
            type="email"
            autoComplete="email"
            value={formulario.valores.email}
            onChange={(evento) => formulario.cambiar('email', evento.target.value)}
            error={formulario.errores.email}
          />
          <Entrada
            etiqueta="Documento"
            ayuda="Obligatorio para el repartidor: vincula la cuenta con su ficha de reparto."
            value={formulario.valores.documento}
            onChange={(evento) => formulario.cambiar('documento', evento.target.value)}
            error={formulario.errores.documento}
          />
          <Entrada
            etiqueta="Teléfono"
            type="tel"
            autoComplete="tel"
            value={formulario.valores.telefono}
            onChange={(evento) => formulario.cambiar('telefono', evento.target.value)}
            error={formulario.errores.telefono}
          />
          <Seleccion
            etiqueta="Rol"
            requerido
            value={formulario.valores.rolId}
            onChange={(evento) => formulario.cambiar('rolId', evento.target.value)}
            opciones={catalogoRoles.map((rol) => ({ valor: String(rol.id), texto: rol.nombre }))}
            marcador="Seleccione un rol"
            error={formulario.errores.rolId}
          />
        </div>

        {!usuario && (
          <Entrada
            etiqueta="Contraseña"
            requerido
            type="password"
            autoComplete="new-password"
            ayuda="Mínimo 8 caracteres."
            value={formulario.valores.password}
            onChange={(evento) => formulario.cambiar('password', evento.target.value)}
            error={formulario.errores.password}
          />
        )}

        <div className="space-y-2">
          <Casilla
            etiqueta="Usuario activo"
            checked={formulario.valores.activo}
            onChange={(evento) => formulario.cambiar('activo', evento.target.checked)}
          />
          <Casilla
            etiqueta="Debe cambiar la contraseña en su próximo ingreso"
            checked={formulario.valores.debeCambiarPassword}
            onChange={(evento) =>
              formulario.cambiar('debeCambiarPassword', evento.target.checked)
            }
          />
        </div>

        {formulario.errores.general && (
          <p className="text-sm text-rose-600">{formulario.errores.general}</p>
        )}
      </div>
    </Modal>
  )
}

const ModalResetearClave = ({
  usuario,
  alCerrar,
  alConfirmar,
}: {
  usuario: Usuario | null
  alCerrar: () => void
  alConfirmar: () => void
}) => {
  const formulario = useFormulario<{ passwordNueva: string }>({ passwordNueva: '' })

  if (!usuario) return null

  const confirmar = () => {
    void formulario.enviar(async () => {
      await usuarios.resetearPassword(usuario.id, formulario.valores.passwordNueva, true)
      formulario.reiniciar()
      alConfirmar()
    })
  }

  return (
    <Modal
      abierto
      titulo={`Generar contraseña de ${usuario.nombreCompleto}`}
      descripcion="Quedará marcado para que el usuario la cambie en su próximo ingreso. Comuníquela por un canal seguro."
      ancho="sm"
      alCerrar={alCerrar}
      pie={
        <>
          <Boton variante="secundario" onClick={alCerrar} disabled={formulario.enviando}>
            Volver
          </Boton>
          <Boton onClick={confirmar} cargando={formulario.enviando}>
            Generar contraseña
          </Boton>
        </>
      }
    >
      <Entrada
        etiqueta="Contraseña nueva"
        requerido
        type="password"
        autoComplete="new-password"
        ayuda="Mínimo 8 caracteres."
        value={formulario.valores.passwordNueva}
        onChange={(evento) => formulario.cambiar('passwordNueva', evento.target.value)}
        error={formulario.errores.passwordNueva}
      />
      {formulario.errores.general && (
        <p className="mt-2 text-sm text-rose-600">{formulario.errores.general}</p>
      )}
    </Modal>
  )
}
