/**
 * Minimal ambient augmentation for the parts of the File System Access
 * API that TypeScript's bundled DOM lib doesn't define yet (checked
 * against typescript 5.9's lib.dom.d.ts as of CASE-AUTOSAVE-2026-08-08):
 * FileSystemFileHandle, FileSystemHandle, and FileSystemWritableFileStream
 * (including createWritable) are already there, but Window.showSaveFilePicker
 * (the actual entry point) and the permission-query methods on
 * FileSystemHandle are missing. Only what app/case/persistence.ts and
 * app/page.tsx's autosave code actually use is declared here — see MDN's
 * File System Access API docs for the full spec shape if this ever needs
 * to grow (e.g. showOpenFilePicker, showDirectoryPicker).
 *
 * Chromium-only API (Chrome/Edge/Opera/Arc) — see isFileSystemAccessSupported()
 * in persistence.ts for the feature-detection gate every call site behind
 * this type goes through.
 */
export {};

declare global {
  interface FileSystemHandlePermissionDescriptor {
    mode?: "read" | "readwrite";
  }

  interface FileSystemHandle {
    queryPermission(
      descriptor?: FileSystemHandlePermissionDescriptor,
    ): Promise<PermissionState>;
    requestPermission(
      descriptor?: FileSystemHandlePermissionDescriptor,
    ): Promise<PermissionState>;
  }

  interface SaveFilePickerOptions {
    suggestedName?: string;
    types?: Array<{
      description?: string;
      accept: Record<string, string[]>;
    }>;
    excludeAcceptAllOption?: boolean;
  }

  interface Window {
    showSaveFilePicker(
      options?: SaveFilePickerOptions,
    ): Promise<FileSystemFileHandle>;
  }
}
