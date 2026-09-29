import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAutenticacion } from '@/context/autenticacion'
import { useFormulario } from '@/hooks'
import { Boton, Entrada, Aviso } from '@/components/ui'
import { clases } from '@/utils/formato'

/**
 * Pantalla de acceso.
 *
 * No se redirecciona desde aquí si la sesión ya existe: eso lo hace la ruta
 * protegida, para que la lógica de "quién puede ver qué" viva en un solo
 * sitio y no repartida entre las pantallas.
 */
export const PaginaAcceso = () => {
  const { entrar, autenticado, aviso, limpiarAviso } = useAutenticacion()
  const navegar = useNavigate()
  const ubicacion = useLocation()
  const [mostrarContrasena, setMostrarContrasena] = useState(false)

  const formulario = useFormulario({ correo: '', contrasena: '', recordar: false })
  const { valores, cambiar, errores, enviando, enviar } = formulario

  // Si el usuario llegó desde una ruta protegida, se devuelve a ella después
  // de entrar; si no, al tablero.
  const destino = (ubicacion.state as { desde?: string } | null)?.desde ?? '/tablero'

  if (autenticado) return <Navigate to={destino} replace />

  /**
   * Los errores los captura `enviar`: los de campo se asignan a los inputs y
   * el resto va a `errores.general`, que es donde aparece el motivo real
   * (cuenta bloqueada, credenciales incorrectas, límite de intentos).
   */
  const acceder = () => {
    void enviar(async () => {
      await entrar(valores.correo.trim(), valores.contrasena, valores.recordar)
      navegar(destino, { replace: true })
    })
  }

  return (
    <div className="flex min-h-dvh bg-slate-50">
      {/* Panel de marca. Se oculta en móvil porque el formulario es lo
          esencial y la pantalla es estrecha. */}
      <div className="relative hidden w-1/2 flex-col justify-between bg-gradient-to-br from-marca-800 via-marca-700 to-marca-900 p-10 text-white lg:flex">
        <Marca />
        <div className="max-w-md">
          <h2 className="text-2xl font-semibold leading-snug">
            Sistema de gestión de ventas, pedidos y reparto
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-marca-100">
            Agua purificada en bidones de 20 litros. Controle el circuito completo: registro del
            pedido, venta, cobro, entrega y devolución de envases.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-marca-100">
            {[
              'Trazabilidad de cada pedido, venta y entrega',
              'Control de stock y saldos de bidones por cliente',
              'Indicadores del proceso de ventas en tiempo real',
            ].map((texto) => (
              <li key={texto} className="flex items-start gap-2">
                <svg
                  className="mt-0.5 h-4 w-4 shrink-0 text-marca-300"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M20 6L9 17l-5-5"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {texto}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-marca-300">
          Sistema de información para la tesis de grado — 2026
        </p>
      </div>

      <div className="flex w-full flex-col justify-center px-6 py-12 lg:w-1/2 lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <div className="lg:hidden">
            <Marca compacta />
          </div>

          <h1 className="mt-8 text-2xl font-semibold text-slate-900 lg:mt-0">Iniciar sesión</h1>
          <p className="mt-1 text-sm text-slate-600">
            Ingrese con las credenciales asignadas por el administrador.
          </p>

          {aviso && (
            <div className="mt-4">
              <Aviso tipo="aviso" mensaje={aviso} alCerrar={limpiarAviso} />
            </div>
          )}

          <form
            className="mt-6 space-y-4"
            onSubmit={(evento) => {
              evento.preventDefault()
              acceder()
            }}
            noValidate
          >
            <Entrada
              etiqueta="Correo electrónico"
              type="email"
              autoComplete="username"
              required
              autoFocus
              placeholder="usuario@aguarespura.pe"
              value={valores.correo}
              error={errores.correo}
              onChange={(evento) => cambiar('correo', evento.target.value)}
            />

            <div className="relative">
              <Entrada
                etiqueta="Contraseña"
                type={mostrarContrasena ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={valores.contrasena}
                error={errores.contrasena}
                onChange={(evento) => cambiar('contrasena', evento.target.value)}
              />
              <button
                type="button"
                onClick={() => setMostrarContrasena((visible) => !visible)}
                className="absolute right-2 top-[1.85rem] rounded p-1.5 text-slate-400 hover:text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-400"
                aria-label={mostrarContrasena ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {mostrarContrasena ? (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.4 5.3A9.8 9.8 0 0112 5c5 0 9 4.5 9 7 0 .8-.7 2-1.9 3.2M6.3 6.3C4 8 2 10.5 2 12c0 2.5 4 7 9 7 1 0 2-.2 2.9-.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M2 12s4-7 9-7 9 7 9 7-4 7-9 7-9-7-9-7z"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                    <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                )}
              </button>
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={valores.recordar}
                onChange={(evento) => cambiar('recordar', evento.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-marca-600 focus:ring-marca-500"
              />
              Mantener la sesión iniciada
            </label>

            {errores.general && (
              <div
                role="alert"
                className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200"
              >
                {errores.general}
              </div>
            )}

            <Boton type="submit" cargando={enviando} className={clases('w-full py-2.5')}>
              {enviando ? 'Verificando…' : 'Ingresar'}
            </Boton>
          </form>

          <p className="mt-8 text-center text-xs leading-relaxed text-slate-500">
            ¿Olvidó su contraseña? Solicite el restablecimiento al administrador del sistema.
          </p>
        </div>
      </div>
    </div>
  )
}

const Marca = ({ compacta }: { compacta?: boolean }) => (
  <div className="flex items-center gap-3">
    <span
      className={clases(
        'flex items-center justify-center rounded-xl bg-white/15 font-semibold text-white ring-1 ring-white/25',
        compacta ? 'h-10 w-10 text-sm' : 'h-12 w-12 text-lg',
      )}
      aria-hidden="true"
    >
      A3
    </span>
    <div>
      <p className={clases('font-semibold', compacta ? 'text-slate-900' : 'text-white')}>
        Agua Tres Estrellas
      </p>
      <p className={clases('text-xs', compacta ? 'text-slate-500' : 'text-marca-200')}>Pura</p>
    </div>
  </div>
)
