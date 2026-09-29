import { useEffect, useState } from 'react'
import { BarraListado, Listado } from '@/components/Listado'
import {
  AreaTexto,
  Aviso,
  Boton,
  Casilla,
  Celda,
  Confirmacion,
  Entrada,
  Etiqueta,
  Modal,
  Pagina,
  Seleccion,
  Tarjeta,
} from '@/components/ui'
import { useListado } from '@/hooks/useListado'
import { useAutenticacion } from '@/context/autenticacion'
import { useFormulario } from '@/hooks'
import { productos } from '@/services/api'
import type { DatosProducto } from '@/services/api'
import type { Producto } from '@/types/dominio'
import { dinero } from '@/utils/formato'

const UNIDADES = ['UNIDAD', 'BIDON', 'PAQUETE', 'CAJA', 'LITRO', 'GALON', 'DOCENA']

const productoVacio: DatosProducto = {
  codigo: '',
  nombre: '',
  descripcion: '',
  unidadMedida: 'UNIDAD',
  precioVenta: 0,
  costoUnitario: 0,
  stockInicial: 0,
  stockMinimo: 0,
  esRetornable: false,
  activo: true,
}

export const PaginaProductos = () => {
  const { tieneRol } = useAutenticacion()
  const esAdmin = tieneRol('ADMINISTRADOR')

  const [estado, setEstado] = useState<'todos' | 'true' | 'false'>('todos')
  const [retornable, setRetornable] = useState<'todos' | 'true' | 'false'>('todos')
  const [stockBajo, setStockBajo] = useState(false)

  const [abierto, setAbierto] = useState(false)
  const [editando, setEditando] = useState<Producto | null>(null)
  const [porDesactivar, setPorDesactivar] = useState<Producto | null>(null)
  const [procesando, setProcesando] = useState(false)
  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; mensaje: string } | null>(null)

  const tabla = useListado<Producto>('/productos', {
    activo: estado,
    esRetornable: retornable,
    soloStockBajo: stockBajo ? 'true' : undefined,
  })

  const formulario = useFormulario<DatosProducto>(productoVacio)

  useEffect(() => {
    if (!abierto) return
    formulario.reiniciar(
      editando
        ? {
            codigo: editando.codigo,
            nombre: editando.nombre,
            descripcion: editando.descripcion ?? '',
            unidadMedida: editando.unidadMedida,
            precioVenta: editando.precioVenta,
            costoUnitario: editando.costoUnitario ?? 0,
            stockMinimo: editando.stockMinimo,
            esRetornable: editando.esRetornable,
            activo: editando.activo,
          }
        : productoVacio,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, editando])

  const guardar = () => {
    void formulario.enviar(async () => {
      const datos = formulario.valores
      // El precio tiene que ser mayor que cero (regla del backend). Avisarlo aquí
      // evita el viaje de ida y vuelta por un 422 con el mismo resultado.
      if (datos.precioVenta <= 0) throw new Error('El precio de venta debe ser mayor que cero.')

      if (editando) {
        // `stockInicial` no se envía al editar: el stock solo cambia por
        // movimientos, y escribirlo aquí rompería la trazabilidad del inventario.
        const { stockInicial: _omitido, ...resto } = datos
        await productos.actualizar(editando.id, resto)
        setAviso({ tipo: 'exito', mensaje: `Producto ${datos.codigo.toUpperCase()} actualizado.` })
      } else {
        await productos.crear(datos)
        setAviso({ tipo: 'exito', mensaje: `Producto ${datos.codigo.toUpperCase()} registrado.` })
      }
      setAbierto(false)
      setEditando(null)
      tabla.recargar()
    })
  }

  const alternarEstado = () => {
    if (!porDesactivar) return
    setProcesando(true)
    const objetivo = porDesactivar
    void productos
      .cambiarEstado(objetivo.id, !objetivo.activo)
      .then(() => {
        setAviso({
          tipo: 'exito',
          mensaje: `Producto ${objetivo.codigo} ${objetivo.activo ? 'desactivado' : 'activado'}.`,
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
        setPorDesactivar(null)
      })
  }

  const nivelDe = (producto: Producto) => {
    if (producto.stock === 0) return { texto: 'Agotado', tono: 'error' as const }
    if (producto.stock <= producto.stockMinimo) return { texto: 'Bajo', tono: 'aviso' as const }
    return { texto: 'Normal', tono: 'exito' as const }
  }

  return (
    <Pagina
      titulo="Productos"
      descripcion="Catálogo de productos, precios de venta y condiciones de stock."
      acciones={
        esAdmin && (
          <Boton
            onClick={() => {
              setEditando(null)
              setAbierto(true)
            }}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            Nuevo producto
          </Boton>
        )
      }
    >
      {aviso && <Aviso tipo={aviso.tipo} mensaje={aviso.mensaje} alCerrar={() => setAviso(null)} />}

      <Listado<Producto>
        {...tabla}
        claveFila={(producto) => producto.id}
        barra={
          <BarraListado
            busqueda={tabla.consulta.busqueda}
            alBuscar={tabla.buscar}
            marcador="Buscar por nombre o código…"
            alRecargar={tabla.recargar}
          >
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
            <Seleccion
              etiqueta=""
              aria-label="Filtrar por tipo de envase"
              value={retornable}
              onChange={(evento) => setRetornable(evento.target.value as typeof retornable)}
              opciones={[
                { valor: 'todos', texto: 'Todos los productos' },
                { valor: 'true', texto: 'Solo retornables' },
                { valor: 'false', texto: 'Solo no retornables' },
              ]}
              className="w-full sm:w-52"
            />
            <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={stockBajo}
                onChange={(evento) => setStockBajo(evento.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-marca-600 focus:ring-marca-500"
              />
              Solo stock bajo
            </label>
          </BarraListado>
        }
        columnas={[
          { clave: 'codigo', encabezado: 'Código' },
          { clave: 'nombre', encabezado: 'Producto' },
          { clave: 'precio', encabezado: 'Precio', clase: 'text-right' },
          { clave: 'costo', encabezado: 'Costo', clase: 'text-right' },
          { clave: 'stock', encabezado: 'Stock', clase: 'text-right' },
          { clave: 'nivel', encabezado: 'Nivel' },
          { clave: 'envase', encabezado: 'Envase' },
          ...(esAdmin ? [{ clave: 'acciones', encabezado: 'Acciones', clase: 'text-right' }] : []),
        ]}
        vacio={{
          titulo: 'No hay productos que coincidan',
          descripcion: esAdmin
            ? 'Ajuste los filtros o registre un producto nuevo.'
            : 'Ajuste los filtros para ver otros resultados.',
          accion:
            esAdmin && (
              <Boton
                onClick={() => {
                  setEditando(null)
                  setAbierto(true)
                }}
              >
                Registrar producto
              </Boton>
            ),
        }}
        renderFila={(producto) => {
          const nivel = nivelDe(producto)
          return (
            <>
              <Celda className="font-medium text-slate-900">{producto.codigo}</Celda>
              <Celda>
                <span className="block max-w-[18rem] truncate" title={producto.nombre}>
                  {producto.nombre}
                </span>
                <span className="text-xs text-slate-500">Se mide en {producto.unidadMedida.toLowerCase()}</span>
              </Celda>
              <Celda numerica className="font-medium">
                {dinero(producto.precioVenta)}
              </Celda>
              <Celda numerica>{dinero(producto.costoUnitario)}</Celda>
              <Celda numerica>{producto.stock}</Celda>
              <Celda>
                <Etiqueta tono={nivel.tono}>{nivel.texto}</Etiqueta>
              </Celda>
              <Celda>
                {producto.esRetornable ? (
                  <Etiqueta tono="info">Retornable</Etiqueta>
                ) : (
                  <Etiqueta tono="neutro">Venta directa</Etiqueta>
                )}
              </Celda>
              {esAdmin && (
                <Celda className="text-right">
                  <div className="flex justify-end gap-1">
                    <Boton
                      variante="fantasma"
                      tamano="sm"
                      onClick={() => {
                        setEditando(producto)
                        setAbierto(true)
                      }}
                    >
                      Editar
                    </Boton>
                    <Boton
                      variante="fantasma"
                      tamano="sm"
                      className={producto.activo ? 'text-rose-600' : 'text-emerald-700'}
                      onClick={() => setPorDesactivar(producto)}
                    >
                      {producto.activo ? 'Desactivar' : 'Activar'}
                    </Boton>
                  </div>
                </Celda>
              )}
            </>
          )
        }}
      />

      <Modal
        abierto={abierto}
        titulo={editando ? `Editar producto ${editando.codigo}` : 'Nuevo producto'}
        descripcion={
          editando
            ? 'El stock no se edita aquí: se modifica registrando movimientos de inventario.'
            : 'El stock inicial se registra solo en el alta; después se mueve por movimientos.'
        }
        ancho="lg"
        alCerrar={() => setAbierto(false)}
        pie={
          <>
            <Boton variante="secundario" onClick={() => setAbierto(false)} disabled={formulario.enviando}>
              Cancelar
            </Boton>
            <Boton onClick={guardar} cargando={formulario.enviando}>
              {editando ? 'Guardar cambios' : 'Registrar producto'}
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
            <Entrada
              etiqueta="Código"
              requerido
              autoComplete="off"
              ayuda="Se guarda en mayúsculas. No puede repetirse."
              value={formulario.valores.codigo}
              error={formulario.errores.codigo}
              onChange={(evento) => formulario.cambiar('codigo', evento.target.value.toUpperCase())}
            />
            <Entrada
              etiqueta="Nombre"
              requerido
              value={formulario.valores.nombre}
              error={formulario.errores.nombre}
              onChange={(evento) => formulario.cambiar('nombre', evento.target.value)}
            />
          </div>

          <AreaTexto
            etiqueta="Descripción"
            value={formulario.valores.descripcion ?? ''}
            error={formulario.errores.descripcion}
            onChange={(evento) => formulario.cambiar('descripcion', evento.target.value)}
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <Entrada
              etiqueta="Precio de venta (S/)"
              requerido
              type="number"
              min="0.01"
              step="0.01"
              value={String(formulario.valores.precioVenta)}
              error={formulario.errores.precioVenta}
              onChange={(evento) => formulario.cambiar('precioVenta', Number(evento.target.value))}
            />
            <Entrada
              etiqueta="Costo unitario (S/)"
              type="number"
              min="0"
              step="0.01"
              ayuda="Se usa en los reportes de margen."
              value={String(formulario.valores.costoUnitario ?? 0)}
              error={formulario.errores.costoUnitario}
              onChange={(evento) => formulario.cambiar('costoUnitario', Number(evento.target.value))}
            />
            <Seleccion
              etiqueta="Unidad de medida"
              value={formulario.valores.unidadMedida ?? 'UNIDAD'}
              error={formulario.errores.unidadMedida}
              onChange={(evento) => formulario.cambiar('unidadMedida', evento.target.value)}
              opciones={UNIDADES.map((valor) => ({ valor, texto: valor }))}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {!editando && (
              <Entrada
                etiqueta="Stock inicial"
                type="number"
                min="0"
                step="1"
                ayuda="Cantidad con la que se registra el producto."
                value={String(formulario.valores.stockInicial ?? 0)}
                error={formulario.errores.stockInicial}
                onChange={(evento) => formulario.cambiar('stockInicial', Number(evento.target.value))}
              />
            )}
            <Entrada
              etiqueta="Stock mínimo"
              type="number"
              min="0"
              step="1"
              ayuda="Por debajo de este valor el producto aparece en alerta."
              value={String(formulario.valores.stockMinimo ?? 0)}
              error={formulario.errores.stockMinimo}
              onChange={(evento) => formulario.cambiar('stockMinimo', Number(evento.target.value))}
            />
          </div>

          <Tarjeta className="ring-slate-200">
            <Casilla
              etiqueta="Producto retornable (envase que se devuelve y controla saldo por cliente)"
              checked={formulario.valores.esRetornable ?? false}
              error={formulario.errores.esRetornable}
              onChange={(evento) => formulario.cambiar('esRetornable', evento.target.checked)}
            />
          </Tarjeta>

          {formulario.errores.general && (
            <p role="alert" className="text-sm font-medium text-rose-600">
              {formulario.errores.general}
            </p>
          )}
        </form>
      </Modal>

      <Confirmacion
        abierto={porDesactivar !== null}
        titulo={porDesactivar?.activo ? 'Desactivar producto' : 'Activar producto'}
        mensaje={
          porDesactivar?.activo
            ? `El producto ${porDesactivar?.codigo} dejará de poder registrarse en pedidos. Su historial se conserva.`
            : `El producto ${porDesactivar?.codigo} volverá a estar disponible para la venta.`
        }
        textoConfirmar={porDesactivar?.activo ? 'Desactivar' : 'Activar'}
        procesando={procesando}
        onConfirmar={alternarEstado}
        onCancelar={() => setPorDesactivar(null)}
      />
    </Pagina>
  )
}
