export function log(...args: any[]) {
  console.log("[brain]", ...args);
}

export function warn(...args: any[]) {
  console.warn("[brain]", ...args);
}

export function errorLog(...args: any[]) {
  console.error("[brain]", ...args);
}
