// MidMind GSI capture — Node-вариант слушателя (альтернатива capture.ps1 для
// машин, где есть Node >= 18). Без зависимостей. Каждый POST — отдельный JSON
// в captured/. Слушаем оба loopback-адреса (v4 и v6): cfg указывает localhost,
// а Windows может резолвить его в ::1.
import { createServer } from 'node:http'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const PORT = Number(process.env.PORT ?? 3399)
const OUT_DIR = process.env.OUT_DIR ?? 'captured'
mkdirSync(OUT_DIR, { recursive: true })

let counter = 0

function handle(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(200).end('OK')
    return
  }
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8')
    counter += 1
    const stamp = new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace('T', '_')
      .replace(/\..+/, '')
    const file = join(OUT_DIR, `${String(counter).padStart(5, '0')}_${stamp}.json`)
    writeFileSync(file, body)
    let state = '?'
    let clock = '?'
    try {
      const j = JSON.parse(body)
      state = j.map?.game_state ?? '?'
      clock = j.map?.clock_time ?? '?'
    } catch {}
    console.log(`#${counter}  ${state}  clock=${clock}  ${body.length} байт`)
    res.writeHead(200).end('OK')
  })
}

for (const host of ['127.0.0.1', '::1']) {
  const server = createServer(handle)
  server.on('error', (err) => {
    // ::1 может отсутствовать (IPv6 выключен) — это не фатально.
    if (host === '::1') console.warn(`(v6 loopback недоступен: ${err.code})`)
    else throw err
  })
  server.listen(PORT, host, () => {
    console.log(`MidMind GSI capture: http://${host === '::1' ? '[::1]' : host}:${PORT}/ -> ${OUT_DIR}/`)
  })
}
console.log('Останов: Ctrl+C (пакеты пишутся сразу).')
