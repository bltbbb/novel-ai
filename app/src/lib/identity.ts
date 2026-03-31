export function createId() {
  return crypto.randomUUID();
}

export function createTimestamp() {
  return new Date().toISOString();
}
