import cors from 'cors'
import express from 'express'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import authRouter from './routes/auth.js'
import dashboardRouter from './routes/dashboard.js'
import feeCategoriesRouter from './routes/feeCategories.js'
import reportsRouter from './routes/reports.js'
import studentsRouter from './routes/students.js'
import transactionsRouter from './routes/transactions.js'
import { ApiError } from './lib/respond.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// `npm run build:production` (vite build) outputs here, at the project root — server/src/../.. .
const DIST_DIR = path.join(__dirname, '../../dist')

export const app = express()

app.use(cors())
app.use(express.json())

app.get('/api/health', (req, res) => {
  res.json({ success: true, data: { status: 'ok' } })
})

app.use('/api/auth', authRouter)
app.use('/api/students', studentsRouter)
app.use('/api/fee-categories', feeCategoriesRouter)
app.use('/api/transactions', transactionsRouter)
app.use('/api/reports', reportsRouter)
app.use('/api/dashboard', dashboardRouter)

// Any /api/* request that fell through all the routers above is a genuine unknown endpoint —
// answer it with the same JSON 404 shape as everything else, before the production static/
// SPA-fallback block below gets a chance to swallow it with index.html instead.
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, error: { message: `Route not found: ${req.method} ${req.path}` } })
})

// Production mode only: serve the built frontend (npm run build:production) from this same
// server/port, with a catch-all SPA fallback so refreshing on any client-side route (e.g.
// /reports) returns index.html instead of a 404 — the frontend's own router takes over from
// there once it loads. Dev mode never reaches this: the Vite dev server (port 5173) serves
// the frontend instead, so port 4000 in dev only ever needs to answer /api/*.
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(DIST_DIR))
  app.get('*', (req, res, next) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'), (err) => {
      if (err) next(err)
    })
  })
}

app.use((req, res) => {
  res.status(404).json({ success: false, error: { message: `Route not found: ${req.method} ${req.path}` } })
})

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ success: false, error: { message: err.message } })
  }
  console.error(err)
  res.status(500).json({ success: false, error: { message: 'Internal server error' } })
})
