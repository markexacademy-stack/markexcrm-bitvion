const FORM_URL = /^https:\/\/docs\.google\.com\/forms\/d\/(e\/)?([a-zA-Z0-9_-]+)\/(?:viewform|edit|formResponse)(?:[/?#].*)?$/;

export interface ParsedGoogleFormUrl {
  publicFormUrl: string;
  publishedFormId: string;
}

export function parseGoogleFormUrl(input: string): ParsedGoogleFormUrl | null {
  const trimmed = input.trim();
  const match = FORM_URL.exec(trimmed);
  if (!match) return null;
  const published = Boolean(match[1]);
  const publishedFormId = match[2];
  const publicFormUrl = published
    ? `https://docs.google.com/forms/d/e/${publishedFormId}/viewform`
    : `https://docs.google.com/forms/d/${publishedFormId}/viewform`;
  return { publicFormUrl, publishedFormId };
}

export async function checkPublicFormUrl(url: string): Promise<{ ok: boolean; httpStatus?: number; error?: string }> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
      headers: { 'user-agent': 'MARKEX-CRM-Form-Check' },
    });
    const finalUrl = response.url || url;
    const onGoogleForms = finalUrl.includes('://docs.google.com/forms/');
    if (!response.ok || !onGoogleForms) {
      return {
        ok: false,
        httpStatus: response.status,
        error: onGoogleForms
          ? `The form URL responded with HTTP ${response.status}.`
          : 'The form URL did not resolve to a Google Forms page.',
      };
    }
    return { ok: true, httpStatus: response.status };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'The form URL could not be reached.' };
  }
}
