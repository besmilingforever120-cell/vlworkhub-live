import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs/promises'
import path from 'node:path'

function homeDashboardFileApi() {
  return {
    name: 'home-dashboard-file-api',
    configureServer(server) {
      server.middlewares.use('/api/home-dashboard', async (req, res) => {
        if (req.method !== 'PUT') {
          res.statusCode = 405
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ message: 'Method Not Allowed' }))
          return
        }

        let requestBody = ''

        req.on('data', (chunk) => {
          requestBody += chunk
        })

        req.on('end', async () => {
          try {
            const parsedData = JSON.parse(requestBody)
            const targetPath = path.resolve(process.cwd(), 'public/mock/home-dashboard.json')

            await fs.writeFile(targetPath, `${JSON.stringify(parsedData, null, 2)}\n`, 'utf8')

            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: true }))
          } catch {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ message: 'Unable to save home dashboard JSON file.' }))
          }
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), homeDashboardFileApi()],
})
