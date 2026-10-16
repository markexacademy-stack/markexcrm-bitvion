import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { renderTemplate } from './template';
import { RECEIPT_SUBJECT, WELCOME_SUBJECT, classifySmtpFailure, formatInr, paymentReceiptKey, promotionalSendAllowed, redactSecrets, retryDelayMs, senderIdentity, shouldRetry } from './mailPolicy';
import { SYSTEM_TEMPLATES } from '../services/systemTemplates';

const receiptHtml = `<p>Hello {{student_name}},</p><p>Amount paid: {{amount_collected}}</p><p>Received on {{collected_date}}</p><p>Pending: {{pending_amount}}</p>`;

describe('mail policy', () => {
  it('uses a combined welcome and payment receipt subject', () => {
    expect(RECEIPT_SUBJECT).toBe('Welcome to MARKEX Trading Academy – Payment Receipt');
    expect(WELCOME_SUBJECT).toBe('Welcome to MARKEX Trading Academy');
    expect(RECEIPT_SUBJECT.toLowerCase()).toContain('welcome');
    expect(RECEIPT_SUBJECT.toLowerCase()).toContain('payment');
  });

  it('keeps the sender and reply-to on the Gmail mailbox', () => {
    const identity = senderIdentity('markexacademy@gmail.com', 'Other Name <other@example.com>');
    expect(identity.from).toBe('MARKEX Trading Academy <markexacademy@gmail.com>');
    expect(identity.replyTo).toBe('markexacademy@gmail.com');
    expect(identity.envelopeFrom).toBe('markexacademy@gmail.com');
  });

  it('formats receipt amounts in INR and keeps the same idempotency key', () => {
    expect(formatInr(5000)).toContain('5,000');
    expect(formatInr(5000)).toContain('₹');
    expect(formatInr(Number.NaN)).toContain('0');
    const key = paymentReceiptKey('student-1', 5000, 1000, '15/10/2026');
    expect(key).toBe(paymentReceiptKey('student-1', 5000, 1000, '15/10/2026'));
    expect(key).not.toBe(paymentReceiptKey('student-1', 4000, 1000, '15/10/2026'));
  });

  it('sends a professional welcome with the payment receipt details', () => {
    const receipt = SYSTEM_TEMPLATES.find((item) => item.slug === 'payment-receipt');
    const welcome = SYSTEM_TEMPLATES.find((item) => item.slug === 'registration-confirmation');
    expect(receipt?.subject).toBe(RECEIPT_SUBJECT);
    expect(welcome?.subject).toBe(WELCOME_SUBJECT);
    expect(receipt?.htmlBody).toContain('https://markex-academy.com/');
    expect(receipt?.htmlBody).toContain('width="280"');
    expect(receipt?.htmlBody.toLowerCase()).toContain('welcome');
    expect(receipt?.htmlBody).toContain('Payment received');
    expect(receipt?.htmlBody).toContain('{{amount_collected}}');
    expect(receipt?.textBody).toContain('Amount paid');
    expect(receipt?.textBody.toLowerCase()).toContain('welcome');
  });

  it('escapes payment details placed in HTML', () => {
    const html = renderTemplate(receiptHtml, {
      student_name: 'Asha <script>',
      amount_collected: '₹5,000.00',
      collected_date: '15/10/2026',
      pending_amount: '₹1,000.00',
    }, 'html');
    expect(html).toContain('₹5,000.00');
    expect(html).toContain('15/10/2026');
    expect(html).toContain('₹1,000.00');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('classifies timeouts as temporary and unknown mailboxes as bounces', () => {
    expect(classifySmtpFailure('connect ETIMEDOUT 192.0.2.1:587')).toBe('transient');
    expect(classifySmtpFailure('535 Username and Password not accepted')).toBe('auth');
    expect(classifySmtpFailure('550 5.1.1 The email account that you tried to reach does not exist')).toBe('bounce');
    expect(shouldRetry('transient', 2)).toBe(true);
    expect(shouldRetry('transient', 5)).toBe(false);
    expect(shouldRetry('bounce', 1)).toBe(false);
    expect(shouldRetry('auth', 1)).toBe(false);
    expect(retryDelayMs(1)).toBe(120000);
    expect(retryDelayMs(2)).toBeGreaterThan(retryDelayMs(1));
  });

  it('blocks promotional mail after unsubscribe and allows a receipt to stay separate', () => {
    expect(promotionalSendAllowed({ marketing: true, unsubscribedAll: false, suppressed: false }).allowed).toBe(true);
    expect(promotionalSendAllowed({ marketing: true, unsubscribedAll: true, suppressed: false }).allowed).toBe(false);
    expect(promotionalSendAllowed(null).allowed).toBe(false);
  });

  it('redacts an app password from an error', () => {
    const secret = 'swcn-example-secret';
    expect(redactSecrets(`auth failed ${secret}`, [secret])).not.toContain(secret);
    expect(redactSecrets('Authorization: Bearer ghp_abcdefghijklmnopqrstuvwxyz012345')).toContain('[redacted]');
  });

  it('does not place SMTP credentials in the client source', () => {
    const root = path.resolve(__dirname, '../../../client/src');
    const files: string[] = [];
    const visit = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) visit(full);
        else if (/\.(tsx?|css|html)$/.test(entry)) files.push(full);
      }
    };
    visit(root);
    const source = files.map((file) => readFileSync(file, 'utf8')).join('\n');
    expect(source).not.toMatch(/SMTP_PASS|VITE_SMTP|smtp\.gmail\.com|swcnexpq/);
  });
});
