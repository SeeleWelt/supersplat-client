type TauriInvoke = <T = unknown>(command: string, args?: Record<string, unknown>) => Promise<T>;

const getTauriInvoke = (): TauriInvoke | null => {
    const tauri = (window as any).__TAURI__;
    const publicInvoke = tauri?.core?.invoke ?? tauri?.invoke;
    const internalInvoke = (window as any).__TAURI_INTERNALS__?.invoke;

    return publicInvoke ?? internalInvoke ?? null;
};

export { getTauriInvoke };
export type { TauriInvoke };
