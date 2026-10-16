export function formatInr(value: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0);
}

export function paymentReceiptKey(studentId: string, amountCollected: number, pendingAmount: number, collectedDate: string): string {
  return `receipt:${studentId}:${amountCollected}:${pendingAmount}:${collectedDate}`;
}

export const RECEIPT_SUBJECT = 'Welcome to MARKEX Trading Academy – Payment Receipt';
export const WELCOME_SUBJECT = 'Welcome to MARKEX Trading Academy';
export const FROM_NAME = 'MARKEX Trading Academy';

export type SmtpFailureKind = 'transient' | 'permanent' | 'auth' | 'bounce';

const SECRET_PATTERNS = [
  /smtp[_-]?pass(?:word)?\s*[:=]\s*\S+/gi,
  /authorization:\s*bearer\s+\S+/gi,
  /ghp_[A-Za-z0-9]+/g,
];

export function redactSecrets(message: string, secrets: string[] = []): string {
  let output = message;
  for (const secret of secrets) {
    const trimmed = secret.trim();
    if (trimmed.length >= 4) output = output.split(trimmed).join('[redacted]');
  }
  for (const pattern of SECRET_PATTERNS) output = output.replace(pattern, '[redacted]');
  return output;
}

export function mailboxAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] || value).trim();
}

export function senderIdentity(smtpUser: string, emailFrom = ''): { from: string; replyTo: string; envelopeFrom: string } {
  const user = smtpUser.trim();
  const configured = mailboxAddress(emailFrom);
  const address = user || configured;
  return {
    from: address ? `${FROM_NAME} <${address}>` : FROM_NAME,
    replyTo: address,
    envelopeFrom: address,
  };
}

export function retryDelayMs(attempt: number): number {
  const bounded = Math.min(Math.max(attempt, 1), 5);
  return 2 ** bounded * 60 * 1000;
}

export function classifySmtpFailure(message: string): SmtpFailureKind {
  const text = message.toLowerCase();
  if (/invalid login|authentication (failed|unsuccessful)|username and password not accepted|535|534/.test(text)) return 'auth';
  if (/5\.1\.1|5\.1\.2|user unknown|mailbox (not found|unavailable)|recipient address rejected|no such user|undeliverable/.test(text)) return 'bounce';
  if (/\b550\b|\b551\b|\b553\b|\b554\b|permanent/.test(text) && !/4\d\d/.test(text)) return 'permanent';
  if (/etimedout|econnrefused|econnreset|esocket|timed out|greeting never received|421|450|451|452|temporary|try again/.test(text)) return 'transient';
  if (/\b5\d\d\b/.test(text)) return 'permanent';
  return 'transient';
}

export function promotionalSendAllowed(consent: { marketing?: boolean; unsubscribedAll?: boolean; suppressed?: boolean } | null | undefined): { allowed: boolean; reason: string } {
  if (consent?.suppressed) return { allowed: false, reason: 'This address is on the suppression list.' };
  if (!consent || consent.unsubscribedAll || !consent.marketing) return { allowed: false, reason: 'The recipient has not granted marketing consent or has unsubscribed.' };
  return { allowed: true, reason: '' };
}

export function shouldRetry(kind: SmtpFailureKind, attempts: number, limit = 5): boolean {
  if (kind === 'bounce' || kind === 'auth' || kind === 'permanent') return false;
  return attempts < limit;
}
