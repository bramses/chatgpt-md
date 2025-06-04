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
      "@typescript-eslint/no-explicit-any": "off",
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
      "dist/",
      "build/",
    ],
  },
];
