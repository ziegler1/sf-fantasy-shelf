import { ErrorRequestHandler } from 'express';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status: number =
    typeof err.status === 'number' ? err.status :
    typeof err.statusCode === 'number' ? err.statusCode : 500;

  if (status >= 500) console.error(err);

  res.status(status).json({ error: err.message ?? 'Internal server error' });
};
