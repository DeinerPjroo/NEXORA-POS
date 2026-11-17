import { randomBytes } from 'node:crypto'
import { closeSync, existsSync, openSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'

// Nunca lee ni modifica credenciales .env. Solo usa la base SQLite dedicada de E2E.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cwd = resolve(root, 'backend')
const database = resolve(cwd, 'database/e2e.sqlite')
if (!existsSync(database)) closeSync(openSync(database, 'wx'))
const env = {
  ...process.env, APP_ENV: 'local', APP_DEBUG: 'false', APP_KEY: `base64:${randomBytes(32).toString('base64')}`,
  APP_URL: 'http://127.0.0.1:8011', FRONTEND_URL: 'http://127.0.0.1:5199',
  DB_CONNECTION: 'sqlite', DB_DATABASE: database, DB_URL: '', SESSION_DRIVER: 'database', CACHE_STORE: 'database',
  SANCTUM_STATEFUL_DOMAINS: '127.0.0.1:5199,127.0.0.1:8011', SESSION_SECURE_COOKIE: 'false',
  SESSION_DOMAIN: 'null', MAIL_MAILER: 'log', QUEUE_CONNECTION: 'sync', BCRYPT_ROUNDS: '4',
  CATALOG_MEDIA_ROOT: resolve(root, '.runtime/e2e-catalog'),
  CACHE_PREFIX: `nexora-e2e-${randomBytes(8).toString('hex')}-`,
}
const migrate = spawnSync('php', ['artisan', 'migrate', '--seed', '--force', '--no-interaction'], { cwd, env, stdio: 'inherit', windowsHide: true })
if (migrate.status !== 0) process.exit(migrate.status ?? 1)
const server = spawn('php', ['artisan', 'serve', '--host=127.0.0.1', '--port=8011', '--no-reload'], { cwd, env, stdio: 'inherit', windowsHide: true })
server.on('exit', (code) => process.exit(code ?? 0))
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill())
