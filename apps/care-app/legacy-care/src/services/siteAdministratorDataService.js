const SITE_USERS_JSON_PATH = '/mock/site-admin/users.json'

export async function fetchSiteUsers() {
  const response = await fetch(SITE_USERS_JSON_PATH, { cache: 'no-store' })

  if (!response.ok) {
    throw new Error('Failed to load Site Administrator users JSON.')
  }

  const payload = await response.json()
  return Array.isArray(payload) ? payload : []
}

export async function saveSiteUsers(payload) {
  const response = await fetch('/api/site-admin/users', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error('Failed to save Site Administrator users JSON.')
  }

  return response.json()
}
