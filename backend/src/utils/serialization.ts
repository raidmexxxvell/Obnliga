export function serializePrisma<T>(input: T): unknown {
  return serializeAny(input)
}

function serializeAny(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(item => serializeAny(item))
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, val]) => [
      key,
      serializeAny(val),
    ])
    return Object.fromEntries(entries)
  }
  return value
}
