import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import rateLimit from 'express-rate-limit';
import { getConfig } from './config';
import { errorHandler } from './middleware/errorHandler';
import apiRoutes from './routes';
import { webhookRouter } from './routes/platform';

export function createApp() {
  const config = getConfig();
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);
  app.use(helmet({
    contentSecurityPolicy: config.nodeEnv === 'production' ? undefined : false,
  }));
  app.use(cors({ origin: config.clientOrigins, credentials: true }));
  app.use('/api/webhooks', express.raw({ type: 'application/json', limit: '256kb' }), webhookRouter);
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());
  app.use(mongoSanitize());
  app.use('/api', rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again shortly.', details: null } },
  }));
  app.use('/api', apiRoutes);
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'The requested resource was not found.', details: null } });
  });

  if (config.serveStatic) {
    const clientDir = path.resolve(__dirname, '../../client/dist');
    app.use(express.static(clientDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        next();
        return;
      }
      res.sendFile(path.join(clientDir, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
