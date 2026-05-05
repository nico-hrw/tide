const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? ''

export async function apiFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const url = `${API_BASE}/api/v1${endpoint}`
  const res = await fetch(url, { ...options, credentials: 'include' })
  if (res.status === 401) {
    window.location.href = 'https://go-tide.app/auth'
    throw new Error('Unauthorized')
  }
  return res
}
