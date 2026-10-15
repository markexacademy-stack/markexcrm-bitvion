import { describe, expect, it } from 'vitest';
import { integrationLabel } from '@/components/ui';

describe('integration status labels', () => {
  it('does not call an untested form connected', () => {
    expect(integrationLabel('not_tested')).toBe('Not tested');
    expect(integrationLabel('verified')).toBe('Verified');
    expect(integrationLabel('error')).not.toBe('Connected');
  });
});
