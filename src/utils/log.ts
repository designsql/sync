export function ok(msg: string) {
  console.log(`[OK] ${msg}`);
}

export function info(msg: string) {
  console.log(`[..] ${msg}`);
}

export function fail(msg: string) {
  console.error(`[!!] ${msg}`);
}

export function warn(msg: string) {
  console.warn(`[!!] ${msg}`);
}
