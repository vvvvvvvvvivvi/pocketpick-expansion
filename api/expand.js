// Follows a Google Maps short link (maps.app.goo.gl) and returns the full URL it redirects to.
// Browsers can't do this themselves (CORS), which is the only reason this function exists.
// It makes no Google Maps API calls, so it adds nothing to your Google usage.

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://vvvvvvvvvivvi.github.io,http://localhost:5173')
  .split(',').map(s => s.trim()).filter(Boolean)

const SHORT_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl'])
const isGoogleHost = h => h === 'google.com' || h.endsWith('.google.com')
const MAX_HOPS = 5

function cors(req, res) {
  const origin = req.headers.origin
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

function fail(res, status, error) {
  res.status(status).json({ error })
}

export default async function handler(req, res) {
  cors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return fail(res, 405, 'Use GET.')

  // only answer the app's own origin
  const origin = req.headers.origin
  if (origin && !ALLOWED_ORIGINS.includes(origin)) return fail(res, 403, 'Origin not allowed.')

  let current
  try {
    current = new URL(String(req.query?.url ?? ''))
  } catch {
    return fail(res, 400, 'Missing or invalid url.')
  }
  if (current.protocol !== 'https:' || !SHORT_HOSTS.has(current.hostname.toLowerCase())) {
    return fail(res, 400, 'Only maps.app.goo.gl short links are accepted.')
  }

  try {
    for (let hop = 0; hop < MAX_HOPS; hop++) {
      const host = current.hostname.toLowerCase()
      // stop as soon as we are on a normal Google Maps page
      if (isGoogleHost(host) && host !== 'consent.google.com' && /^\/maps/i.test(current.pathname)) {
        return res.status(200).json({ url: current.href })
      }
      // EU consent wall: the real destination is in the `continue` parameter
      if (host === 'consent.google.com') {
        const next = current.searchParams.get('continue')
        if (!next) break
        current = new URL(next)
        continue
      }
      if (!SHORT_HOSTS.has(host) && !isGoogleHost(host)) break // never follow redirects to other sites

      const r = await fetch(current.href, {
        redirect: 'manual',
        signal: AbortSignal.timeout(6000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PocketPickExpand/1.0)' }
      })
      const loc = r.headers.get('location')
      if (!loc) break
      current = new URL(loc, current)
      if (current.protocol !== 'https:') break
    }
  } catch {
    return fail(res, 502, 'Could not follow that link.')
  }

  const host = current.hostname.toLowerCase()
  if (isGoogleHost(host) && /^\/maps/i.test(current.pathname)) return res.status(200).json({ url: current.href })
  return fail(res, 422, 'That link did not lead to a Google Maps place.')
}
