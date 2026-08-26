import './lib/env.js'
import '../db/connection.js'
import { app } from './app.js'

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000
const mode = process.env.NODE_ENV === 'production' ? 'production (menyajikan frontend + API)' : 'development (API saja)'

app.listen(PORT, () => {
  console.log(`[server] SIKAS MUHIWA backend listening on http://localhost:${PORT} — mode ${mode}`)
})
