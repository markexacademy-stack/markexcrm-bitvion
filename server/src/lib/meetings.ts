import { isHttpsUrl } from './crypto';
import { badRequest } from './http';

export function validateMeetingUrl(provider: string, url: string | undefined | null): string | undefined {
  if (!url || !url.trim()) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw badRequest('Meeting URL must be a valid URL.');
  }
  if (parsed.protocol !== 'https:') throw badRequest('Meeting URL must use HTTPS.');
  const host = parsed.hostname.toLowerCase();
  if (provider === 'Google Meet' && host !== 'meet.google.com') {
    throw badRequest('Google Meet links must use meet.google.com. Paste the actual meeting link.');
  }
  if (provider === 'Zoom' && host !== 'zoom.us' && !host.endsWith('.zoom.us')) {
    throw badRequest('Zoom links must use a zoom.us address. Paste the actual meeting link.');
  }
  if (provider === 'Microsoft Teams' && !['teams.microsoft.com', 'teams.live.com'].includes(host) && !host.endsWith('.teams.microsoft.com')) {
    throw badRequest('Microsoft Teams links must use a Microsoft Teams address.');
  }
  if (!isHttpsUrl(parsed.toString())) throw badRequest('Meeting URL must use HTTPS.');
  return parsed.toString();
}
