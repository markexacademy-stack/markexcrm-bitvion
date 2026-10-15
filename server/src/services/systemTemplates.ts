import { RECEIPT_SUBJECT, WELCOME_SUBJECT } from '../lib/mailPolicy';
import { renderTemplate, textToHtmlParagraphs, wrapEmailHtml } from '../lib/template';

const FOOTER_TEXT = `

MARKEX TRADING ACADEMY
TRADE WITH KNOWLEDGE

{{#preferences_url}}
Email preferences:
{{preferences_url}}
{{/preferences_url}}`;

const invitationText = `Hello {{student_name}},

Thank you for your interest in MARKEX TRADING ACADEMY.

We invite you to complete our official student registration form so our team can review your details and understand your learning requirements.

REGISTER HERE:

{{registration_form_url}}

Please provide accurate information when completing the form.

Once your registration has been received, you will receive a confirmation email with information about the next steps.

Course:
{{course_name}}

If you have questions, contact our official support team.

MARKEX TRADING ACADEMY

TRADE WITH KNOWLEDGE.

Website:
https://markex-academy.com

Support:
{{support_email}}`;

const confirmationText = `Hello {{student_name}},

Welcome to MARKEX TRADING ACADEMY!

Thank you for completing our registration form.

We have successfully received your registration details.

Student ID:
{{student_id}}

Selected Course:
{{course_name}}

Registration Date:
{{registration_date}}

Our team will review your registration and provide relevant course or batch information when available.

Your registration confirmation does not automatically confirm payment or admission to a paid program.

Thank you for choosing MARKEX.

TRADE WITH KNOWLEDGE.

MARKEX TRADING ACADEMY

Website:
https://markex-academy.com

Support:
{{support_email}}`;

const batchText = `Hello {{student_name}},

Welcome to your next learning milestone with MARKEX TRADING ACADEMY.

Your batch information is now available.

Batch:
{{batch_name}}

Course:
{{course_name}}

Start Date:
{{batch_start_date}}

Time Zone:
{{batch_timezone}}

Instructor:
{{instructor_name}}

{{#class_schedule}}
CLASS SCHEDULE:
{{class_schedule}}

{{/class_schedule}}
{{#class_access_section}}
CLASS ACCESS:
{{class_access_section}}

{{/class_access_section}}
{{#whatsapp_community_section}}
WHATSAPP COMMUNITY:
{{whatsapp_community_section}}

Students choose whether to join. Opening this invitation does not add anyone automatically.

{{/whatsapp_community_section}}
Please check your schedule and use the official class links provided by the academy.

We look forward to supporting your learning journey.

TRADE WITH KNOWLEDGE.

MARKEX TRADING ACADEMY

Website:
https://markex-academy.com

Support:
{{support_email}}`;

function htmlFromText(text: string): string {
  return wrapEmailHtml(textToHtmlParagraphs(text));
}

const classText = `Hello {{student_name}},

{{class_notice}}

Class:
{{class_title}}

When:
{{class_when}}

Course:
{{course_name}}

Batch:
{{batch_name}}

Instructor:
{{instructor_name}}

{{#class_access_section}}
CLASS ACCESS:
{{class_access_section}}
{{/class_access_section}}

Please use only the class link provided by the academy.

MARKEX TRADING ACADEMY

TRADE WITH KNOWLEDGE.

Website:
https://markex-academy.com

Support:
{{support_email}}`;

const whatsappText = `Hello {{student_name}},

A WhatsApp community invitation is available for your MARKEX TRADING ACADEMY batch.

Joining is optional. Opening the invitation does not add you to the community automatically.

{{#whatsapp_community_section}}
WHATSAPP COMMUNITY:
{{whatsapp_community_section}}
{{/whatsapp_community_section}}

{{instructions}}

MARKEX TRADING ACADEMY

TRADE WITH KNOWLEDGE.

Website:
https://markex-academy.com

Support:
{{support_email}}`;

const receiptText = `Hello {{student_name}},

MARKEX Trading Academy has recorded your payment.

Amount paid: {{amount_collected}}
Collected on: {{collected_date}}
Pending amount: {{pending_amount}}

Name: {{student_name}}
Place: {{place}}
Phone: {{phone}}

Please keep this note for your records.
https://markex-academy.com/

MARKEX Trading Academy
{{support_email}}`;

const receiptHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  .logo-bg, .logo-bg img { background-color:#000000 !important; background-image:linear-gradient(#000000,#000000) !important; }
  @media (prefers-color-scheme: dark) {
    .logo-bg, .logo-bg img { background-color:#000000 !important; background-image:linear-gradient(#000000,#000000) !important; }
  }
</style>
</head>
<body style="margin:0;padding:16px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#1c1917;">
  <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 16px;">
    <tr><td class="logo-bg" bgcolor="#000000" style="background-color:#000000;background-image:linear-gradient(#000000,#000000);padding:8px 12px;line-height:0;">
      <img class="logo-bg" src="https://markex-academy.com/brand/markex-logo.png" width="220" alt="MARKEX Trading Academy" style="display:block;width:220px;max-width:220px;height:auto;border:0;background-color:#000000;background-image:linear-gradient(#000000,#000000);">
    </td></tr>
  </table>
  <p style="margin:0 0 12px;">Hello {{student_name}},</p>
  <p style="margin:0 0 12px;">MARKEX Trading Academy has recorded your payment.</p>
  <p style="margin:0 0 12px;">Amount paid: {{amount_collected}}<br>
  Collected on: {{collected_date}}<br>
  Pending amount: {{pending_amount}}</p>
  <p style="margin:0 0 12px;">Name: {{student_name}}<br>
  Place: {{place}}<br>
  Phone: {{phone}}</p>
  <p style="margin:0 0 12px;">Please keep this note for your records.<br>
  <a href="https://markex-academy.com/" style="color:#1c1917;">https://markex-academy.com/</a></p>
  <p style="margin:0;">MARKEX Trading Academy<br>{{support_email}}</p>
</body>
</html>`;

export const SYSTEM_TEMPLATES = [
  {
    slug: 'registration-invitation',
    name: 'MARKEX — Student Registration Invitation',
    subject: 'Begin Your Learning Journey with MARKEX Trading Academy',
    category: 'operational' as const,
    textBody: invitationText + FOOTER_TEXT,
    htmlBody: htmlFromText(invitationText + FOOTER_TEXT),
  },
  {
    slug: 'registration-confirmation',
    name: 'MARKEX — Registration Confirmation',
    subject: WELCOME_SUBJECT,
    category: 'operational' as const,
    textBody: confirmationText + FOOTER_TEXT,
    htmlBody: htmlFromText(confirmationText + FOOTER_TEXT),
  },
  {
    slug: 'batch-start',
    name: 'MARKEX — Batch Start and Community Access',
    subject: 'Your MARKEX Batch Details — {{batch_name}}',
    category: 'operational' as const,
    textBody: batchText + FOOTER_TEXT,
    htmlBody: htmlFromText(batchText + FOOTER_TEXT),
  },
  {
    slug: 'class-notification',
    name: 'MARKEX — Class Notification',
    subject: 'MARKEX class update — {{class_title}}',
    category: 'operational' as const,
    textBody: classText + FOOTER_TEXT,
    htmlBody: htmlFromText(classText + FOOTER_TEXT),
  },
  {
    slug: 'payment-receipt',
    name: 'MARKEX — Payment receipt',
    subject: RECEIPT_SUBJECT,
    category: 'operational' as const,
    textBody: receiptText,
    htmlBody: receiptHtml,
  },
  {
    slug: 'whatsapp-invitation',
    name: 'MARKEX — WhatsApp Community Invitation',
    subject: 'Your MARKEX WhatsApp community invitation',
    category: 'operational' as const,
    textBody: whatsappText + FOOTER_TEXT,
    htmlBody: htmlFromText(whatsappText + FOOTER_TEXT),
  },
];

export function renderStoredTemplate(template: { subject: string; htmlBody: string; textBody: string }, vars: Record<string, string>) {
  return {
    subject: renderTemplate(template.subject, vars, 'text'),
    html: renderTemplate(template.htmlBody, vars, 'html'),
    text: renderTemplate(template.textBody, vars, 'text'),
  };
}
