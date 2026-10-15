import crypto from 'node:crypto';
import { sheetsConfigured } from '../config';

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

async function accessToken(clientEmail: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${payload}`;
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(privateKey).toString('base64url');
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
    signal: AbortSignal.timeout(10000),
  });
  const body = (await response.json()) as { access_token?: string; error_description?: string; error?: string };
  if (!response.ok || !body.access_token) {
    throw new Error(body.error_description || body.error || 'Google could not issue an access token.');
  }
  return body.access_token;
}

export async function readFormResponses(spreadsheetId: string): Promise<string[][]> {
  const { getConfig } = await import('../config');
  const config = getConfig();
  if (!sheetsConfigured()) {
    throw new Error('Google Sheets credentials are not configured.');
  }
  const token = await accessToken(config.googleClientEmail, config.googlePrivateKey);
  const metaResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties.title`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10000),
  });
  const meta = (await metaResponse.json()) as { error?: { message?: string }; sheets?: { properties?: { title?: string } }[] };
  if (!metaResponse.ok) throw new Error(meta.error?.message || 'The spreadsheet could not be read. Share it with the service account.');
  const title = meta.sheets?.[0]?.properties?.title;
  if (!title) throw new Error('The spreadsheet has no sheets.');
  const valuesResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(title)}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  });
  const values = (await valuesResponse.json()) as { error?: { message?: string }; values?: string[][] };
  if (!valuesResponse.ok) throw new Error(values.error?.message || 'Spreadsheet values could not be read.');
  return values.values || [];
}
