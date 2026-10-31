export function QuickSelect({ label, value, options, onChange }: {
    label: string;
    value: string;
    options: { value: string; label: string }[];
    onChange: (value: string) => void;
}) {
    return (
        <label className="grid gap-1 text-xs text-muted-foreground">
            {label}
            <select className="h-11 min-w-0 rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none" value={value} onChange={(event) => onChange(event.target.value)}>
                {options.map((item) => (
                    <option key={item.value} value={item.value}>
                        {item.label}
                    </option>
                ))}
            </select>
        </label>
    );
}

export function QuickNumber({ label, value, min, max, disabled, clampOnChange = true, normalizeOnBlur, onChange }: {
    label: string;
    value: string;
    min: number;
    max: number;
    disabled?: boolean;
    clampOnChange?: boolean;
    normalizeOnBlur?: (value: string) => string;
    onChange: (value: string) => void;
}) {
    const clamp = (raw: string) => String(Math.max(min, Math.min(max, Math.floor(Number(raw) || min))));
    return (
        <label className="grid gap-1 text-xs text-muted-foreground">
            {label}
            <input
                className="h-11 min-w-0 rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none disabled:opacity-50"
                type="number"
                min={min}
                max={max}
                disabled={disabled}
                value={value}
                onChange={(event) => onChange(clampOnChange ? clamp(event.target.value) : event.target.value)}
                onBlur={(event) => onChange(normalizeOnBlur ? normalizeOnBlur(event.target.value) : clamp(event.target.value))}
                onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                }}
            />
        </label>
    );
}
