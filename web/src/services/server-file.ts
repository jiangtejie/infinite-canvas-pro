import type { UserWebDAVStorageProvider } from "@/services/image-storage";

export type ServerFileRecord = {
    url: string;
    storageKey: string;
    bytes?: number;
    mimeType?: string;
    width?: number;
    height?: number;
    durationMs?: number;
};

type ApiPayload<T> = { code?: number; msg?: string; data?: T };

export async function uploadWebDAVDirect<T extends ServerFileRecord>(provider: UserWebDAVStorageProvider, blob: Blob, filename: string): Promise<T | null> {
    const direct = await import("@/services/webdav-direct-storage");
    return (await direct.persistDirectWebDAV(provider, blob, filename)) as T | null;
}

export async function postServerFile<T extends ServerFileRecord>(blob: Blob, filename: string, providerPayload: object | null, token: string, errorMessage: string): Promise<T> {
    const formData = new FormData();
    formData.append("file", blob, filename);
    if (providerPayload) formData.append("provider", JSON.stringify(providerPayload));
    const response = await fetch("/api/v1/files", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: formData });
    const payload = (await response.json().catch(() => null)) as ApiPayload<T> | null;
    if (!response.ok || payload?.code !== 0 || !payload.data) throw new Error(payload?.msg || errorMessage);
    return payload.data;
}

export async function deleteWebDAVDirect(provider: UserWebDAVStorageProvider, storageKey: string): Promise<boolean> {
    const direct = await import("@/services/webdav-direct-storage");
    return direct.deletePersistedDirectWebDAV(provider, storageKey);
}

export async function deleteServerObject(id: string, providerPayload: object | null, token: string, errorMessage: string): Promise<void> {
    const response = await fetch(`/api/v1/files/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(providerPayload ? { provider: providerPayload } : {}),
    });
    const payload = (await response.json().catch(() => null)) as ApiPayload<unknown> | null;
    if (!response.ok || payload?.code !== 0) throw new Error(payload?.msg || errorMessage);
}
