/// <reference types="vite/client" />

declare global {
  interface Window {
    COLLAB_API_BASE_URL?: string;
    io?: (url: string, opts?: Record<string, unknown>) => any;
    Metered?: {
      Meeting: new () => any;
    };
  }
}

export {};
