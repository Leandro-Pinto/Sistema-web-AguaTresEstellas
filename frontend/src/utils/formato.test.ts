import { describe, expect, it } from 'vitest'
import {
  clases,
  desdeHace,
  dinero,
  duracion,
  nombreMetodoPago,
  numero,
  paraCampoFecha,
  presentacionEntrega,
  presentacionPedido,
  presentacionVenta,
  porcentaje,
  tituloRol,
} from '@/utils/formato'
import type { EstadoVenta } from '@/types/dominio'

/**
 * Estas funciones deciden cómo ve el usuario cada cifra y cada estado.
 * Un error aquí no rompe la aplicación: muestra un importe equivocado o un
 * estado con el color de otro, que es un fallo silencioso y por eso conviene
 * fijarlo con pruebas.
 */

/**
 * `Intl` inserta un espacio no separable (U+00A0) entre el símbolo de moneda y
 * la cifra. Se normaliza a un espacio común para que la comparación no dependa
 * de ese carácter invisible.
 */
const sinEspacioFijo = (texto: string) => texto.replace(/\u00a0/g, ' ')

describe('formato de importes', () => {
  // El Perú usa la coma como separador de miles y el punto como separador
  // decimal, y `es-PE` lo respeta. No es el formato español de Europa.
  it('presenta el importe en soles con dos decimales', () => {
    expect(sinEspacioFijo(dinero(1234.5))).toBe('S/ 1,234.50')
  })

  it('trata nulo y indefinido como cero en vez de mostrar "NaN"', () => {
    expect(sinEspacioFijo(dinero(null))).toBe('S/ 0.00')
    expect(sinEspacioFijo(dinero(undefined))).toBe('S/ 0.00')
  })

  it('respeta los decimales indicados en número', () => {
    expect(numero(1500)).toBe('1,500')
    expect(numero(12.3456, 2)).toBe('12.35')
  })

  it('agrega el símbolo de porcentaje separado por un espacio', () => {
    expect(porcentaje(85.5)).toBe('85.5 %')
  })
})

describe('formato de duraciones', () => {
  it('expresa los minutos por debajo de una hora', () => {
    expect(duracion(45)).toBe('45 min')
  })

  it('pasa a horas y minutos a partir de sesenta', () => {
    expect(duracion(60)).toBe('1 h')
    expect(duracion(95)).toBe('1 h 35 min')
  })

  it('nunca devuelve una duración negativa', () => {
    expect(duracion(-10)).toBe('0 min')
  })

  it('trata nulo como cero', () => {
    expect(duracion(null)).toBe('0 min')
  })
})

describe('fechas relativas', () => {
  it('describe los últimos minutos en minutos', () => {
    const hace10min = new Date(Date.now() - 10 * 60 * 1000)
    expect(desdeHace(hace10min)).toBe('hace 10 min')
  })

  it('describe las últimas horas en horas', () => {
    const hace3h = new Date(Date.now() - 3 * 3600 * 1000)
    expect(desdeHace(hace3h)).toBe('hace 3 h')
  })

  it('describe la última semana en días', () => {
    const hace5dias = new Date(Date.now() - 5 * 86400 * 1000)
    expect(desdeHace(hace5dias)).toBe('hace 5 días')
  })

  it('devuelve un guion para una fecha inválida', () => {
    expect(desdeHace('no-es-una-fecha')).toBe('—')
  })

  it('devuelve un guion para nulo', () => {
    expect(desdeHace(null)).toBe('—')
  })
})

describe('campos de fecha', () => {
  it('serializa una fecha en formato AAAA-MM-DD', () => {
    expect(paraCampoFecha(new Date('2026-03-15T12:00:00'))).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('presentación de estados', () => {
  it('traduce cada estado de pedido a su etiqueta en español', () => {
    expect(presentacionPedido('EN_RUTA')).toEqual({ etiqueta: 'En ruta', estilo: 'aviso' })
    expect(presentacionPedido('ENTREGADO')).toEqual({ etiqueta: 'Entregado', estilo: 'exito' })
    expect(presentacionPedido('CANCELADO')).toEqual({ etiqueta: 'Cancelado', estilo: 'error' })
  })

  it('traduce los estados de entrega y de venta', () => {
    expect(presentacionEntrega('NO_ENTREGADO').etiqueta).toBe('No entregado')
    expect(presentacionVenta('PENDIENTE')).toEqual({ etiqueta: 'Pendiente de cobro', estilo: 'aviso' })
  })

  it('un estado desconocido no rompe la pantalla', () => {
    // El backend no debería enviarlo nunca, pero un valor nuevo no debe
    // dejar la etiqueta vacía. El casts es deliberado: reproduce lo que
    // haría una API que añadiera un estado sin actualizar este frontend.
    expect(presentacionVenta('DESCONOCIDO' as EstadoVenta).etiqueta).toBe('DESCONOCIDO')
  })

  it('traduce los métodos de pago', () => {
    expect(nombreMetodoPago('YAPE')).toBe('Yape')
    expect(nombreMetodoPago('EFECTIVO')).toBe('Efectivo')
  })

  it('un método desconocido se muestra tal cual', () => {
    expect(nombreMetodoPago('BITCOIN')).toBe('BITCOIN')
  })
})

describe('utilidades varias', () => {
  it('capitaliza el rol y reemplaza guiones bajos', () => {
    expect(tituloRol('ADMINISTRADOR')).toBe('Administrador')
    expect(tituloRol('JEFE_ALMACEN')).toBe('Jefe almacen')
  })

  it('junta clases descartando las vacías', () => {
    expect(clases('a', false, null, undefined, 'b')).toBe('a b')
  })
})
