import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAutenticacion } from '@/context/autenticacion'
import { Cargador, Vacio } from '@/components/ui'
import { Layout } from '@/components/Layout'
import { PaginaAcceso } from '@/pages/Acceso'
import { PaginaTablero } from '@/pages/Tablero'
import { PaginaPerfil } from '@/pages/Perfil'
import { PaginaClientes } from '@/pages/Clientes'
import { PaginaProductos } from '@/pages/Productos'
import { PaginaInventario } from '@/pages/Inventario'
import { PaginaPedidos } from '@/pages/Pedidos'
import { PaginaVentas } from '@/pages/Ventas'
import { PaginaPagos } from '@/pages/Pagos'
import { PaginaEntregas } from '@/pages/Entregas'
import { PaginaMiRuta } from '@/pages/MiRuta'
import { PaginaRepartidores } from '@/pages/Repartidores'
import { PaginaBidones } from '@/pages/Bidones'
import { PaginaUsuarios } from '@/pages/Usuarios'
import PaginaReportes from '@/pages/Reportes'
import PaginaIndicadores from '@/pages/Indicadores'
import PaginaEvidencia from '@/pages/Evidencia'
import type { NombreRol } from '@/types/dominio'

/**
 * Guarda de ruta.
 *
 * Tres decisiones deliberadas:
 *
 * 1. Espera a que el contexto termine de consultar `/auth/perfil` antes de
 *    decidir. Sin esta espera, un usuario con sesión válida vería un instante
 *    la pantalla de acceso antes de entrar, y en cada recarga parpadearía.
 *
 * 2. Guarda la ruta pretendida en el estado de navegación, para devolver al
 *    usuario allí después de entrar en lugar de dejarlo siempre en el tablero.
 *
 * 3. Un 403 del servidor no es un fallo de la interfaz: se muestra como
 *    "sin permisos" y no como error. El backend sigue siendo la autoridad;
 *    esta capa solo evita mostrar un enlace que no va a funcionar.
 */
const RutaProtegida = ({ roles, children }: { roles?: NombreRol[]; children: ReactNode }) => {
  const { autenticado, cargando, perfil, tieneRol } = useAutenticacion()
  const ubicacion = useLocation()

  if (cargando) return <Cargador texto="Verificando su sesión…" />

  if (!autenticado) {
    return <Navigate to="/acceso" replace state={{ desde: ubicacion.pathname }} />
  }

  // Se devuelve el mensaje sin `Layout`: la ruta ya lo montó como ancestro y
  // envolverlo otra vez duplicaría la barra lateral y la cabecera.
  if (roles && !tieneRol(...roles)) {
    return (
      <Vacio
        titulo="No tiene permisos para ver esta sección"
        descripcion={`Su rol (${perfil ? perfil.rol.nombre.toLowerCase() : 'sin definir'}) no incluye este módulo. Si necesita acceder, solicítelo al administrador del sistema.`}
      />
    )
  }

  return <>{children}</>
}

const Rutas = () => (
  <Routes>
    <Route path="/acceso" element={<PaginaAcceso />} />

    {/* El layout envuelve todo lo que exige sesión. */}
    <Route
      element={
        <RutaProtegida>
          <Layout />
        </RutaProtegida>
      }
    >
      <Route index element={<Navigate to="/tablero" replace />} />
      <Route path="/tablero" element={<PaginaTablero />} />
      <Route path="/perfil" element={<PaginaPerfil />} />

      <Route
        path="/pedidos"
        element={
          <RutaProtegida roles={['ADMINISTRADOR', 'VENDEDOR']}>
            <PaginaPedidos />
          </RutaProtegida>
        }
      />
      <Route
        path="/ventas"
        element={
          <RutaProtegida roles={['ADMINISTRADOR', 'VENDEDOR']}>
            <PaginaVentas />
          </RutaProtegida>
        }
      />
      <Route
        path="/pagos"
        element={
          <RutaProtegida roles={['ADMINISTRADOR', 'VENDEDOR']}>
            <PaginaPagos />
          </RutaProtegida>
        }
      />
      <Route
        path="/entregas"
        element={
          <RutaProtegida roles={['ADMINISTRADOR', 'VENDEDOR']}>
            <PaginaEntregas />
          </RutaProtegida>
        }
      />
      <Route
        path="/mis-entregas"
        element={
          <RutaProtegida roles={['REPARTIDOR']}>
            <PaginaMiRuta />
          </RutaProtegida>
        }
      />
      <Route
        path="/clientes"
        element={
          <RutaProtegida roles={['ADMINISTRADOR', 'VENDEDOR']}>
            <PaginaClientes />
          </RutaProtegida>
        }
      />
      <Route
        path="/productos"
        element={
          <RutaProtegida roles={['ADMINISTRADOR', 'VENDEDOR']}>
            <PaginaProductos />
          </RutaProtegida>
        }
      />
      <Route
        path="/inventario"
        element={
          <RutaProtegida roles={['ADMINISTRADOR', 'VENDEDOR']}>
            <PaginaInventario />
          </RutaProtegida>
        }
      />
      <Route
        path="/bidones"
        element={
          <RutaProtegida roles={['ADMINISTRADOR', 'VENDEDOR', 'REPARTIDOR']}>
            <PaginaBidones />
          </RutaProtegida>
        }
      />
      <Route
        path="/repartidores"
        element={
          <RutaProtegida roles={['ADMINISTRADOR']}>
            <PaginaRepartidores />
          </RutaProtegida>
        }
      />
      <Route
        path="/usuarios"
        element={
          <RutaProtegida roles={['ADMINISTRADOR']}>
            <PaginaUsuarios />
          </RutaProtegida>
        }
      />
      {/*
        Reportes, indicadores y evidencia se abren a todo el personal: el
        backend filtra por rol en cada endpoint y, en el caso de la evidencia,
        quien las registra es quien evalúa el sistema. La exportación CSV de
        indicadores sí es exclusiva del administrador, y eso se decide en la
        pantalla, no ocultando la ruta.
      */}
      <Route
        path="/reportes"
        element={
          <RutaProtegida roles={['ADMINISTRADOR', 'VENDEDOR', 'REPARTIDOR']}>
            <PaginaReportes />
          </RutaProtegida>
        }
      />
      <Route
        path="/indicadores"
        element={
          <RutaProtegida roles={['ADMINISTRADOR', 'VENDEDOR']}>
            <PaginaIndicadores />
          </RutaProtegida>
        }
      />
      <Route
        path="/evidencia"
        element={
          <RutaProtegida roles={['ADMINISTRADOR', 'VENDEDOR', 'REPARTIDOR']}>
            <PaginaEvidencia />
          </RutaProtegida>
        }
      />
    </Route>

    {/* Cualquier ruta desconocida lleva al tablero, no a un error vacío. */}
    <Route path="*" element={<Navigate to="/tablero" replace />} />
  </Routes>
)

export const App = () => (
  <Cortafuegos>
    <Rutas />
  </Cortafuegos>
)

interface EstadoCortafuegos {
  fallo: Error | null
}

/**
 * Cortafuegos de errores de renderizado.
 *
 * Tiene que ser una clase: `componentDidCatch` es el único mecanismo con el
 * que React expone el fallo de un hijo. Un `try/catch` en un componente de
 * función no lo captura, porque el error se lanza al reconciliar el árbol, no
 * dentro de la función.
 *
 * Sin él, un fallo en cualquier pantalla deja la página en blanco y el
 * usuario se queda sin mensaje y sin forma de cerrar sesión.
 */
class Cortafuegos extends Component<{ children: ReactNode }, EstadoCortafuegos> {
  state: EstadoCortafuegos = { fallo: null }

  static getDerivedStateFromError(fallo: Error): EstadoCortafuegos {
    return { fallo }
  }

  componentDidCatch(fallo: Error, info: ErrorInfo) {
    // Se deja el rastro en consola: en desarrollo es la única forma de ver la
    // pila real sin exponerla al usuario en producción.
    console.error('Error de renderizado', fallo, info.componentStack)
  }

  render() {
    if (!this.state.fallo) return this.props.children

    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md rounded-xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
          <h1 className="text-lg font-semibold text-slate-900">Ocurrió un error inesperado</h1>
          <p className="mt-2 text-sm text-slate-600">
            La aplicación no pudo continuar. Recargue la página para intentarlo nuevamente.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 rounded-lg bg-marca-600 px-4 py-2 text-sm font-medium text-white hover:bg-marca-700"
          >
            Recargar la página
          </button>
        </div>
      </div>
    )
  }
}
