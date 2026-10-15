import crypto from 'node:crypto';

let cached: AppConfig | null = null;

export interface AppConfig {
  nodeEnv: string;
  port: number;
  mongodbUri: string;
  clientOrigins: string[];
  appPublicUrl: string;
  trustProxy: boolean;
  jwtSecret: string;
  webhookSecret: string;
  adminEmail: string;
  adminName: string;
  adminPassword: string;
  resendApiKey: string;
  emailFrom: string;
  resendWebhookSecret: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  googleClientEmail: string;
  googlePrivateKey: string;
  errorWebhookUrl: string;
  serveStatic: boolean;
}

function required(name: string, value: string | undefined): string {
  if (!value || !value.trim()) {
    throw new Error(`${name} is required. Copy .env.example to .env and set it before starting the CRM.`);
  }
  return value.trim();
}

export function getConfig(): AppConfig {
  if (cached) return cached;
  const nodeEnv = process.env.NODE_ENV || 'development';
  const jwtSecret = required('JWT_SECRET', process.env.JWT_SECRET);
  if (jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters.');
  }
  const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
  cached = {
    nodeEnv,
    port: Number(process.env.PORT || 4000),
    mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/markex_crm',
    clientOrigins: clientOrigin.split(',').map((item) => item.trim()).filter(Boolean),
    appPublicUrl: (process.env.APP_PUBLIC_URL || clientOrigin).replace(/\/$/, ''),
    trustProxy: process.env.TRUST_PROXY === 'true' || Boolean(process.env.NETLIFY),
    jwtSecret,
    webhookSecret: process.env.WEBHOOK_SECRET?.trim() || '',
    adminEmail: process.env.ADMIN_EMAIL?.trim().toLowerCase() || '',
    adminName: process.env.ADMIN_NAME?.trim() || 'MARKEX Admin',
    adminPassword: process.env.ADMIN_PASSWORD || '',
    resendApiKey: process.env.RESEND_API_KEY?.trim() || '',
    emailFrom: process.env.EMAIL_FROM?.trim() || '',
    resendWebhookSecret: process.env.RESEND_WEBHOOK_SECRET?.trim() || '',
    smtpHost: process.env.SMTP_HOST?.trim() || 'smtp.gmail.com',
    smtpPort: Number(process.env.SMTP_PORT || 587),
    smtpUser: process.env.SMTP_USER?.trim() || '',
    smtpPass: (process.env.SMTP_PASS || '').replace(/\s+/g, ''),
    googleClientEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() || '',
    googlePrivateKey: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    errorWebhookUrl: process.env.ERROR_WEBHOOK_URL?.trim() || '',
    serveStatic: nodeEnv === 'production' && !process.env.NETLIFY,
  };
  return cached;
}

export function resetConfigForTests(): void {
  cached = null;
}

export function smtpConfigured(): boolean {
  const config = getConfig();
  return Boolean(config.smtpUser && config.smtpPass);
}

export function emailProviderConfigured(): boolean {
  const config = getConfig();
  return smtpConfigured() || Boolean(config.resendApiKey && config.emailFrom);
}

export function sheetsConfigured(): boolean {
  const config = getConfig();
  return Boolean(config.googleClientEmail && config.googlePrivateKey);
}

export function webhookConfigured(): boolean {
  return getConfig().webhookSecret.length >= 24;
}

export function captureException(error: unknown, context: Record<string, unknown> = {}): void {
  const message = error instanceof Error ? error.message : 'Unknown error';
  const stack = error instanceof Error ? error.stack : undefined;
  console.error(JSON.stringify({ level: 'error', message, stack, context, time: new Date().toISOString() }));
  const url = process.env.ERROR_WEBHOOK_URL?.trim();
  if (!url) return;
  void fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message, stack, context, time: new Date().toISOString() }),
  }).catch(() => undefined);
}

export function newId(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}
