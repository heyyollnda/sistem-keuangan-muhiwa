export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export function ok(res, data, status = 200) {
  res.status(status).json({ success: true, data })
}

export function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res)).catch(next)
  }
}
