import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**"] },
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.test.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["src/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // Assertions on test doubles pass methods around on purpose.
    files: ["src/__tests__/**/*.ts"],
    rules: {
      "@typescript-eslint/unbound-method": "off",
    },
  }
);
