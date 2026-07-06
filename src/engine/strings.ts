/**
 * Name sanitization for file paths and glTF node names. Unicode-aware —
 * a shot named "追跡" keeps its characters — and never returns an empty
 * string (which would collide export paths and animation targets).
 */

export function sanitizeName(name: string): string {
  const cleaned = name
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
  if (cleaned.length > 0) return cleaned
  // Deterministic fallback derived from the original bytes.
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return `untitled-${hash.toString(36)}`
}

/** Make a name unique within a set (appends -2, -3, …), updating the set. */
export function uniqueName(base: string, used: Set<string>): string {
  let candidate = base
  let n = 2
  while (used.has(candidate)) {
    candidate = `${base}-${n}`
    n++
  }
  used.add(candidate)
  return candidate
}
