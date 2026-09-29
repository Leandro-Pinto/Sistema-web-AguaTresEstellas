import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAutenticacion } from '@/context/autenticacion'
import { auth } from '@/services/api'
import { useFormulario } from '@/hooks'
import { Aviso, Boton, Entrada, Pagina, Tarjeta } from '@/components/ui'
import { clases, fechaHora, tituloRol } from '@/utils/formato'

/**
 * Perfil del usuario autenticado.
 *
 * Reúne los tres cambios que un usuario puede hacer sobre sí mismo: datos de
 * contacto y contraseña. No se incluye cambiar el rol ni el estado; esos campos
 * los administra otra persona, y ofrecerlos aquí sugeriría que son editables.
 */
export const PaginaPerfil = () => {
  const { perfil, refrescarPerfil } = useAutenticacion()
  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; mensaje: string } | null>(null)

  const contacto = useFormulario({
    nombres: perfil?.nombres ?? '',
    apellidos: perfil?.apellidos ?? '',
    telefono: perfil?.telefono ?? '',
    email: perfil?.email ?? '',
  })

  const clave = useFormulario({ actual: '', nueva: '', repetir: '' })

  if (!perfil) return null

  /**
   * Los errores del backend llegan como `ErrorApi` y los mapea el propio
   * formulario a campos; no hace falta capturarlos aquí.
   */
  const guardarContacto = () => {
    setAviso(null)
    void contacto.enviar(async () => {
      await auth.actualizarPerfil({
        nombres: contacto.valores.nombres.trim(),
        apellidos: contacto.valores.apellidos.trim(),
        telefono: contacto.valores.telefono.trim() || null,
        email: contacto.valores.email.trim(),
      })
      await refrescarPerfil()
      setAviso({ tipo: 'exito', mensaje: 'Sus datos se actualizaron correctamente.' })
    })
  }

  const guardarClave = () => {
    setAviso(null)
    if (clave.valores.nueva !== clave.valores.repetir) {
      clave.cambiar('repetir', '')
      return
    }
    void clave.enviar(async () => {
      await auth.cambiarPassword(clave.valores.actual, clave.valores.nueva)
      await refrescarPerfil()
      clave.reiniciar()
      setAviso({ tipo: 'exito', mensaje: 'Su contraseña se actualizó correctamente.' })
    })
  }

  return (
    <Pagina
      titulo="Mi perfil"
      descripcion="Actualice sus datos de contacto y su contraseña de acceso."
      acciones={
        <Link
          to="/tablero"
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        >
          Volver al tablero
        </Link>
      }
    >
      {aviso && (
        <Aviso
          tipo={aviso.tipo}
          mensaje={aviso.mensaje}
          alCerrar={() => setAviso(null)}
        />
      )}

      {perfil.debeCambiarPassword && (
        <div
          role="alert"
          className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200"
        >
          <p className="font-medium">Está usando una contraseña temporal</p>
          <p className="mt-0.5">
            Defina una contraseña propia antes de continuar.             La actual seguirá funcionando hasta que la cambie.
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Tarjeta titulo="Información de la cuenta" className="lg:col-span-1">
          <dl className="space-y-3 text-sm">
            <Dato etiqueta="Usuario" valor={perfil.nombreCompleto} />
            <Dato etiqueta="Correo" valor={perfil.email} />
            <Dato etiqueta="Rol" valor={tituloRol(perfil.rol.nombre)} />
            <Dato
              etiqueta="Último acceso"
              valor={perfil.ultimoAcceso ? fechaHora(perfil.ultimoAcceso) : 'Primer ingreso'}
            />
            <Dato etiqueta="Estado" valor={perfil.activo ? 'Activo' : 'Inactivo'} />
          </dl>
        </Tarjeta>

        <Tarjeta
          titulo="Datos personales"
          descripcion="Su nombre aparece en los pedidos, ventas y la bitácora del sistema."
          className="lg:col-span-2"
        >
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(evento) => {
              evento.preventDefault()
              guardarContacto()
            }}
            noValidate
          >
            <Entrada
              etiqueta="Nombres"
              required
              autoComplete="given-name"
              value={contacto.valores.nombres}
              error={contacto.errores.nombres}
              onChange={(evento) => contacto.cambiar('nombres', evento.target.value)}
            />
            <Entrada
              etiqueta="Apellidos"
              required
              autoComplete="family-name"
              value={contacto.valores.apellidos}
              error={contacto.errores.apellidos}
              onChange={(evento) => contacto.cambiar('apellidos', evento.target.value)}
            />
            <Entrada
              etiqueta="Teléfono"
              type="tel"
              autoComplete="tel"
              placeholder="987654321"
              ayuda="Se usa para contactarlo cuando un pedido requiere coordinación."
              value={contacto.valores.telefono}
              error={contacto.errores.telefono}
              onChange={(evento) => contacto.cambiar('telefono', evento.target.value)}
            />
            <Entrada
              etiqueta="Correo electrónico"
              type="email"
              required
              autoComplete="email"
              value={contacto.valores.email}
              error={contacto.errores.email}
              onChange={(evento) => contacto.cambiar('email', evento.target.value)}
            />

            {contacto.errores.general && (
              <p role="alert" className="text-sm font-medium text-rose-600 sm:col-span-2">
                {contacto.errores.general}
              </p>
            )}

            <div className="sm:col-span-2">
              <Boton type="submit" cargando={contacto.enviando}>
                Guardar cambios
              </Boton>
            </div>
          </form>
        </Tarjeta>
      </div>

      <div className="mt-4">
        <Tarjeta
          titulo="Cambiar contraseña"
          descripcion="Debe conocer su contraseña actual para cambiarla."
        >
          <form
            className="grid max-w-2xl gap-4 sm:grid-cols-2"
            onSubmit={(evento) => {
              evento.preventDefault()
              guardarClave()
            }}
            noValidate
          >
            <Entrada
              etiqueta="Contraseña actual"
              type="password"
              required
              autoComplete="current-password"
              className="sm:col-span-2"
              value={clave.valores.actual}
              error={clave.errores.actual}
              onChange={(evento) => clave.cambiar('actual', evento.target.value)}
            />
            <Entrada
              etiqueta="Contraseña nueva"
              type="password"
              required
              autoComplete="new-password"
              ayuda="Mínimo 8 caracteres, con letra mayúscula y minúscula."
              value={clave.valores.nueva}
              error={clave.errores.nueva}
              onChange={(evento) => clave.cambiar('nueva', evento.target.value)}
            />
            <Entrada
              etiqueta="Repetir contraseña nueva"
              type="password"
              required
              autoComplete="new-password"
              error={
                clave.valores.repetir.length > 0 && clave.valores.repetir !== clave.valores.nueva
                  ? 'Las contraseñas no coinciden'
                  : clave.errores.repetir
              }
              onChange={(evento) => clave.cambiar('repetir', evento.target.value)}
            />

            {clave.errores.general && (
              <p role="alert" className="text-sm font-medium text-rose-600 sm:col-span-2">
                {clave.errores.general}
              </p>
            )}

            <div className={clases('sm:col-span-2')}>
              <Boton
                type="submit"
                cargando={clave.enviando}
                disabled={clave.valores.nueva !== clave.valores.repetir}
              >
                Cambiar contraseña
              </Boton>
            </div>
          </form>
        </Tarjeta>
      </div>
    </Pagina>
  )
}

const Dato = ({ etiqueta, valor }: { etiqueta: string; valor: string }) => (
  <div>
    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{etiqueta}</dt>
    <dd className="mt-0.5 text-slate-900">{valor}</dd>
  </div>
)
