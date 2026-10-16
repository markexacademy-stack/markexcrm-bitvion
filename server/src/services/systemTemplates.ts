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

Welcome to MARKEX Trading Academy.

We are pleased to confirm that your registration payment has been received and recorded.

PAYMENT RECEIPT
Amount paid: {{amount_collected}}
Collected on: {{collected_date}}
Pending amount: {{pending_amount}}

STUDENT DETAILS
Name: {{student_name}}
Place: {{place}}
Phone: {{phone}}
Email: {{email}}

Please keep this message for your records.
Academy website: https://markex-academy.com/

With regards,
MARKEX Trading Academy
Trade with Knowledge
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
  .logo-bg, .logo-bg a, .logo-bg img { background-color:#000000 !important; background-image:linear-gradient(#000000,#000000) !important; }
  @media (prefers-color-scheme: dark) {
    .logo-bg, .logo-bg a, .logo-bg img { background-color:#000000 !important; background-image:linear-gradient(#000000,#000000) !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;">
    <tr><td align="center" style="padding:28px 14px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e4e4e7;">
        <tr>
          <td align="center" bgcolor="#000000" class="logo-bg" style="background-color:#000000;background-image:linear-gradient(#000000,#000000);padding:18px 24px;line-height:0;">
            <a href="https://markex-academy.com/" class="logo-bg" style="text-decoration:none;background-color:#000000;">
              <img class="logo-bg" src="https://markex-academy.com/brand/markex-logo.png" width="280" alt="MARKEX Trading Academy" style="display:block;width:280px;max-width:100%;height:auto;border:0;outline:none;background-color:#000000;background-image:linear-gradient(#000000,#000000);">
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 28px 8px;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.35;color:#18181b;">
            Welcome, {{student_name}}
          </td>
        </tr>
        <tr>
          <td style="padding:8px 28px 20px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.7;color:#3f3f46;">
            Thank you for joining <strong style="color:#18181b;">MARKEX Trading Academy</strong>. We are glad to have you with us, and this message confirms that your payment has been received.
          </td>
        </tr>
        <tr>
          <td style="padding:0 28px 8px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fafafa;border:1px solid #e4e4e7;">
              <tr>
                <td style="padding:18px 20px;font-family:Arial,Helvetica,sans-serif;">
                  <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#71717a;">Payment received</p>
                  <p style="margin:0 0 10px;font-size:28px;line-height:1.2;font-weight:700;color:#166534;">{{amount_collected}}</p>
                  <p style="margin:0;font-size:14px;line-height:1.6;color:#3f3f46;">
                    Collected on: {{collected_date}}<br>
                    Pending amount: {{pending_amount}}
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 28px 8px;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#71717a;">
            Student details
          </td>
        </tr>
        <tr>
          <td style="padding:0 28px 20px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.8;color:#3f3f46;">
            Name: {{student_name}}<br>
            Place: {{place}}<br>
            Phone: {{phone}}<br>
            Email: {{email}}
          </td>
        </tr>
        <tr>
          <td style="padding:0 28px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.7;color:#3f3f46;">
            Please keep this receipt for your records. You can visit the academy at
            <a href="https://markex-academy.com/" style="color:#166534;text-decoration:underline;">https://markex-academy.com/</a>.
          </td>
        </tr>
        <tr>
          <td style="padding:0 28px 28px;border-top:1px solid #e4e4e7;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.7;color:#71717a;">
            <p style="margin:20px 0 0;">With regards,<br>
            <strong style="color:#18181b;">MARKEX Trading Academy</strong><br>
            Trade with Knowledge<br>
            {{support_email}}</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
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
