import { apiGet, apiPost } from "./request";
import type { AuthUser } from "./auth";

export type CreditLog = { id: string; type: string; amount: number; balance: number; remark: string; createdAt: string };
export type RechargePackage = { id: string; name: string; amountFen: number; credits: number; bonus: number };
export type RechargeOrder = { id: string; orderNo: string; packageName: string; amountFen: number; credits: number; status: string; codeUrl?: string; expiresAt: string; createdAt: string };
export type InvoiceRequest = { id: string; orderNo: string; title: string; taxNumber: string; email: string; status: string; createdAt: string };
export type Page<T> = { items: T[]; total: number };

export const fetchAccountProfile = (token: string) => apiGet<AuthUser>("/api/v1/account/profile", undefined, token);
export const updateAccountProfile = (payload: Pick<AuthUser, "displayName" | "avatarUrl"> & { email?: string }, token: string) => apiPost<AuthUser>("/api/v1/account/profile", payload, token);
export const changeAccountPassword = (oldPassword: string, newPassword: string, token: string) => apiPost<boolean>("/api/v1/account/password", { oldPassword, newPassword }, token);
export const fetchCreditLogs = (token: string) => apiGet<Page<CreditLog>>("/api/v1/account/credit-logs", { page: 1, pageSize: 50 }, token);
export const fetchRechargePackages = (token: string) => apiGet<RechargePackage[]>("/api/v1/account/packages", undefined, token);
export const createRechargeOrder = (packageId: string, token: string) => apiPost<RechargeOrder>("/api/v1/account/recharges", { packageId }, token);
export const fetchRechargeOrders = (token: string) => apiGet<Page<RechargeOrder>>("/api/v1/account/recharges", { page: 1, pageSize: 20 }, token);
export const fetchRechargeOrder = (id: string, token: string) => apiGet<RechargeOrder>(`/api/v1/account/recharges/${id}`, undefined, token);
export const fetchInvoices = (token: string) => apiGet<InvoiceRequest[]>("/api/v1/account/invoices", undefined, token);
export const createInvoice = (payload: Omit<InvoiceRequest, "id" | "status" | "createdAt">, token: string) => apiPost<InvoiceRequest>("/api/v1/account/invoices", payload, token);
