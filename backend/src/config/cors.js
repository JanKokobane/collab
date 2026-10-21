const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || '*')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

const isOriginAllowed = origin =>
    !origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin);

const getCorsOrigin = origin =>
    allowedOrigins.includes('*') ? '*' : origin;

module.exports = { getCorsOrigin, isOriginAllowed };