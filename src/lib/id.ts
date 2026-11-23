export function uid(prefix = ""): string {
  // Not crypto.randomUUID: it is missing on plain-http LAN demos (non-secure context).
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
