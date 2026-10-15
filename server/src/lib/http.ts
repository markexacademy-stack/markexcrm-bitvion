export class HttpError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, message: string, code = 'ERROR', details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function badRequest(message: string, details?: unknown): HttpError {
  return new HttpError(400, message, 'VALIDATION', details);
}

export function unauthorized(message = 'Authentication required'): HttpError {
  return new HttpError(401, message, 'UNAUTHORIZED');
}

export function forbidden(message = 'You do not have permission to perform this action.'): HttpError {
  return new HttpError(403, message, 'FORBIDDEN');
}

export function notFound(message = 'The requested record was not found.'): HttpError {
  return new HttpError(404, message, 'NOT_FOUND');
}

export function conflict(message: string): HttpError {
  return new HttpError(409, message, 'CONFLICT');
}
