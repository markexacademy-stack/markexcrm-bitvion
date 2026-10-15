# Deployment

## Requirements

- Node.js 22
- MongoDB 7
- HTTPS in front of the Node process
- Environment variables from `.env.example`

Do not commit `.env`. `JWT_SECRET` and `WEBHOOK_SECRET` must be unique random values of at least 32 and 24 characters. Create the first administrator with `ADMIN_EMAIL` and `ADMIN_PASSWORD` before the first boot, then remove the password from the environment if the host allows it after the account exists. The password is only used when the user collection is empty.

## Process

```powershell
npm ci
npm run build
$env:NODE_ENV = "production"
$env:TRUST_PROXY = "true"
npm start
```

In production the API serves the built client from `client/dist` on `PORT` (default 4000). Set `CLIENT_ORIGIN` and `APP_PUBLIC_URL` to the public HTTPS origin. Unsubscribe links use `APP_PUBLIC_URL`.

`docker compose up -d` starts MongoDB with a named volume. The root `Dockerfile` builds the client and server. Pass the same environment variables to the container and point `MONGODB_URI` at the database host.

## Reverse proxy

Terminate TLS at the proxy and forward to the Node port. Set `TRUST_PROXY=true` so rate limits see the client address. Keep CORS limited to `CLIENT_ORIGIN`.

## Background work

The API process polls MongoDB for due email jobs and scheduled campaigns. Jobs survive a restart because they stay in the database. Run one API instance, or accept that the worker lock is a short lease intended for a single process.

## Email and Google

- Verify the sending domain in Resend before setting `EMAIL_FROM`.
- Point the Resend webhook to `https://your-host/api/webhooks/email-provider` and set `RESEND_WEBHOOK_SECRET`.
- Point Apps Script to `https://your-host/api/webhooks/google-form`.

## Errors

Application errors are written as single-line JSON. Set `ERROR_WEBHOOK_URL` to POST those sanitized reports to a monitor. The payload does not include request secrets.

## Backups

See [BACKUPS.md](BACKUPS.md).
