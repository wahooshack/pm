import js from "@eslint/js";
import ts from "typescript-eslint";
import hooks from "eslint-plugin-react-hooks";
import a11y from "eslint-plugin-jsx-a11y";
import globals from "globals";

export default ts.config(
  { ignores: [".next/**", "out/**", "build/**", "node_modules/**", "test-results/**", "next-env.d.ts"] },
  js.configs.recommended,
  ...ts.configs.recommended,
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": hooks, "jsx-a11y": a11y },
    rules: { ...hooks.configs.recommended.rules, ...a11y.configs.recommended.rules },
  },
  { files: ["**/*.test.{ts,tsx}"], languageOptions: { globals: {
    describe: "readonly", it: "readonly", expect: "readonly", beforeEach: "readonly", vi: "readonly",
  } } },
);
