import type { ThemeConfig } from "antd";
import { theme as antdTheme } from "antd";
import { appFontFamily } from "@/lib/app-font";

/* 朋克双色：与 globals.css 的 --acid / --hot 同源 */
export const punkAccent = {
    acid: "#d0ec00",
    hot: "#ff3ead",
};

const neutral = {
    light: {
        primary: punkAccent.acid,
        primaryHover: "#bcd600",
        primaryText: "#141414",
        link: "#171717",
        linkHover: "#4c6b00",
        menuBg: "#f2f2ee",
        menuText: "#171717",
        selectActiveBg: "#f5f5f5",
        selectSelectedBg: "#f0f0f0",
        selectText: "#171717",
        tableSelectedBg: "rgba(17, 17, 17, 0.05)",
        tableSelectedHoverBg: "rgba(17, 17, 17, 0.08)",
    },
    dark: {
        primary: punkAccent.acid,
        primaryHover: "#e4ff1a",
        primaryText: "#0b0b09",
        link: punkAccent.acid,
        linkHover: "#e4ff1a",
        menuBg: "#262626",
        menuText: "#fafafa",
        selectActiveBg: "#262626",
        selectSelectedBg: "#333333",
        selectText: "#fafafa",
        tableSelectedBg: "rgba(255, 255, 255, 0.08)",
        tableSelectedHoverBg: "rgba(255, 255, 255, 0.12)",
    },
};

export function getAntThemeConfig(dark: boolean): ThemeConfig {
    const color = dark ? neutral.dark : neutral.light;

    return {
        algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        cssVar: { key: dark ? "infinite-canvas-dark" : "infinite-canvas-light" },
        token: {
            colorPrimary: color.primary,
            colorInfo: color.primary,
            colorLink: color.link,
            colorLinkHover: color.linkHover,
            colorLinkActive: color.link,
            colorTextLightSolid: color.primaryText,
            ...(dark ? { colorTextSecondary: "#b3b3b3", colorTextTertiary: "#9e9e9e", colorTextPlaceholder: "#9a9a9a" } : {}),
            fontFamily: appFontFamily,
            borderRadius: 8,
            borderRadiusLG: 12,
            borderRadiusSM: 4,
            controlHeight: 34,
        },
        components: {
            Button: {
                primaryShadow: "none",
                defaultShadow: "none",
                fontWeight: 500,
                borderRadius: 8,
            },
            Modal: {
                borderRadiusLG: 16,
            },
            Drawer: {
                borderRadiusLG: 16,
            },
            Input: {
                borderRadius: 8,
            },
            Tag: {
                borderRadiusSM: 4,
            },
            Menu: {
                itemActiveBg: color.menuBg,
                itemHoverBg: color.menuBg,
                itemSelectedBg: color.menuBg,
                itemSelectedColor: color.menuText,
                darkItemHoverBg: neutral.dark.menuBg,
                darkItemSelectedBg: neutral.dark.menuBg,
                darkItemSelectedColor: neutral.dark.menuText,
            },
            Select: {
                borderRadius: 8,
                optionActiveBg: color.selectActiveBg,
                optionSelectedBg: color.selectSelectedBg,
                optionSelectedColor: color.selectText,
            },
            Table: {
                rowSelectedBg: color.tableSelectedBg,
                rowSelectedHoverBg: color.tableSelectedHoverBg,
            },
        },
    };
}
