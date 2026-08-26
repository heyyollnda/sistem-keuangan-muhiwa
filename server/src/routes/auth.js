import { Router } from 'express'
import { ApiError, asyncRoute, ok } from '../lib/respond.js'

const router = Router()

// POST /api/auth/login — validates against STAFF_USERNAME/STAFF_PASSWORD from server/.env.
// This is the only place those values are ever compared; the frontend never sees them.
router.post(
  '/login',
  asyncRoute(async (req, res) => {
    const { username, password } = req.body
    const expectedUsername = process.env.STAFF_USERNAME
    const expectedPassword = process.env.STAFF_PASSWORD

    if (!expectedUsername || !expectedPassword) {
      throw new ApiError(
        500,
        'STAFF_USERNAME/STAFF_PASSWORD belum diatur di server/.env. Salin dari server/.env.example dan isi kredensialnya.'
      )
    }

    const valid =
      typeof username === 'string' &&
      typeof password === 'string' &&
      username === expectedUsername &&
      password === expectedPassword

    if (!valid) throw new ApiError(401, 'Username atau password salah.')

    ok(res, { authenticated: true })
  })
)

export default router
