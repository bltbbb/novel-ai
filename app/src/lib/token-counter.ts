export function estimateTextTokens(text: string) {
  if (!text.trim()) {
    return 0;
  }

  return Math.ceil(text.length / 1.5);
}
