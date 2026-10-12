# Evidencias reales

Esta carpeta es la única fuente autorizada para las cifras del postest de la
tesis. Todo lo que se guarde aquí debe haber salido del sistema funcionando con
la operación real de la empresa.

## Qué se guarda aquí

Los archivos que respaldan cada tabla del capítulo de resultados:

| Archivo | Cómo se obtiene |
|---|---|
| `indicadores-proceso.json` | `GET /api/reportes/indicadores/proceso` |
| `indicadores-sistema.json` | `GET /api/reportes/indicadores/sistema` |
| `comparativo.json` | `POST /api/reportes/indicadores/comparativo` con el pretest transcrito |
| `reportes-*.csv` | `GET /api/reportes/{reporte}?formato=csv` |
| `reportes-*.pdf` | `GET /api/reportes/{reporte}?formato=pdf` |
| `suite-pruebas.txt` | `npm test` (backend) |
| `suite-pruebas-frontend.txt` | `npx vitest run` (frontend) |

## Condiciones

1. **Entorno `prod`.** En `backend/.env`, `ENTORNO="prod"` y `DATABASE_URL`
   apuntando a la base de la operación real. Con otro entorno, la base de
   datos no sería la que sostiene la medición.
2. **Sin `origen` en la URL.** Los reportes leen `REAL` por omisión, así que no
   hay que pasar nada. Si se pasara `origen=SIMULADO`, el sistema lo rechazaría
   fuera del entorno de demostración y devolvería los datos reales con una nota
   en el mensaje.
3. **Periodo declarado.** Anotar en el nombre del archivo o en un
   `README.md` de la carpeta qué periodo cubre y en qué fecha se capturó.
4. **Sin datos sintéticos.** El simulador no arranca con `ENTORNO="prod"`: se
   detiene antes de escribir. Esa barrera está probada en
   `backend/tests/origen-datos.test.ts`.

## Qué NO va aquí

- Nada generado por `backend/scripts/simulador-proceso.ts`. Sus archivos están
  en [`../demo-simulado/`](../demo-simulado/) y se explican en
  [`../docs/datos-de-demostracion.md`](../docs/datos-de-demostracion.md).
- Ningún reporte capturado en el entorno `demo`, aunque contenga datos que
  "parezcan" reales: llevan la marca `SIMULADO` en cada fila.
- Marcadores de posición en lugar de mediciones. Si un valor del pretest o de un
  indicador es un supuesto, tiene que estar escrito como tal en el texto, no
  escondido en un JSON.

## Estado actual

La carpeta está vacía. La medición del postest todavía no se ha realizado sobre
la operación real; ver la sección 13 de
[`../docs/datos-de-demostracion.md`](../docs/datos-de-demostracion.md) para lo
que falta.