/** Preserve the input verbatim unless it needs the first numeric suffix. Blank IDs retain legacy behavior. */
export function captureIdentifier(input: string): string {
  return input.trim() && !/[0-9٠-٩۰-۹]/.test(input) ? `${input}001` : input;
}
/** Increment the final numeric group, preserving prefixes, separators, suffixes and zero padding. */
export function nextIdentifier(assigned: string): string {
  const match = /([0-9٠-٩۰-۹]+)([^0-9٠-٩۰-۹]*)$/.exec(assigned);
  if (!match) return assigned;
  const digits = [...match[1]];
  const value = (digit: string) => {
    const code = digit.charCodeAt(0);
    return code <= 57 ? code - 48 : code >= 0x6f0 ? code - 0x6f0 : code - 0x660;
  };
  const ascii = digits.map(value).join("");
  const incremented = (BigInt(ascii) + 1n)
    .toString()
    .padStart(digits.length, "0");
  const next = [...incremented]
    .map((digit, index) => {
      const original =
        digits[Math.max(0, index - incremented.length + digits.length)];
      return String.fromCharCode(
        original.charCodeAt(0) - value(original) + Number(digit),
      );
    })
    .join("");
  return assigned.slice(0, match.index) + next + match[2];
}
