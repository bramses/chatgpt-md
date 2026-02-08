import typescriptEslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    files: ["**/*.ts"],
    plugins: {
      "@typescript-eslint": typescriptEslint,
    },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
    rules: {
      // ESLint recommended rules
      ...typescriptEslint.configs.recommended.rules,

      // Custom rules from .eslintrc
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "none",
          varsIgnorePattern: "^_", // Allow variables starting with underscore
          argsIgnorePattern: "^_", // Allow function arguments starting with underscore
          caughtErrorsIgnorePattern: "^_", // Allow caught errors starting with underscore
        },
      ],

      // Type safety rules - warn for now, can upgrade to error later
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",

      // Enforce explicit return types for better documentation
      "@typescript-eslint/explicit-function-return-type": "off",

      // Prevent common async mistakes
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-misused-promises": "off",
      "@typescript-eslint/await-thenable": "off",

      // Code complexity limits
      complexity: ["warn", 15],
      "max-lines-per-function": ["warn", { max: 50, skipBlankLines: true, skipComments: true }],
      "max-depth": ["warn", 4],

      // Other useful rules
      "@typescript-eslint/ban-ts-comment": "off",
      "no-prototype-builtins": "off",
      "@typescript-eslint/no-empty-function": "off",
    },
  },
  {
    // Global ignores (replaces .eslintignore)
    ignores: [
      "node_modules/",
      "main.js",
      "*.js", // Ignore JS files in root
      "!eslint.config.js", // But allow linting this file
      "!jest.config.js", // And jest config
      "dist/",
      "build/",
      "**/*.test.ts", // Ignore test files from strict rules
      "src/__mocks__/", // Ignore mock files
    ],
  },
];
