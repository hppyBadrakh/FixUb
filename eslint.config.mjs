import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Build output and copied vendor files (present locally after `npm run build`):
    ".open-next/**",
    ".wrangler/**",
    "public/vendor/**",
  ]),
  // The server must not depend on the browser-only demo, so the demo code can be deleted later.
  // Shared rules live in src/lib/domain/{rules,errors,lifecycle,geo,metrics}.ts, src/lib/id.ts and
  // src/lib/fixtures/.
  {
    files: ["src/server/**/*.{ts,tsx}", "src/db/**/*.{ts,tsx}", "src/app/api/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/data/*", "**/lib/data/*", "**/data/seed", "**/data/repository", "**/data/photoStore"],
              message: "The browser-only demo's data code. Move what you need to src/lib/fixtures or src/lib/domain/rules.ts.",
            },
            {
              group: ["@/lib/domain/actions", "**/domain/actions"],
              message: "The demo's state-based actions. Use src/lib/domain/rules.ts, errors.ts or lifecycle.ts.",
            },
            { group: ["@/lib/store", "@/lib/store-actions", "**/lib/store", "**/lib/store-actions"], message: "Client store: the server must not import it." },
          ],
        },
      ],
    },
  },
  // The database seed loads the demo's sample data on purpose.
  { files: ["src/db/seed.ts"], rules: { "no-restricted-imports": "off" } },
]);

export default eslintConfig;
