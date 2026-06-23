/// <reference types="@webgpu/types" />
/// <reference types="wicg-file-system-access" />

interface FileSystemFileHandle {
    remove(): Promise<void>;
}

interface LocalFontData {
    family: string;
    fullName: string;
    postscriptName: string;
    style: string;
}

interface Window {
    queryLocalFonts?: () => Promise<LocalFontData[]>;
}

declare module '*.png' {
    const value: any;
    export default value;
}

declare module '*.svg' {
    const value: any;
    export default value;
}

declare module '*.scss' {
    const value: any;
    export default value;
}
