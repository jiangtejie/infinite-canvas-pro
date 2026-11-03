import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nextConfig = require("eslint-config-next");
const reactHooks = require("eslint-plugin-react-hooks");

const config = [
    ...nextConfig,
    {
        files: ["**/*.{ts,tsx}"],
        plugins: { "react-hooks": reactHooks },
        rules: {
            "react-hooks/rules-of-hooks": "error",
            "react-hooks/exhaustive-deps": "warn",
            "react-hooks/static-components": "off",
            "react-hooks/use-memo": "off",
            "react-hooks/preserve-manual-memoization": "off",
            "react-hooks/immutability": "off",
            "react-hooks/globals": "off",
            "react-hooks/refs": "off",
            "react-hooks/set-state-in-effect": "off",
            "react-hooks/error-boundaries": "off",
            "react-hooks/purity": "off",
            "react-hooks/set-state-in-render": "off",
            "react-hooks/config": "off",
            "react-hooks/gating": "off",
            "react-hooks/incompatible-library": "warn",
            "@next/next/no-img-element": "off",
        },
    },
    {
        ignores: [".next/**", "node_modules/**", "public/**", "next-env.d.ts"],
    },
];

export default config;
