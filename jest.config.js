/** @type {import('jest').Config} */
const config = {
  testEnvironment: "node",
  preset: "ts-jest",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testMatch: ["**/__tests__/**/*.test.ts"],
  collectCoverageFrom: ["src/lib/**/*.ts", "!src/lib/db.ts"],
};

module.exports = config;
