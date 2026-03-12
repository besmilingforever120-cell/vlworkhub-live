export async function fetchHomeDashboardData() {
  const response = await fetch('/mock/home-dashboard.json', {
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error('Failed to load home dashboard JSON data.')
  }

  return response.json()
}

export async function saveHomeDashboardData(payload) {
  const response = await fetch('/api/home-dashboard', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error('Failed to save home dashboard JSON data.')
  }

  return response.json()
}
