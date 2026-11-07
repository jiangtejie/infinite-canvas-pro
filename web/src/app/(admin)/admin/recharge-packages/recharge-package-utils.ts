export type PackageFormValues = {
    id?: string;
    name: string;
    amountYuan: number;
    credits: number;
    bonus: number;
    sort: number;
    enabled: boolean;
};

export const DEFAULT_PACKAGE_VALUES: PackageFormValues = { name: "", amountYuan: 10, credits: 100, bonus: 0, sort: 0, enabled: true };
