type ClassValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Record<string, boolean | null | undefined>
  | ClassValue[];

function collectTokens(arg: ClassValue, out: string[]): void {
  if (!arg || typeof arg === 'boolean') return;
  if (typeof arg === 'string' || typeof arg === 'number') {
    const parts = String(arg).trim().split(/\s+/);
    for (const part of parts) {
      if (part) out.push(part);
    }
    return;
  }
  if (Array.isArray(arg)) {
    for (const item of arg) {
      collectTokens(item, out);
    }
    return;
  }
  if (typeof arg === 'object') {
    for (const [key, enabled] of Object.entries(arg)) {
      if (enabled) {
        const parts = key.trim().split(/\s+/);
        for (const part of parts) {
          if (part) out.push(part);
        }
      }
    }
  }
}

/**
 * Resolves CSS Module tokens against `styles` while falling back to the raw class
 * name for global/theme utility classes and state flags.
 */
export function createCx(styles: Record<string, string>) {
  return (...args: ClassValue[]): string => {
    const rawTokens: string[] = [];
    for (const arg of args) {
      collectTokens(arg, rawTokens);
    }
    const resolved: string[] = [];
    for (const token of rawTokens) {
      resolved.push(styles[token] || token);
    }
    return resolved.join(' ');
  };
}

export const createClassNames = createCx;
