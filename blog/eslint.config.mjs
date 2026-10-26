import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
export default defineConfig([
  ...nextVitals, ...nextTs,
  globalIgnores([".next/**", "public/**", "next-env.d.ts"]),
  // Editorial navigation reloads server content immediately after CMS changes.
  { rules: { "@next/next/no-img-element": "off", "@next/next/no-html-link-for-pages": "off", "@next/next/no-location-assign-relative-destination": "off" } },
]);
