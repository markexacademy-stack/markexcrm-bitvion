# Email deliverability audit

Date: 15 October 2026  
Product: MARKEX Trading Academy CRM (Bitvion CRM)  
Sender kept: `markexacademy@gmail.com` through Gmail SMTP  
This audit does not change DNS, rotate credentials, deploy, or send bulk mail.

## What the application is

The repository is a React, Vite, and TypeScript client with an Express and MongoDB server. Email is not sent from the browser. The client calls authenticated API routes. The server renders templates and sends them with Nodemailer when `SMTP_USER` and `SMTP_PASS` are set. A Resend path remains in the server for a later provider, and it is unused while those secrets are empty.

There is no Supabase project. Netlify function wrappers exist in `netlify/functions/api.ts` and `netlify/functions/email-queue.ts`, but this environment is still the local API. Credentials live in the gitignored root `.env`. They are not Vite variables and they are not in React source.

## Where mail is created

| Message | Trigger | Server path |
| --- | --- | --- |
| Payment receipt | Student create, and student update when `sendReceipt` is true | `server/src/routes/students.ts` → `queuePaymentReceipt` |
| Registration welcome | Older registration flow, not the simple Students form | template slug `registration-confirmation` |
| Class, batch, WhatsApp, and campaign mail | Existing server routes, not the simple CRM screens | `server/src/services/email.ts` |

`queuePaymentReceipt` writes an `EmailJob` only after the student document is saved, then waits for SMTP inside that request. Amounts, the pending balance, and the collected date are read from that student record and formatted in INR. They are not hardcoded. HTML variables go through `renderTemplate`, which escapes HTML. The idempotency key is `receipt:{studentId}:{amountCollected}:{pendingAmount}:{collectedDate}`. A repeated save with the same figures returns the existing job.

SMTP acceptance sets the job status to `sent` and stores a provider message id. That status means the mail server accepted the message. It does not mean the recipient’s inbox received it, and it does not mean Gmail filed it out of Spam.

## Verified causes

1. The payment receipt subject in `systemTemplates.ts` was `Welcome to MARKEX, {{student_name}}`. A receipt that announces itself as a welcome is a content mismatch. Gmail can treat that mismatch as bulk or unsolicited mail. The body also opened with welcome copy.
2. The configured display name was `MARKEX Forex Trading Academy`, while the requested sender name is `MARKEX Trading Academy`.
3. The app password is only in server configuration. A production client build was scanned and did not contain `SMTP_PASS`, `VITE_SMTP`, `smtp.gmail.com`, or a token prefix.
4. Public DNS lookups on 15 October 2026, using the resolver `218.248.112.97`, returned no TXT record and no MX record for `markex-academy.com`. `_dmarc.markex-academy.com` was NXDOMAIN. The SOA points at Netlify (`dns1.p01.nsone.net`, `domains+netlify.netlify.com`). SPF, DKIM, and DMARC on `markex-academy.com` therefore do not exist to authenticate `markexacademy@gmail.com`. Gmail authenticates its own `gmail.com` mailbox. Domain records for the website would not authenticate this From address even if they were added.
5. Earlier in this environment, SMTP to port 587 timed out once (`connect ETIMEDOUT`) and later succeeded, while port 465 timed out. Timeouts are a transport problem. They are not proof of Spam classification.

## Hypotheses, not measured again in this pass

- Personal Gmail SMTP reputation and consumer sending limits are a likely reason new recipients still see Spam after the content fixes. This pass did not send a live message and did not read a Gmail “Show original” result, so inbox placement was not re-measured.
- The previous receipt was image-heavy and used welcome wording. Those traits are consistent with bulk-mail classification. Removing them improves alignment. It does not guarantee the inbox.
- A `List-Unsubscribe` header had already been removed from SMTP sends before this audit. It is not present in the current SMTP payload.

## What was already safe

- Login uses an httpOnly session cookie and CSRF on authenticated mutations.
- Marketing consent and an unsubscribe path already exist. Hard-bounce handling existed for Resend webhooks only. Gmail SMTP has no bounce webhook.
- Retries already backed off and stopped after five attempts, but they retried permanent SMTP failures as well as timeouts.
- Payment records are not rewritten when a receipt is sent.

## Proposed changes (implemented after this audit)

- Keep Gmail SMTP on port 587 with STARTTLS. Fall back to port 465 only after a transient connection failure.
- Force the From name `MARKEX Trading Academy` and the From and Reply-To mailbox `markexacademy@gmail.com`.
- Use the receipt subject `Payment Receipt – MARKEX Trading Academy` and the welcome subject `Welcome to MARKEX Trading Academy` on the registration template only.
- Classify SMTP errors. Retry only transient failures, with exponential backoff, at most five attempts. Do not retry authentication failures, permanent rejections, or hard bounces. Suppress a hard-bounced address so it is not mailed again.
- Add an administrator diagnostics page that never returns the app password.
- Leave DNS unchanged and document the manual steps separately.

## Verification recorded with the audit

Automated tests, type checking, and the production build were run after the code changes. See `docs/EMAIL_DELIVERABILITY_IMPLEMENTATION.md` for the commands and results. No live email was sent by the test suite.
