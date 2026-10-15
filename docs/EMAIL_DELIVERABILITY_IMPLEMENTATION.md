# Email deliverability implementation

Date: 15 October 2026  
Sender kept: Gmail SMTP for `markexacademy@gmail.com`  
No provider migration, DNS edit, credential rotation, deployment, or bulk send was performed.

## 1. Root cause and evidence

Verified in the repository:

- Mail is generated only on the server. The browser posts to `/api/students`. `queuePaymentReceipt` renders the `payment-receipt` template and sends it with Nodemailer.
- The receipt subject was `Welcome to MARKEX, {{student_name}}`, and the body opened as a welcome. A payment receipt must not use a welcome subject. That mismatch is a verified content defect.
- The From display name in the local environment was `MARKEX Forex Trading Academy`. The requested name is `MARKEX Trading Academy`.
- SMTP credentials are read from server environment variables. They are not referenced from the client source. The production client bundle did not contain the SMTP password, a `VITE_SMTP` variable, or `smtp.gmail.com`.
- Public DNS for `markex-academy.com` returned no TXT and no MX. `_dmarc.markex-academy.com` does not exist. The domain’s SOA is Netlify. Those records cannot authenticate a `@gmail.com` From address. Gmail authenticates `gmail.com` itself.

Hypothesis, not re-measured here:

- Personal Gmail reputation and the earlier welcome-style receipt are the likely reason new Gmail recipients saw Spam. This implementation does not claim the inbox. SMTP acceptance only means Gmail’s SMTP server accepted the message.

Previously observed, not repeated in this pass: a connection to `smtp.gmail.com:587` timed out once and later succeeded. Port 465 timed out. The sender still prefers port 587 with STARTTLS and tries 465 only after a transient connection error.

## 2. Changes implemented

- Receipt subject is exactly `Payment Receipt – MARKEX Trading Academy`. The registration welcome subject is exactly `Welcome to MARKEX Trading Academy`. The receipt body is a transactional receipt with the amount, date, and pending balance taken from the saved student, the public site `https://markex-academy.com/`, and the existing black logo treatment.
- From name is `MARKEX Trading Academy`. From, Reply-To, and the SMTP envelope use the authenticated Gmail mailbox.
- HTML and plain text are both sent, UTF-8 is set, and student-supplied values are escaped before HTML insertion.
- Transient SMTP failures retry with exponential backoff (2, 4, 8, 16 minutes) and stop after five attempts. Authentication failures, permanent rejections, and hard bounces are not retried. A hard bounce marks that address suppressed.
- Promotional mail still requires marketing consent and stops after unsubscribe or suppression. A payment receipt is operational and is not blocked by a marketing unsubscribe. Suppression and an operational opt-out still block it.
- Logs record the event, failure class, and recipient domain. Passwords and tokens are redacted before they are stored on a job.
- Administrators with `settings.manage` can open Mail → Email diagnostics. The page shows the sender, method, configuration flags, last SMTP acceptance time, recent redacted errors, bounce count, and template checks. “Test SMTP connection” and “Send test email” are limited to five calls per fifteen minutes. The app password is not returned.
- The payment receipt template is refreshed on server start. The welcome subject is updated on the existing registration template. Historical payment amounts are not rewritten.

### Files

- `server/src/lib/mailPolicy.ts` — subjects, sender identity, INR formatting, idempotency key, error class, retry rule, redaction, promotional consent.
- `server/src/lib/mailPolicy.test.ts` — unit coverage for those rules and a client-source secret scan.
- `server/src/services/email.ts` — SMTP identity, error handling, bounce suppression, diagnostics send, connection test.
- `server/src/services/systemTemplates.ts` — receipt and welcome copy.
- `server/src/services/receipt.ts` — INR formatting and the shared idempotency key.
- `server/src/services/seed.ts` — refresh the receipt template and the welcome subject.
- `server/src/routes/emails.ts` — admin diagnostics routes and the rate limit.
- `server/test/api.test.ts` — authorization and rate-limit coverage. No real SMTP send.
- `client/src/pages/MailDiagnostics.tsx` — diagnostics screen.
- `client/src/pages/Mail.tsx` — link and acceptance wording.
- `client/src/pages/Students.tsx` — receipt wording that does not claim the inbox.
- `client/src/App.tsx` — route `/mail/diagnostics`.
- `.env.example` — comments only. No secret values.
- `docs/EMAIL_DELIVERABILITY_AUDIT.md` — the audit.
- Local `.env` display name only. That file stays gitignored.

## 3. Environment configuration

Set these names on the server or in the Netlify function environment. Do not put them in Vite variables or in Git.

| Name | Purpose |
| --- | --- |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | `markexacademy@gmail.com` |
| `SMTP_PASS` | Google App Password, server only |
| `EMAIL_FROM` | `MARKEX Trading Academy <markexacademy@gmail.com>` |

`RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET` stay empty unless a later, approved provider is chosen.

Local file: copy `.env.example` to `.env` if needed, then set the names above. The running API reads `.env` on startup. Restart the API after a change. Do not print the file.

Netlify, when you choose to deploy later:

```text
npx netlify login
npx netlify env:set SMTP_HOST smtp.gmail.com
npx netlify env:set SMTP_PORT 587
npx netlify env:set SMTP_USER markexacademy@gmail.com
npx netlify env:set SMTP_PASS
npx netlify env:set EMAIL_FROM "MARKEX Trading Academy <markexacademy@gmail.com>"
```

Enter `SMTP_PASS` in the prompt. Do not pass the app password on the command line if the shell history is shared. `MONGODB_URI` must be a reachable database such as Atlas. The local MongoDB address is not reachable from Netlify.

## 4. DNS recommendations

Do not apply these until you approve them. No DNS record was changed.

Current public lookup (resolver `218.248.112.97`):

- `markex-academy.com` TXT: no answer. SOA is Netlify.
- `markex-academy.com` MX: no answer.
- `_dmarc.markex-academy.com`: NXDOMAIN.

Because the From address is `@gmail.com`, do not add an SPF record on `markex-academy.com` in order to authenticate this Gmail mailbox. That would not align SPF or DKIM with the Gmail From address, and a second SPF record must never be created later.

Gmail “Show original” is the check for the current sender. For messages Gmail itself signs, SPF and DKIM should refer to `gmail.com`. DMARC for `gmail.com` is Gmail’s policy, not a record you control on `markex-academy.com`.

A custom-domain sender is the later option if personal Gmail limits or reputation are not acceptable. Consumer Gmail SMTP is documented by Google at roughly 500 recipients per day. That limit was not measured against this mailbox. Do not migrate automatically.

If you later approve Google Workspace or a transactional provider for `markex-academy.com`:

1. Confirm whether any MX already receives business mail. The lookup above found none. Re-check in the Netlify DNS panel before adding MX, because a stale resolver answer is not a reason to delete mail routing.
2. Add only the SPF value the chosen provider supplies. If an SPF TXT already exists at that time, edit that one record. Do not add a second SPF TXT.
3. Add the DKIM TXT hostname and value exactly as the provider shows them. Do not invent a selector.
4. After SPF and DKIM verify, add one DMARC TXT at `_dmarc.markex-academy.com`, starting with `p=none` and a mailbox you read, then tighten the policy only after reports look clean.
5. Leave the website A and CNAME records that Netlify uses in place.

## 5. Deployment

Not deployed. When you want to deploy:

```text
npm run build
npx netlify deploy --build
```

Use `npx netlify deploy --build --prod` only after a preview deploy looks right. Set the environment names in section 3 first. Restarting the local API is enough to refresh the receipt template in the local database:

```text
npm run dev
```

If port 4000 is already in use, stop that process once and start it again. Do not start a second API.

## 6. Testing results

The suite uses mocked policy checks and the in-memory API. It does not send real email. There is no ESLint configuration in the repository. Typecheck is the static check.

Confirmation run:

- `npm run test -w server`: exit 0. 25 passed, 0 failed.
- `npm run test -w client`: exit 0. 1 passed, 0 failed.
- `npm run typecheck -w server`: exit 0.
- `npm run build`: exit 0. Client production assets and the server compile both completed.
- `client/dist` contained none of `SMTP_PASS`, `VITE_SMTP`, `smtp.gmail.com`, `swcnexpq`, or `ghp_`.

There is no ESLint configuration in the repository. Typecheck is the static check.

## 7. Gmail authentication verification

1. Send one test from Mail → Email diagnostics to a mailbox you control. Stay under the rate limit.
2. In Gmail, open the message, choose the three dots, then **Show original**.
3. Read SPF, DKIM, and DMARC. For this sender they should describe `gmail.com`, not `markex-academy.com`.
4. Look at the folder Gmail chose. This CRM cannot see that folder. `sent` in the CRM means SMTP accepted the message only.

## 8. Remaining limitations

- Inbox placement is not guaranteed. Personal Gmail reputation, volume, and recipient filtering can still file mail as Spam.
- Gmail does not provide a bounce or complaint webhook for this SMTP setup. The CRM records a bounce only when SMTP rejects the address, or when a future provider webhook reports one.
- Port 465 is a fallback for transient connection failures only. The configured method remains port 587 STARTTLS.
- A dedicated, domain-authenticated sender is the appropriate next step if daily volume or Spam placement stays unacceptable. That needs your approval, the provider’s exact DNS values, and a planned cutover that leaves the current Gmail mailbox working.
- Netlify hosting still needs `npx netlify login` and a hosted `MONGODB_URI`. Those steps were not run.
