import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const npmCli = process.env.npm_execpath
if (!npmCli) throw new Error('Run this launcher through npm: npm run dev')
const spawnOptions = { stdio: 'inherit' }
const parseEnvFile = path => Object.fromEntries(
  readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && line.includes('='))
    .map(line => {
      const separator = line.indexOf('=')
      const name = line.slice(0, separator).trim()
      const value = line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, '$2')
      return [name, value]
    }),
)
const backendEnv = parseEnvFile(resolve('backend/.env'))
const frontendEnv = {
  ...process.env,
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || backendEnv.SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_KEY || backendEnv.SUPABASE_PUBLISHABLE_KEY,
  VITE_API_BASE_URL: process.env.VITE_API_BASE_URL || '/api/v1',
}
const children = [
  spawn(process.execPath, [npmCli, '--prefix', 'backend', 'run', 'dev'], spawnOptions),
  spawn(process.execPath, [npmCli, '--prefix', 'frontend', 'run', 'dev'], { ...spawnOptions, env: frontendEnv }),
]

let shuttingDown = false

const stopAll = signal => {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) {
    if (!child.killed) child.kill(signal)
  }
}

process.on('SIGINT', () => stopAll('SIGINT'))
process.on('SIGTERM', () => stopAll('SIGTERM'))

for (const child of children) {
  child.on('exit', code => {
    stopAll('SIGTERM')
    process.exitCode = code ?? 1
  })
}
