module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/*.test.ts'],
  transform: {
    '^.+\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
  ],
  moduleNameMapper: {
    '^obsidian$': '<rootDir>/tests/__mocks__/obsidian.ts'
  },
  // Timer mocking configuration for scheduler testing
  // Note: Individual tests can import timer utilities as needed
  // Disabled globally to avoid conflicts with async tests
  // Tests that need fake timers should call jest.useFakeTimers() explicitly
  fakeTimers: {
    enableGlobally: false
  }
};
