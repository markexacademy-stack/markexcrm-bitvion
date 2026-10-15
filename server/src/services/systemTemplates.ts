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

This message confirms the payment record saved in Bitvion CRM.

Name:
{{student_name}}

Gender:
{{gender}}

Place:
{{place}}

Email:
{{email}}

Phone:
{{phone}}

Amount collected:
{{amount_collected}}

Pending amount:
{{pending_amount}}

Collected date:
{{collected_date}}

This email is a record of the amounts entered by the academy. It does not by itself confirm a bank transfer.

BITVION CRM

BUILDING BUSINESSES. CREATING GROWTH.

Support:
{{support_email}}`;

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
    subject: 'Welcome to MARKEX Trading Academy — Registration Received',
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
    name: 'BITVION — Payment receipt',
    subject: 'Your payment record — {{student_name}}',
    category: 'operational' as const,
    textBody: receiptText + FOOTER_TEXT,
    htmlBody: htmlFromText(receiptText + FOOTER_TEXT),
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
