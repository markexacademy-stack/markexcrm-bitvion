import { describe, expect, it } from 'vitest';
import { parseGoogleFormUrl } from './googleFormUrl';
import { registrationInviteMessage, whatsAppShareUrl, isWhatsAppInviteUrl } from './whatsapp';
import { renderTemplate } from './template';
import { signWebhook, verifyWebhookSignature } from './crypto';
import { hasPermission } from './constants';
import { validateMeetingUrl } from './meetings';

describe('Google Form URLs', () => {
  it('accepts a published Google Form URL and canonicalizes it', () => {
    const parsed = parseGoogleFormUrl('https://docs.google.com/forms/d/e/1FAIpQLSdExampleFormId/viewform?usp=sharing');
    expect(parsed).toEqual({
      publicFormUrl: 'https://docs.google.com/forms/d/e/1FAIpQLSdExampleFormId/viewform',
      publishedFormId: '1FAIpQLSdExampleFormId',
    });
  });

  it('rejects shortened and non-Google URLs', () => {
    expect(parseGoogleFormUrl('https://forms.gle/not-a-full-url')).toBeNull();
    expect(parseGoogleFormUrl('https://example.com/forms/d/e/abc/viewform')).toBeNull();
  });
});

describe('WhatsApp sharing', () => {
  it('encodes the registration URL and does not claim delivery', () => {
    const formUrl = 'https://docs.google.com/forms/d/e/abc123/viewform';
    const share = whatsAppShareUrl(formUrl);
    expect(share.startsWith('https://wa.me/?text=')).toBe(true);
    const message = decodeURIComponent(share.split('text=')[1]);
    expect(message).toBe(registrationInviteMessage(formUrl));
    expect(message).toContain(formUrl);
    expect(message.toLowerCase()).not.toContain('has been delivered');
  });

  it('accepts only WhatsApp invitation URLs', () => {
    expect(isWhatsAppInviteUrl('https://chat.whatsapp.com/AbCdEf123')).toBe(true);
    expect(isWhatsAppInviteUrl('https://example.com/invite')).toBe(false);
  });
});

describe('templates', () => {
  it('omits empty class and community sections', () => {
    const source = 'Hello {{student_name}},\n{{#class_access_section}}\nCLASS ACCESS:\n{{class_access_section}}\n{{/class_access_section}}\n{{#whatsapp_community_section}}\nWHATSAPP:\n{{whatsapp_community_section}}\n{{/whatsapp_community_section}}';
    const rendered = renderTemplate(source, { student_name: 'Asha', class_access_section: '', whatsapp_community_section: '' });
    expect(rendered).toContain('Hello Asha,');
    expect(rendered).not.toContain('CLASS ACCESS');
    expect(rendered).not.toContain('WHATSAPP');
  });

  it('drops unsafe urls instead of placing them in the message', () => {
    const rendered = renderTemplate('Link: {{registration_form_url}}', { registration_form_url: 'javascript:alert(1)' }, 'html');
    expect(rendered).not.toContain('javascript:');
  });
});

describe('webhook signatures', () => {
  it('verifies an HMAC signature', () => {
    const signature = signWebhook('test-secret', '1700000000', '{"ok":true}');
    expect(verifyWebhookSignature('test-secret', '1700000000', '{"ok":true}', signature)).toBe(true);
    expect(verifyWebhookSignature('test-secret', '1700000000', '{"ok":true}', 'deadbeef')).toBe(false);
  });
});

describe('permissions', () => {
  it('gives administrators every permission and limits staff', () => {
    expect(hasPermission('admin', [], 'exports.sensitive')).toBe(true);
    expect(hasPermission('staff', ['students.view'], 'exports.sensitive')).toBe(false);
    expect(hasPermission('staff', ['forms.share'], 'forms.share')).toBe(true);
  });
});

describe('meeting links', () => {
  it('requires a real provider host', () => {
    expect(validateMeetingUrl('Google Meet', 'https://meet.google.com/abc-defg-hij')).toContain('meet.google.com');
    expect(() => validateMeetingUrl('Zoom', 'https://example.com/meeting')).toThrow(/zoom\.us/);
    expect(validateMeetingUrl('Google Meet', '')).toBeUndefined();
  });
});
