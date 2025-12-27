/** @type {import('jest').Config} */
module.exports = {
  displayName: 'shared',
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/__mocks__/**',
    '!src/index.ts', // Exclude index.ts (re-exports only)
  ],
  coverageThreshold: {
    global: {
      branches: 82, // Actual coverage: 88.46%, allowing some margin
      functions: 100, // Now only counting actual function files
      lines: 90,
      statements: 90,
    },
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.json',
      },
    ],
  },
};
