import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../models/errors.js';

interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: AppError['details'];
  };
}

/** body-parser marks its client errors (malformed JSON, oversized body) with a 4xx `status`. */
function getClientErrorStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null || !('status' in error)) return null;
  const { status } = error;
  return typeof status === 'number' && status >= 400 && status < 500 ? status : null;
}

export const notFoundHandler: RequestHandler = (req, res) => {
  const body: ErrorBody = { error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.originalUrl.split('?')[0]} not found` } };
  res.status(404).json(body);
};

export const errorHandler: ErrorRequestHandler = (error: unknown, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof AppError) {
    const body: ErrorBody = { error: { code: error.code, message: error.message, details: error.details } };
    res.status(error.statusCode).json(body);
    return;
  }

  const clientStatus = getClientErrorStatus(error);
  if (clientStatus !== null) {
    const body: ErrorBody = { error: { code: 'BAD_REQUEST', message: 'The request body could not be processed' } };
    res.status(clientStatus).json(body);
    return;
  }

  console.error(`[error] ${req.method} ${req.originalUrl}`, error);
  const body: ErrorBody = { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } };
  res.status(500).json(body);
};
