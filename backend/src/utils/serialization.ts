export function serializePrisma<T>(input: T): any {
  return serializeAny(input)
}

function serializeAny(value: any): any {
  if (value === null || value === undefined) return value
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(item => serializeAny(item))
  if (typeof value === 'object') {
    const entries = Object.entries(value).map(([key, val]) => [key, serializeAny(val)])
    return Object.fromEntries(entries)
  }
  return value
}
