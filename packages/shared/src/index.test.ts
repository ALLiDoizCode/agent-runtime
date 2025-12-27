import { version } from './index';

describe('shared package', () => {
  it('should export version', () => {
    expect(version).toBe('0.1.0');
  });
});
