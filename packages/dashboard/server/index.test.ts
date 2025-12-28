import { version } from './index';

describe('dashboard package', () => {
  it('should export version', () => {
    expect(version).toBe('0.1.0');
  });
});
