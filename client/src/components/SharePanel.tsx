import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { ApiError, api } from '@/api/client';
import { Alert, Button } from '@/components/ui';

export interface ShareLinks {
  formName: string;
  courseName: string;
  publicFormUrl: string;
  whatsappUrl: string;
  sharingEnabled: boolean;
}

export async function copyText(text: string): Promise<'copied' | 'manual'> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return 'copied';
    }
  } catch {
    return 'manual';
  }
  return 'manual';
}

export function SharePanel({ formId }: { formId: string }) {
  const [links, setLinks] = useState<ShareLinks | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [manual, setManual] = useState(false);
  const [qr, setQr] = useState('');
  const [email, setEmail] = useState('');
  const [studentName, setStudentName] = useState('');
  const [templates, setTemplates] = useState<{ _id: string; name: string }[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [preview, setPreview] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    void api<ShareLinks>(`/api/registration-forms/${formId}/share-links`).then(async (result) => {
      setLinks(result);
      if (result.publicFormUrl) setQr(await QRCode.toDataURL(result.publicFormUrl, { margin: 1, width: 280 }));
    }).catch((reason) => setError(reason instanceof ApiError ? reason.message : 'The form link could not be loaded.'));
    void api<{ data: { _id: string; name: string }[] }>('/api/email-templates').then((result) => setTemplates(result.data)).catch(() => undefined);
  }, [formId]);

  async function track(channel: 'copied' | 'opened' | 'whatsapp' | 'qr') {
    if (!links?.sharingEnabled) return;
    await api(`/api/registration-forms/${formId}/share-events`, { method: 'POST', body: JSON.stringify({ channel }) }).catch(() => undefined);
  }

  async function copy() {
    if (!links) return;
    const result = await copyText(links.publicFormUrl);
    if (result === 'copied') {
      setNotice('Registration link copied.');
      setManual(false);
      await track('copied');
    } else {
      setManual(true);
      setNotice('Clipboard access was blocked. Select the link below and copy it manually.');
    }
  }

  async function loadPreview() {
    if (!links) return;
    const chosen = templateId || templates.find((item) => item.name.includes('Registration Invitation'))?._id || templates[0]?._id;
    if (!chosen) return;
    const rendered = await api<{ text: string }>(`/api/email-templates/${chosen}/preview`, {
      method: 'POST',
      body: JSON.stringify({ variables: { student_name: studentName, course_name: links.courseName, registration_form_url: links.publicFormUrl } }),
    });
    setPreview(rendered.text);
  }

  async function sendEmail() {
    setSending(true);
    setError('');
    try {
      const result = await api<{ status: string; error?: string | null }>(`/api/registration-forms/${formId}/share-email`, {
        method: 'POST',
        body: JSON.stringify({ recipientEmail: email, studentName, templateId: templateId || undefined }),
      });
      setNotice(result.status === 'queued'
        ? 'The invitation was queued. It is not marked sent until the email provider accepts it.'
        : `The invitation was recorded as ${result.status}${result.error ? `: ${result.error}` : ''}.`);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'The email could not be queued.');
    } finally {
      setSending(false);
    }
  }

  async function downloadQr() {
    if (!links || !qr) return;
    const image = new Image();
    image.src = qr;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 360;
    canvas.height = 460;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#111111';
    context.font = '700 18px Outfit, sans-serif';
    context.textAlign = 'center';
    context.fillText('MARKEX TRADING ACADEMY', 180, 40);
    context.fillStyle = '#047857';
    context.font = '600 13px Outfit, sans-serif';
    context.fillText('STUDENT REGISTRATION', 180, 64);
    context.drawImage(image, 40, 88, 280, 280);
    const anchor = document.createElement('a');
    anchor.href = canvas.toDataURL('image/png');
    anchor.download = 'markex-student-registration-qr.png';
    anchor.click();
    await track('qr');
  }

  if (error && !links) return <Alert>{error}</Alert>;
  if (!links) return <p className="text-sm text-stone-500">Loading the registration link…</p>;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="space-y-5">
        {!links.sharingEnabled ? <Alert tone="amber">Sharing is disabled for this form. The URL remains visible here for administration, and distribution actions stay off.</Alert> : null}
        {notice ? <Alert tone="emerald">{notice}</Alert> : null}
        {error ? <Alert>{error}</Alert> : null}
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-stone-500">Form</p>
          <p className="mt-1 font-medium">{links.formName}</p>
          <p className="text-sm text-stone-600">Course: {links.courseName || 'Not associated'}</p>
        </div>
        <div>
          <p className="label">Public registration URL</p>
          <input className="field" readOnly value={links.publicFormUrl} onFocus={(event) => event.currentTarget.select()} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void copy()} disabled={!links.sharingEnabled}>Copy link</Button>
          <a className="btn-secondary" href={links.publicFormUrl} target="_blank" rel="noreferrer noopener" onClick={() => void track('opened')}>Open form</a>
          <a className={`btn-secondary ${links.sharingEnabled ? '' : 'pointer-events-none opacity-50'}`} href={links.sharingEnabled ? links.whatsappUrl : undefined} target="_blank" rel="noreferrer noopener" onClick={() => void track('whatsapp')}>Share on WhatsApp</a>
        </div>
        {manual ? <p className="text-sm text-stone-600">Select the URL above and copy it with your keyboard.</p> : null}
        <p className="text-xs text-stone-500">WhatsApp opens the sharing screen so you can choose the recipient. The CRM does not send the WhatsApp message for you.</p>
        <div className="grid gap-3 rounded-2xl border border-stone-200 p-4">
          <h3 className="font-medium">Send by email</h3>
          <input className="field" placeholder="Recipient email" value={email} onChange={(event) => setEmail(event.target.value)} />
          <input className="field" placeholder="Student name (optional)" value={studentName} onChange={(event) => setStudentName(event.target.value)} />
          <select className="field" value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
            <option value="">MARKEX — Student Registration Invitation</option>
            {templates.map((template) => <option key={template._id} value={template._id}>{template.name}</option>)}
          </select>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => void loadPreview()}>Preview</Button>
            <Button type="button" onClick={() => void sendEmail()} disabled={!links.sharingEnabled || sending || !email}>{sending ? 'Queuing…' : 'Send invitation'}</Button>
          </div>
          {preview ? <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-stone-50 p-3 text-xs text-stone-700">{preview}</pre> : null}
        </div>
      </div>
      <div className="print-area rounded-2xl border border-stone-200 bg-white p-4 text-center">
        <p className="text-xs font-semibold tracking-[0.16em]">MARKEX TRADING ACADEMY</p>
        <p className="mt-1 text-xs font-semibold tracking-[0.14em] text-emerald-700">STUDENT REGISTRATION</p>
        {qr ? <img src={qr} alt="QR code for the student registration form" className="mx-auto mt-3 w-52" /> : null}
        <div className="mt-3 flex flex-wrap justify-center gap-2 print:hidden">
          <Button type="button" variant="secondary" onClick={() => void downloadQr()} disabled={!links.sharingEnabled || !qr}>Download PNG</Button>
          <Button type="button" variant="ghost" onClick={() => window.print()} disabled={!links.sharingEnabled}>Print</Button>
        </div>
      </div>
    </div>
  );
}
