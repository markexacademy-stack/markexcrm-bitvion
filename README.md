# Bitvion CRM

A simple student and finance CRM from Bitvion Groups: student details, collected and pending amounts, automatic receipt email, spending, and company assets.

The public site is [https://markex-academy.com](https://markex-academy.com). This CRM does not create Google Forms, meeting links, WhatsApp invitations, or email delivery results. Those values are stored only after an administrator supplies them, and delivery counts change only when the provider accepts or confirms a message.

## What is included

- Signed-in administrator and staff access, with permissions enforced on the API
- Student records in MongoDB
- Registration Forms in the main navigation: store a real Google Form URL, copy it, open it, share it on WhatsApp, email it, and generate a QR code
- Google Apps Script webhook that creates or updates a student and queues one registration confirmation
- Courses, batches, class schedules, and reminder jobs
- Email templates, individual and bulk sends, suppression, and unsubscribe
- WhatsApp community invitation links
- Reports, CSV import, authorized CSV export, and audit logs

## Local setup

1. Copy the environment file and generate secrets:

```powershell
copy .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Set `JWT_SECRET`, `WEBHOOK_SECRET` (at least 24 characters), `ADMIN_EMAIL`, and `ADMIN_PASSWORD` (at least 10 characters, with a letter and a number).

2. Start MongoDB:

```powershell
docker compose up -d
```

3. Install and run the CRM:

```powershell
npm install
npm run dev
```

Open http://localhost:5173 and sign in with the administrator account. The API listens on http://localhost:4000. The Vite dev server proxies `/api`.

## Email

Leave `RESEND_API_KEY` and `EMAIL_FROM` empty until the sender is verified in Resend. Until then, messages remain `queued` and the dashboard does not count them as sent. Set `RESEND_WEBHOOK_SECRET` and point Resend at `POST /api/webhooks/email-provider` before confirmed deliveries are recorded.

## Google Forms

Follow [docs/GOOGLE_FORMS_SETUP.md](docs/GOOGLE_FORMS_SETUP.md). A form stays **Not tested** until **Test integration** succeeds. It is never labeled connected from an unsaved or failed check.

## Tests

```powershell
npm test
```

Server tests cover URL validation, WhatsApp link generation, template sections, webhook signatures, permissions, authentication, form creation, duplicate submissions, the welcome-email queue, batch email content, class reminders, and unsubscribe handling.

## Production

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) and [docs/BACKUPS.md](docs/BACKUPS.md).
