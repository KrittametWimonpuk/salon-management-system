function resolveApiBaseUrl(value: string | undefined): string {
  const candidate = value?.trim() || '/api'
  if (candidate.startsWith('/')) return candidate.replace(/\/$/, '')

  try {
    const url = new URL(candidate)
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') throw new Error('insecure')
    return url.toString().replace(/\/$/, '')
  } catch {
    throw new Error('VITE_API_BASE_URL must be a relative path, HTTPS URL, or localhost URL')
  }
}

export const env = Object.freeze({
  apiBaseUrl: resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL),
})
