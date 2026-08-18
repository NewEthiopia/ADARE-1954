// Shared HTTP helpers: envelope, errors, async wrapper, validation
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const ok = (res, data = {}, message = 'OK', status = 200) =>
  res.status(status).json({ ok: true, data, message });

export const fail = (status, code, message) => new ApiError(status, code, message);

export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req[source]);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return next(fail(422, 'VALIDATION', `${first.path.join('.') || 'input'}: ${first.message}`));
    }
    req[source === 'body' ? 'body' : source] = parsed.data;
    next();
  };
}

export function errorHandler(err, req, res, _next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ ok: false, code: err.code, error: err.message, message: err.message });
  }
  const databaseUnavailable = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', '57P01', '57P03', '3D000'].includes(err.code)
    || /database|postgres|connection|connect econn|does not exist/i.test(err.message || '');
  if (databaseUnavailable) {
    console.error(`[server] ${req.method} ${req.path}: database unavailable`);
    return res.status(503).json({
      ok: false,
      code: 'DATABASE_UNAVAILABLE',
      error: 'The production database is not connected. Configure DATABASE_URL in Render before signing in.',
      message: 'The production database is not connected. Configure DATABASE_URL in Render before signing in.',
    });
  }
  // Never leak stack traces or SQL to clients
  console.error(`[server] ${req.method} ${req.path}:`, err.message);
  res.status(500).json({ ok: false, code: 'SERVER_ERROR', error: 'An unexpected server error occurred.', message: 'An unexpected server error occurred.' });
}
