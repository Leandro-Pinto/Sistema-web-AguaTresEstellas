/**
 * Logger mínimo en formato estructurado, sin dependencias externas.
 * En producción se escribe en stdout para que pueda recolectarse.
 */
type Nivel = 'info' | 'warn' | 'error' | 'debug';

const escribir = (nivel: Nivel, mensaje: string, contexto?: unknown): void => {
  const marca = new Date().toISOString();
  const linea = {
    ts: marca,
    nivel,
    mensaje,
    ...(contexto ? { contexto } : {}),
  };
  const salida = JSON.stringify(linea);
  if (nivel === 'error') process.stderr.write(`${salida}\n`);
  else process.stdout.write(`${salida}\n`);
};

export const logger = {
  info: (mensaje: string, contexto?: unknown) => escribir('info', mensaje, contexto),
  warn: (mensaje: string, contexto?: unknown) => escribir('warn', mensaje, contexto),
  error: (mensaje: string, contexto?: unknown) => escribir('error', mensaje, contexto),
  debug: (mensaje: string, contexto?: unknown) => {
    if (process.env.NODE_ENV !== 'production') escribir('debug', mensaje, contexto);
  },
};
