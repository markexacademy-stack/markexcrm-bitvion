export function registrationInviteMessage(formUrl: string): string {
  return [
    'Hello!',
    '',
    'Thank you for your interest in MARKEX TRADING ACADEMY.',
    '',
    'Please complete our official student registration form using the link below:',
    '',
    formUrl,
    '',
    'Kindly ensure that the information you provide is accurate.',
    '',
    'We look forward to welcoming you to MARKEX TRADING ACADEMY.',
    '',
    'TRADE WITH KNOWLEDGE.',
  ].join('\n');
}

export function whatsAppShareUrl(formUrl: string): string {
  return `https://wa.me/?text=${encodeURIComponent(registrationInviteMessage(formUrl))}`;
}

export function isWhatsAppInviteUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    if (host === 'chat.whatsapp.com') return url.pathname.length > 1;
    if (host === 'whatsapp.com' || host === 'www.whatsapp.com') return url.pathname.startsWith('/channel/');
    return false;
  } catch {
    return false;
  }
}
