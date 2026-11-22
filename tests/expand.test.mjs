import handler from '../api/expand.js'
const assert = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1) } else console.log('ok  ', m) }
const ORIGIN = 'https://vvvvvvvvvivvi.github.io'
function call(query, { origin = ORIGIN, method = 'GET' } = {}) {
  return new Promise(resolve => {
    const headers = {}
    const res = { setHeader: (k, v) => (headers[k] = v), status(c) { this.code = c; return this }, json(b) { resolve({ code: this.code, body: b, headers }) }, end() { resolve({ code: this.code, headers }) } }
    handler({ method, headers: origin ? { origin } : {}, query }, res)
  })
}
const redirects = map => async url => {
  const next = map[url]
  if (!next) throw new Error('unexpected fetch ' + url)
  return { headers: { get: k => (k.toLowerCase() === 'location' ? next : null) } }
}
const LONG = 'https://www.google.com/maps/place/Muji+Shibuya/@35.66,139.70,17z/data=!3d35.66!4d139.70'

globalThis.fetch = redirects({ 'https://maps.app.goo.gl/abc123': LONG })
let r = await call({ url: 'https://maps.app.goo.gl/abc123' })
assert(r.code === 200 && r.body.url === LONG, 'short link → long Google Maps URL')
assert(r.headers['Access-Control-Allow-Origin'] === ORIGIN, 'CORS allows the Pages origin')

globalThis.fetch = redirects({ 'https://maps.app.goo.gl/x': 'https://consent.google.com/ml?continue=' + encodeURIComponent(LONG) })
r = await call({ url: 'https://maps.app.goo.gl/x' })
assert(r.code === 200 && r.body.url === LONG, 'EU consent wall is unwrapped')

globalThis.fetch = redirects({ 'https://maps.app.goo.gl/y': 'https://goo.gl/m', 'https://goo.gl/m': LONG })
r = await call({ url: 'https://maps.app.goo.gl/y' })
assert(r.code === 200 && r.body.url === LONG, 'multi-hop redirect')

globalThis.fetch = redirects({ 'https://maps.app.goo.gl/z': 'https://evil.example.com/maps/place/x' })
r = await call({ url: 'https://maps.app.goo.gl/z' })
assert(r.code === 422, 'redirect to another site is not followed or returned')

let calls = 0
globalThis.fetch = async () => { calls++; throw new Error('must not fetch') }
r = await call({ url: 'https://evil.example.com/x' })
assert(r.code === 400 && calls === 0, 'non-short-link hosts are rejected without any request (no open proxy)')
r = await call({ url: 'http://maps.app.goo.gl/abc' })
assert(r.code === 400 && calls === 0, 'http (non-https) rejected')
r = await call({ url: 'https://maps.app.goo.gl/abc' }, { origin: 'https://evil.example.com' })
assert(r.code === 403 && calls === 0, 'other origins are refused')
r = await call({})
assert(r.code === 400, 'missing url rejected')
r = await call({}, { method: 'OPTIONS' })
assert(r.code === 204, 'preflight handled')

globalThis.fetch = async () => { throw new Error('boom') }
r = await call({ url: 'https://maps.app.goo.gl/abc' })
assert(r.code === 502, 'network failure → clean 502')

globalThis.fetch = redirects({ 'https://maps.app.goo.gl/loop': 'https://maps.app.goo.gl/loop' })
r = await call({ url: 'https://maps.app.goo.gl/loop' })
assert(r.code === 422, 'redirect loop gives up after 5 hops')
