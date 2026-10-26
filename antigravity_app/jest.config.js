module.exports = {
  testMatch: ["**/tests/test_suite.js"],
  transform: { "^.+\\.js$": "babel-jest" },
transformIgnorePatterns: [["/frontend/src/services/"]],
};