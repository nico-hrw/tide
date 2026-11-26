import { describe, expect, it } from 'vitest';
import { normalizeContact } from '../createContactsSlice';

describe('normalizeContact', () => {
  it('carries partner.public_key', () => {
    const c = normalizeContact({ partner: { id: 'u1', username: 'anna', public_key: 'PK' }, status: 'accepted' });
    expect(c).toMatchObject({ id: 'u1', username: 'anna', public_key: 'PK', status: 'accepted' });
  });
  it('carries flat public_key', () => {
    expect(normalizeContact({ id: 'u2', username: 'bob', public_key: 'K2' }).public_key).toBe('K2');
  });
});
