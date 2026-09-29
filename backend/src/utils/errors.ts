/**
 * Error de aplicación con código HTTP y código de negocio estable.
 * Los códigos de negocio permiten al frontend reacted de forma específica
 * sin depender del texto del mensaje.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly codigo: string;
  public readonly detalles?: unknown;

  constructor(
    message: string,
    statusCode = 500,
    codigo = 'ERROR_INTERNO',
    detalles?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.codigo = codigo;
    this.detalles = detalles;
    Error.captureStackTrace(this, AppError);
  }
}

export class ErrorValidacion extends AppError {
  constructor(message = 'Los datos enviados no son válidos', detalles?: unknown) {
    super(message, 422, 'VALIDACION', detalles);
    this.name = 'ErrorValidacion';
  }
}

export class ErrorNoAutorizado extends AppError {
  constructor(message = 'No autenticado') {
    super(message, 401, 'NO_AUTENTICADO');
    this.name = 'ErrorNoAutorizado';
  }
}

export class ErrorSinPermisos extends AppError {
  constructor(message = 'No tiene permisos para realizar esta acción') {
    super(message, 403, 'SIN_PERMISOS');
    this.name = 'ErrorSinPermisos';
  }
}

export class ErrorNoEncontrado extends AppError {
  constructor(recurso = 'Recurso') {
    super(`${recurso} no encontrado`, 404, 'NO_ENCONTRADO');
    this.name = 'ErrorNoEncontrado';
  }
}

export class ErrorConflicto extends AppError {
  constructor(message: string, codigo = 'CONFLICTO') {
    super(message, 409, codigo);
    this.name = 'ErrorConflicto';
  }
}

export class ErrorReglaNegocio extends AppError {
  constructor(message: string, codigo = 'REGLA_NEGOCIO') {
    super(message, 422, codigo);
    this.name = 'ErrorReglaNegocio';
  }
}
