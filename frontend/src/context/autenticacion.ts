import { createContext, useContext } from 'react'
import type { NombreRol, Perfil } from '@/types/dominio'

export interface ValorAutenticacion {
  perfil: Perfil | null
  cargando: boolean
  autenticado: boolean
  aviso: string | null
  entrar: (correo: string, contrasena: string, recordar: boolean) => Promise<void>
  salir: () => Promise<void>
  refrescarPerfil: () => Promise<void>
  limpiarAviso: () => void
  /** Sin argumentos, la ruta solo exige sesión iniciada. */
  tieneRol: (...roles: NombreRol[]) => boolean
}

/**
 * El contexto y el hook viven aparte del proveedor a propósito.
 *
 * Fast Refresh de React solo conserva el estado de un módulo si este exporta
 * un único componente. Mezclar el hook con el proveedor hace que cada
 * guardado recargue el archivo y pierda la sesión en desarrollo.
 */
export const ContextoAutenticacion = createContext<ValorAutenticacion | null>(null)

export const useAutenticacion = (): ValorAutenticacion => {
  const valor = useContext(ContextoAutenticacion)
  if (!valor) {
    throw new Error('useAutenticacion debe usarse dentro de ProveedorAutenticacion')
  }
  return valor
}
