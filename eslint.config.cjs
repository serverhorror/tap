/* Flat ESLint config for ESLint >=10, keeping the existing rules with minimal changes. */
const js = require("@eslint/js");
const importX = require("eslint-plugin-import-x");
const globals = require("globals");

module.exports = [
  {
    ignores: ["node_modules", "dist", "coverage", ".vite", ".DS_Store"],
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      ...js.configs.recommended.languageOptions,
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.es2021,
        ...globals.node,
      },
    },
    plugins: {
      "import-x": importX,
    },
    settings: {
      "import-x/resolver": {
        node: {
          extensions: [".js", ".mjs"],
        },
      },
    },
    rules: {
      ...(js.configs.recommended.rules || {}),
      ...((importX.configs &&
        importX.configs.recommended &&
        importX.configs.recommended.rules) ||
        {}),
      "import-x/order": [
        "warn",
        {
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
      "no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["**/__tests__/**/*", "**/*.test.js"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        vi: "readonly",

        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
      },
    },
  },
];
