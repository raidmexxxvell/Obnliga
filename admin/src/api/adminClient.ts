const API_BASE = import.meta.env.VITE_ADMIN_API_BASE || 'http://localhost:3000'

interface AdminLoginResponse {
  ok: boolean
  token: string
  expiresIn: number
  error?: string
}

export const adminLogin = async (login: string, password: string): Promise<AdminLoginResponse> => {
  const response = await fetch(`${API_BASE}/api/admin/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ login, password })
  })

  const data = (await response.json().catch(() => ({}))) as Partial<AdminLoginResponse>

  if (!response.ok) {
    return {
      ok: false,
      token: '',
      expiresIn: 0,
      error: data.error || 'invalid_credentials'
    }
  }

  return {
    ok: true,
    token: data.token ?? '',
    expiresIn: data.expiresIn ?? 0
  }
}
