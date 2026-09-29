import jwt, { type SignOptions } from 'jsonwebtoken';
import { config } from '../config/env';
import { AppError } from './errors';

export interface TokenPayload {
  sub: number;
  email: string;
  rol: string;
  rolId: number;
  nombre: string;
}

export const firmarTokenAcceso = (payload: TokenPayload): string =>
  jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  } as SignOptions);

export const firmarTokenRefresh = (payload: { sub: number }): string =>
  jwt.sign({ sub: payload.sub, tipo: 'refresh' }, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn,
  } as SignOptions);

export const verificarTokenAcceso = (token: string): TokenPayload => {
  try {
    // `verify` devuelve string | JwtPayload; la firma se garantiza porque solo
    // se firma con firmarTokenAcceso, que exige el payload tipado completo.
    return jwt.verify(token, config.jwt.secret) as unknown as TokenPayload;
  } catch (e) {
    const expirado = e instanceof jwt.TokenExpiredError;
    throw new AppError(
      expirado ? 'Su sesión ha expirado, vuelva a iniciar sesión' : 'Token inválido',
      401,
      expirado ? 'TOKEN_EXPIRADO' : 'TOKEN_INVALIDO',
    );
  }
};

export const verificarTokenRefresh = (token: string): number => {
  try {
    // El refresh solo transporta el identificador del usuario, suficiente
    // para volver a firmar un token de acceso tras comprobar la sesión.
    const payload = jwt.verify(token, config.jwt.refreshSecret) as unknown as { sub: number };
    if (typeof payload.sub !== 'number') throw new Error('Refresh token sin identificador');
    return payload.sub;
  } catch {
    throw new AppError('Token de renovación inválido', 401, 'REFRESH_INVALIDO');
  }
};
