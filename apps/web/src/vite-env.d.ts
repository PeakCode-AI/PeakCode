/// <reference types="vite/client" />

import type { NativeApi, DesktopBridge } from "@peakcode/contracts";

interface ImportMetaEnv {
  readonly APP_VERSION: string;
  /** WebSocket server URL (set when server binds to a specific host). */
  readonly VITE_WS_URL: string;
  /** WebSocket server port (set when server binds to a wildcard address like 0.0.0.0). */
  readonly VITE_WS_PORT: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface Window {
    nativeApi?: NativeApi;
    desktopBridge?: DesktopBridge;
  }
}
