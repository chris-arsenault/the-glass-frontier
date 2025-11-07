import { defineConfig } from "eslint/config";
import reactHooks from 'eslint-plugin-react-hooks';

export default defineConfig([
  {
    files: ["**/*.js"], // Apply this configuration to all .js files
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
        "react-hooks/rules-of-hooks": "error",
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
]);
