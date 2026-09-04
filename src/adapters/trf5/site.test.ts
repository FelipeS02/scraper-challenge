import { describe, expect, it } from 'vitest';
import { identityKeyName, resultPageCap } from './site.js';

describe('TRF5 declared SitePort constants (trf5-adapter spec)', () => {
  it('declares a result-page cap of 30', () => {
    expect(resultPageCap).toBe(30);
  });

  it('declares processNumber as the item identity key', () => {
    expect(identityKeyName).toBe('processNumber');
  });
});
