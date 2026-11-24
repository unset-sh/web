// The handle a visitor types, as backend's sign-in takes it. Checked here too, so a typo is "not a handle" rather than
// "no account uses it" (backend answers handle_not_found for both).
/** The handle syntax (https://atproto.com/specs/handle): labels of letters, digits and inner hyphens, a letter TLD. */
const HANDLE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$/;
const MAX = 253;

/** The typed text as a handle (trimmed, a leading `@` dropped, lowercased), or null when it is not one. */
export function typedHandle(typed: string): string | null {
  const handle = typed.trim().replace(/^@/, "").toLowerCase();
  return handle.length <= MAX && HANDLE.test(handle) ? handle : null;
}
