export const CONFIRMATION_BODY_MAX_BYTES = 80 * 1024;

// JSON can encode each UTF-16 code unit as a six-byte escape (for example, a
// lone surrogate). The five 2,000-character fields, location, map URL, and a
// 512-byte envelope are therefore bounded by 74,600 bytes; 80 KiB leaves a
// small fixed margin while remaining finite.
export const CONFIRMATION_BODY_WORST_CASE_BYTES = (5 * 2000 + 300 + 2048) * 6 + 512;

export function confirmationBodyByteLength(value) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function confirmationBodyFits(value) {
  return confirmationBodyByteLength(value) <= CONFIRMATION_BODY_MAX_BYTES;
}
