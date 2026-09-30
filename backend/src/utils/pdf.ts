import type { Response } from 'express';
import PDFDocument from 'pdfkit';
import { aIsoFechaHora } from './fechas';
import { esDecimal, nombreArchivo } from './exportar';

/**
 * EXPORTACIÓN PDF
 *
 * Los reportes que la vista muestra en tablas se pueden descargar también
 * como PDF para imprimirse o archivarse. A diferencia del CSV, no es una
 * sola tabla: el archivo reproduce el resumen y todas las listas que compuso
 * el reporte, separadas por secciones.
 *
 * Se usa PDFKit con las fuentes estándar Helvetica, cuya codificación
 * WinAnsi cubre los acentos del español sin depender de archivos de fuente.
 */

/** Formatea un número sin ruido de coma flotante (7.999... -> 8). */
const textoNumeral = (n: number): string =>
  Number.isInteger(n) ? String(n) : Number(n.toFixed(2)).toString();

/** Reduce cualquier valor a su presentación de celda. */
const textoDe = (valor: unknown): string => {
  if (valor === null || valor === undefined) return '';
  if (valor instanceof Date) return aIsoFechaHora(valor);
  if (esDecimal(valor)) return textoNumeral(valor.toNumber());
  if (typeof valor === 'number') return textoNumeral(valor);
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
  if (typeof valor === 'object') return '';
  return String(valor);
};

const esObjetoSimple = (valor: unknown): valor is Record<string, unknown> => {
  if (typeof valor !== 'object' || valor === null) return false;
  if (valor instanceof Date || Array.isArray(valor) || esDecimal(valor)) return false;
  const prototipo = Object.getPrototypeOf(valor);
  return prototipo === Object.prototype || prototipo === null;
};

/** Aplana una fila con notación de punto, dejando los arreglos fuera. */
const aplanar = (
  fila: Record<string, unknown>,
  prefijo = '',
): Record<string, string> => {
  const salida: Record<string, string> = {};
  for (const [clave, valor] of Object.entries(fila)) {
    const nombre = prefijo ? `${prefijo}.${clave}` : clave;
    if (esObjetoSimple(valor)) {
      Object.assign(salida, aplanar(valor, nombre));
    } else {
      salida[nombre] = textoDe(valor);
    }
  }
  return salida;
};

/** Convierte una ruta o clave con camelCase o guiones bajos en texto legible. */
const tituloHumano = (texto: string): string => {
  const titulo = texto
    .split(/(?=[A-Z])|_/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ')
    .trim() || 'Detalle';
  return titulo
    .replace(/\bNumero\b/g, 'Número')
    .replace(/\bMetodo\b/g, 'Método')
    .replace(/\bDia\b/g, 'Día')
    .replace(/\bCodigo\b/g, 'Código');
};

/** Recolecta los valores escalares de un reporte, sin periodo ni arreglos. */
const extraerEscalares = (contenido: unknown, prefijo = ''): [string, string][] => {
  if (contenido === null || contenido === undefined) return [];
  if (Array.isArray(contenido)) return [];
  if (contenido instanceof Date || esDecimal(contenido) || typeof contenido !== 'object') {
    if (prefijo === 'periodo' || prefijo.startsWith('periodo.') || prefijo === 'fecha') return [];
    return [[tituloHumano(prefijo), textoDe(contenido)]];
  }
  return Object.entries(contenido as Record<string, unknown>).flatMap(([clave, valor]) =>
    extraerEscalares(valor, prefijo ? `${prefijo}.${clave}` : clave),
  );
};

/** Encuentra todas las listas del reporte, en el orden del objeto. */
const extraerListas = (
  contenido: unknown,
  ruta = '',
): { ruta: string; filas: Record<string, string>[] }[] => {
  if (Array.isArray(contenido)) {
    const filas = contenido
      .filter((v) => !!v && typeof v === 'object' && !(v instanceof Date) && !esDecimal(v))
      .map((v) => aplanar(v as Record<string, unknown>));
    return [{ ruta: ruta || 'detalle', filas }];
  }
  if (contenido && typeof contenido === 'object') {
    return Object.entries(contenido as Record<string, unknown>).flatMap(([clave, valor]) =>
      extraerListas(valor, ruta ? `${ruta}.${clave}` : clave),
    );
  }
  return [];
};

/** Línea que acompaña al título: el periodo que refleja el reporte. */
const subtituloDe = (contenido: unknown): string | null => {
  const c = contenido as { periodo?: { fechaInicio?: unknown; fechaFin?: unknown }; fecha?: unknown };
  if (c?.periodo?.fechaInicio && c?.periodo?.fechaFin) {
    return `Periodo: del ${textoDe(c.periodo.fechaInicio).slice(0, 10)} al ${textoDe(c.periodo.fechaFin).slice(0, 10)}`;
  }
  if (c?.fecha) return `Día: ${textoDe(c.fecha).slice(0, 10)}`;
  return null;
};

/**
 * Genera el PDF del reporte completo en memoria.
 *
 * PDFKit es un flujo: los datos llegan por eventos, así que la promesa se
 * resuelve al terminar el documento y no antes.
 */
export const aPdf = (contenido: unknown, titulo: string): Promise<Buffer> =>
  new Promise((resolver, rechazar) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 96, bottom: 64, left: 56, right: 56 },
      bufferPages: true,
      info: {
        Title: titulo,
        Author: 'Sistema de gestión — Agua Tres Estrellas Pura',
        Subject: 'Reporte operativo',
        Creator: 'Sistema de gestión',
      },
    });

    const trozos: Buffer[] = [];
    doc.on('data', (t: Buffer) => trozos.push(t));
    doc.on('end', () => resolver(Buffer.concat(trozos)));
    doc.on('error', rechazar);

  // Banda superior en cada página que se agrega después de la primera.
  doc.on('pageAdded', () => {
    doc.rect(0, 0, doc.page.width, 4).fill('#1d4ed8');
  });

  const margenIzq = doc.page.margins.left;
  const margenDer = doc.page.margins.right;
  const ancho = doc.page.width - margenIzq - margenDer;
  const generado = aIsoFechaHora(new Date());

  // Cabecera de la primera página: banda, título y periodo.
  doc.rect(0, 0, doc.page.width, 4).fill('#1d4ed8');
  doc.font('Helvetica-Bold').fontSize(17).fillColor('#0f172a').text(titulo, margenIzq, 44, {
    width: ancho,
  });
  const subtitulo = subtituloDe(contenido);
  if (subtitulo) {
    doc.font('Helvetica').fontSize(10).fillColor('#64748b').text(subtitulo, margenIzq, 68, {
      width: ancho,
    });
  }

  const limiteY = () => doc.page.height - doc.page.margins.bottom;
  const relleno = 5;

  const dibujarTabla = (ruta: string, filas: Record<string, string>[]) => {
    const columnas = [...new Set(filas.flatMap((f) => Object.keys(f)))].map((clave) => ({
      clave,
      titulo: tituloHumano(clave),
    }));

    const anchoDisponible = ancho - columnas.length * 2;
    const pesoTotal = columnas.reduce((a, c) => a + Math.max(6, c.titulo.length + 4), 0);
    const anchos = columnas.map(
      (c) => (anchoDisponible * Math.max(6, c.titulo.length + 4)) / pesoTotal,
    );

    const celdaDe = (fila: Record<string, string>, columna: { clave: string; titulo: string }, i: number) => {
      const texto = fila[columna.clave] ?? '';
      const alineacion = /^-?\d[\d.,]*$/.test(texto.trim()) ? ('right' as const) : ('left' as const);
      return { texto, alineacion, ancho: anchos[i] };
    };

    const altoDe = (celdas: ReturnType<typeof celdaDe>[]) =>
      Math.max(...celdas.map((c) => doc.heightOfString(c.texto, { width: c.ancho - relleno * 2 }))) +
      relleno * 2;

    const dibujarCabecera = (y: number) => {
      doc.save();
      doc.rect(margenIzq, y, ancho, 18).fill('#1e293b');
      doc.font('Helvetica-Bold').fontSize(7).fillColor('#ffffff');
      let x = margenIzq;
      columnas.forEach((c, i) => {
        doc.text(c.titulo, x + relleno, y + 5.5, { width: anchos[i] - relleno * 2 });
        x += anchos[i];
      });
      doc.restore();
      return y + 18;
    };

    const dibujarFila = (y: number, fila: Record<string, string>, par: boolean) => {
      const celdas = columnas.map((c, i) => celdaDe(fila, c, i));
      const alto = altoDe(celdas);
      doc.save();
      if (par) doc.rect(margenIzq, y, ancho, alto).fill('#f8fafc');
      doc.font('Helvetica').fontSize(7).fillColor('#0f172a');
      let x = margenIzq;
      celdas.forEach((c) => {
        doc.text(c.texto, x + relleno, y + relleno, {
          width: c.ancho - relleno * 2,
          align: c.alineacion,
        });
        x += c.ancho;
      });
      doc.restore();
      return alto;
    };

    // Título de la sección.
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#1d4ed8').text(tituloHumano(ruta), {
      width: ancho,
    });
    doc.moveDown(0.15);

    if (filas.length === 0) {
      doc.font('Helvetica-Oblique').fontSize(7.5).fillColor('#64748b').text(
        'Sin registros en el periodo.',
        { width: ancho },
      );
      doc.moveDown(0.25);
      return;
    }

    let y = dibujarCabecera(doc.y + 2);
    for (let i = 0; i < filas.length; i++) {
      const alto = altoDe(columnas.map((c, j) => celdaDe(filas[i], c, j)));
      if (y + alto > limiteY()) {
        doc.addPage();
        y = dibujarCabecera(doc.page.margins.top + 12);
      }
      const usado = dibujarFila(y, filas[i], i % 2 === 1);
      y += usado;
      doc.moveTo(margenIzq, y)
        .lineTo(margenIzq + ancho, y)
        .lineWidth(0.3)
        .strokeColor('#e2e8f0')
        .stroke();
    }
    doc.y = y;
    doc.moveDown(0.4);
  };

  const escalares = extraerEscalares(contenido);
  if (escalares.length > 0) {
    dibujarTabla('Resumen del periodo', [
      Object.fromEntries(escalares.map(([c, v]) => [c, v])),
    ]);
  }

  for (const lista of extraerListas(contenido)) {
    dibujarTabla(lista.ruta, lista.filas);
  }

  // Pie de página en todas las páginas ya compuestas.
  const { count, start } = doc.bufferedPageRange();
  for (let i = start; i < start + count; i++) {
    doc.switchToPage(i);
    const p = doc.page;
    const anchoPagina = p.width - p.margins.left - p.margins.right;
    const y = p.height - p.margins.bottom + 20;
    doc.font('Helvetica').fontSize(8).fillColor('#64748b');
    doc.text(`Generado el ${generado}`, p.margins.left, y, { width: anchoPagina });
    doc.text(`Página ${i - start + 1} de ${count}`, p.margins.left, y, {
      width: anchoPagina,
      align: 'right',
    });
  }
  doc.flushPages();
    doc.end();
  });

/** Envía el reporte como PDF y termina la respuesta. */
export const responderPdf = async (
  res: Response,
  prefijo: string,
  contenido: unknown,
): Promise<Response> => {
  const buffer = await aPdf(contenido, `Reporte de ${prefijo.replace(/_/g, ' ')}`);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo(prefijo, 'pdf')}"`);
  return res.status(200).send(buffer);
};