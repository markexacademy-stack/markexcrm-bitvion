import { escapeHtml, isHttpsUrl } from './crypto';

const URL_KEYS = new Set([
  'registration_form_url',
  'website',
  'unsubscribe_url',
  'preferences_url',
  'whatsapp_community_section',
]);

export function renderTemplate(source: string, vars: Record<string, string>, mode: 'text' | 'html' = 'text'): string {
  const safeVars: Record<string, string> = {};
  for (const [key, value] of Object.entries(vars)) {
    const raw = value ?? '';
    if (URL_KEYS.has(key) && raw && !isHttpsUrl(raw) && !raw.startsWith('http://localhost')) {
      safeVars[key] = '';
    } else {
      safeVars[key] = raw;
    }
  }

  let output = source.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_match, key: string, inner: string) => {
    return safeVars[key]?.trim() ? inner : '';
  });

  output = output.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = safeVars[key] ?? '';
    return mode === 'html' ? escapeHtml(value) : value;
  });

  return output.replace(/Hello\s+,/g, 'Hello,').replace(/[ \t]+\n/g, '\n').trim();
}

export function textToHtmlParagraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="margin:0 0 16px;">${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export function wrapEmailHtml(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f1ec;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f1ec;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:16px;overflow:hidden;">
        <tr><td style="background:#0c0c0c;padding:28px 32px;">
          <div style="color:#ffffff;font-family:Arial,sans-serif;font-size:22px;letter-spacing:0.28em;font-weight:700;">MARKEX</div>
          <div style="color:#34d399;font-family:Arial,sans-serif;font-size:11px;letter-spacing:0.22em;margin-top:6px;">TRADING ACADEMY</div>
        </td></tr>
        <tr><td style="padding:32px;color:#1c1917;font-family:Arial,sans-serif;font-size:15px;line-height:1.65;">
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:0 32px 28px;color:#78716c;font-family:Arial,sans-serif;font-size:12px;line-height:1.5;">
          MARKEX TRADING ACADEMY · TRADE WITH KNOWLEDGE
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
