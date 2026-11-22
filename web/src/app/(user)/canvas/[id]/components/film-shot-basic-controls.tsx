"use client";

import type { CSSProperties } from "react";
import { AutoComplete, Input } from "antd";
import { ChevronDown } from "lucide-react";

import { FILM_CAMERA_MOVEMENT_OPTIONS, FILM_SHOT_TYPE_OPTIONS, FILM_TRANSITION_OPTIONS } from "@/app/(user)/film/utils/film-shot-types";

type FilmOptionControlProps = {
    value?: string;
    onChange: (value: string) => void;
    variant?: "panel" | "table";
    className?: string;
    style?: CSSProperties;
    ariaLabel?: string;
    placeholder?: string;
    disabled?: boolean;
};

const VARIANT_CLASSES = {
    panel: "h-8 w-full rounded-md border px-2 text-sm outline-none",
    table: "w-full border-0 bg-transparent px-0.5 py-0.5 text-xs outline-none",
} as const;

export function FilmShotTypeControl({ value, onChange, variant = "panel", className = "", style, ariaLabel = "景别", placeholder = "未设置", disabled }: FilmOptionControlProps) {
    const options = value && !FILM_SHOT_TYPE_OPTIONS.some((option) => option.value === value) ? [{ value, label: value }, ...FILM_SHOT_TYPE_OPTIONS] : FILM_SHOT_TYPE_OPTIONS;
    return (
        <select className={`${VARIANT_CLASSES[variant]} ${className}`} style={style} value={value || ""} onChange={(event) => onChange(event.target.value)} aria-label={ariaLabel} disabled={disabled}>
            <option value="">{placeholder}</option>
            {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
    );
}

export function FilmCameraMovementControl(props: FilmOptionControlProps) {
    return <FilmOptionInput {...props} options={FILM_CAMERA_MOVEMENT_OPTIONS} ariaLabel={props.ariaLabel || "运镜"} placeholder={props.placeholder || "例如：缓慢横移"} />;
}

export function FilmTransitionControl(props: FilmOptionControlProps) {
    return <FilmOptionInput {...props} options={FILM_TRANSITION_OPTIONS} ariaLabel={props.ariaLabel || "转场"} placeholder={props.placeholder || "硬切 / 叠化"} />;
}

function FilmOptionInput({ value, onChange, options, variant = "panel", className = "", style, ariaLabel, placeholder, disabled }: FilmOptionControlProps & { options: string[] }) {
    return (
        <AutoComplete
            className={`w-full ${variant === "table" ? "[&_.ant-select-selector]:!border-0 [&_.ant-select-selector]:!bg-transparent [&_.ant-select-selector]:!shadow-none" : ""}`}
            value={value || ""}
            options={options.map((option) => ({ value: option }))}
            onChange={(next) => onChange(next || "")}
            allowClear
            popupMatchSelectWidth={false}
            placeholder={placeholder}
        >
            <Input
                className={`${VARIANT_CLASSES[variant]} ${className}`}
                style={style}
                size={variant === "table" ? "small" : "middle"}
                variant={variant === "table" ? "borderless" : "outlined"}
                aria-label={ariaLabel}
                placeholder={placeholder}
                autoComplete="off"
                spellCheck={false}
                disabled={disabled}
                suffix={<ChevronDown className="pointer-events-none size-3.5 opacity-50" />}
            />
        </AutoComplete>
    );
}
