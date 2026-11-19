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
            "react-hooks/static-components": "error",
            "react-hooks/use-memo": "error",
            "react-hooks/preserve-manual-memoization": "error",
            "react-hooks/globals": "error",
            "react-hooks/error-boundaries": "error",
            "react-hooks/set-state-in-render": "error",
            "react-hooks/config": "error",
            "react-hooks/gating": "error",
            "react-hooks/immutability": "error",
            // 仍需分批清理：purity / refs / set-state-in-effect。
            "react-hooks/refs": "off",
            "react-hooks/set-state-in-effect": "off",
            "react-hooks/purity": "off",
            "react-hooks/incompatible-library": "warn",
            "@next/next/no-img-element": "off",
        },
    },
    {
        ignores: [".next/**", "node_modules/**", "public/**", "next-env.d.ts"],
    },
];

export default config;
