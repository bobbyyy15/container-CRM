import crypto from 'node:crypto';
import { NextFunction, Request, Response } from 'express';

export const requestContext = (req: Request, res: Response, next: NextFunction) => {
  req.requestId = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);

  const startedAt = Date.now();
  res.on('finish', () => {
    console.info(JSON.stringify({
      level: 'info',
      event: 'http_request',
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
    }));
  });

  next();
};
