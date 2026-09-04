/**
 * Pull Denrei's branch in, prove the result still works, then ship it.
 *
 *   npm run sync              fetch -> merge -> verify -> push (deploys)
 *   npm run sync -- --no-push stop after verifying, don't push
 *   npm run sync -- --check   verify what's already here; no fetch, no merge
 *
 * It stops at the first failure, on purpose. Anything that reaches `push`
 * has compiled, typechecked and passed its tests, because a push to
 * fork/main deploys straight to production.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const args = new Set(process.argv.slice(2))
const noPush = args.has('--no-push')
const checkOnly = args.has('--check')

const UPSTREAM = 'origin/denrei'   // where Denrei pushes
const TARGET = 'fork'              // the repo Vercel watches
const TARGET_BRANCH = 'main'       // the branch Vercel deploys as production

const BOLD = '\x1b[1m', RED = '\x1b[31m', GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m', DIM = '\x1b[2m', OFF = '\x1b[0m'

let step = 0
const heading = text => console.log(`\n${BOLD}[${++step}] ${text}${OFF}`)
const ok = text => console.log(`${GREEN}  ok${OFF}  ${text}`)
const note = text => console.log(`${DIM}      ${text}${OFF}`)

/** Print why we stopped and what to do about it, then exit non-zero. */
const halt = (title, detail, remedy) => {
  console.error(`\n${RED}${BOLD}STOPPED: ${title}${OFF}`)
  if (detail) console.error(`\n${detail}`)
  if (remedy) console.error(`\n${BOLD}What to do:${OFF}\n${remedy}`)
  console.error('')
  process.exit(1)
}

/** Capture a command's stdout. Throws if it fails. */
const capture = (cmd, cmdArgs) =>
  execFileSync(cmd, cmdArgs, { encoding: 'utf8' }).trim()

/** Run a command, streaming output. Returns whether it succeeded. */
const run = (cmd, cmdArgs, opts = {}) =>
  spawnSync(cmd, cmdArgs, { stdio: 'inherit', shell: process.platform === 'win32', ...opts })
    .status === 0

const npm = (...a) => run('npm', a)

// ---------------------------------------------------------------------------

if (!existsSync('frontend') || !existsSync('backend')) {
  halt('Wrong directory', 'No frontend/ or backend/ here.', '  Run this from the repo root.')
}

// A dirty tree turns a merge conflict into a mess that is hard to unpick,
// so refuse before touching anything rather than halfway through.
heading('Checking the working tree is clean')
const dirty = capture('git', ['status', '--porcelain'])
if (dirty && !checkOnly) {
  halt(
    'You have uncommitted changes',
    dirty,
    '  Commit or stash them first:\n' +
    '    git add -A && git commit -m "wip"\n' +
    '    (or)  git stash',
  )
}
ok(dirty ? 'skipped (--check)' : 'clean')

const branch = capture('git', ['rev-parse', '--abbrev-ref', 'HEAD'])
note(`on branch "${branch}"`)

if (!checkOnly) {
  heading(`Fetching ${UPSTREAM.split('/')[0]} and ${TARGET}`)
  if (!run('git', ['fetch', '--all', '--quiet'])) halt('git fetch failed')
  ok('fetched')

  heading(`What's new on ${UPSTREAM}`)
  const incoming = capture('git', ['log', '--oneline', `HEAD..${UPSTREAM}`])
  if (!incoming) {
    ok('nothing new -- already up to date with Denrei')
  } else {
    const lines = incoming.split('\n')
    console.log(`${YELLOW}  ${lines.length} new commit(s):${OFF}`)
    lines.slice(0, 20).forEach(l => console.log(`      ${l}`))
    if (lines.length > 20) note(`...and ${lines.length - 20} more`)

    heading(`Merging ${UPSTREAM}`)
    if (!run('git', ['merge', '--no-edit', UPSTREAM])) {
      const conflicts = capture('git', ['diff', '--name-only', '--diff-filter=U'])
      halt(
        'Merge conflict -- a human has to resolve this',
        `${BOLD}Conflicted files:${OFF}\n${conflicts.split('\n').map(f => '  ' + f).join('\n')}`,
        '  App.tsx conflicts every time, because Denrei still works in the\n' +
        '  monolith and this repo is modular. Port his changes into the\n' +
        '  feature modules -- do NOT restore the old App.tsx.\n\n' +
        '  When resolved:  git add -A && git commit\n' +
        '  Then re-run:    npm run sync\n' +
        '  To abandon:     git merge --abort',
      )
    }
    ok('merged cleanly')
  }
}

// Verify. Order matters: cheapest and most informative failures first.
heading('Backend: compile')
if (!npm('--prefix', 'backend', 'run', 'build')) {
  halt('Backend does not compile',
    'tsc failed above.',
    '  Vercel runs this exact command, so the backend deploy would fail too.')
}
ok('tsc clean')

heading('Backend: tests')
if (!npm('--prefix', 'backend', 'test')) halt('Backend tests failed', 'See the failures above.')
ok('tests pass')

heading('Frontend: typecheck')
if (!npm('--prefix', 'frontend', 'run', 'typecheck')) {
  halt('Frontend does not typecheck',
    'tsc reported errors above.',
    '  Missing imports after a merge are the usual cause -- a declaration\n' +
    '  moved into a module without the symbols it depends on.')
}
ok('0 errors')

heading('Frontend: build')
if (!npm('--prefix', 'frontend', 'run', 'build')) halt('Frontend build failed')
ok('built')

// The failure mode that bit us: code shipped while its migrations sat unapplied,
// so the deployed app called database functions that did not exist yet.
heading('Checking for unapplied migrations')
let pending = []
let migrationsChecked = false
try {
  // shell:true because on Windows npx resolves to npx.cmd, which
  // execFileSync will not find on its own.
  const raw = execFileSync('npx --no-install supabase migration list', {
    encoding: 'utf8',
    shell: true,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  const match = raw.match(/\{"migrations".*\}/)
  if (match) {
    pending = JSON.parse(match[0]).migrations
      .filter(m => m.local && !m.remote)
      .map(m => m.local)
    migrationsChecked = true
  }
} catch {
  /* handled below -- never silently treated as "in sync" */
}
if (pending.length) {
  halt(
    `${pending.length} migration(s) committed but NOT applied to the database`,
    pending.map(p => '  ' + p).join('\n'),
    '  Apply them BEFORE pushing, or the deployed app will call database\n' +
    '  objects that do not exist yet:\n\n' +
    '    npx supabase db push --linked\n\n' +
    '  Then re-run: npm run sync',
  )
}
if (migrationsChecked) {
  ok('database is in sync -- nothing pending')
} else {
  // Unverified is not the same as fine. Say so plainly rather than
  // printing a green tick nobody earned.
  console.log(`${YELLOW}  !!${OFF}  could NOT verify migrations (Supabase unreachable or not linked)`)
  note('this check was skipped -- it is not a pass')
  note('verify before relying on it:  npx supabase migration list')
}

// ---------------------------------------------------------------------------

if (noPush || checkOnly) {
  console.log(`\n${GREEN}${BOLD}All checks passed.${OFF} Not pushing (${checkOnly ? '--check' : '--no-push'}).`)
  console.log(`${DIM}When ready:  git push ${TARGET} ${branch}:${TARGET_BRANCH}${OFF}\n`)
  process.exit(0)
}

heading(`Pushing ${branch} -> ${TARGET}/${TARGET_BRANCH} (this deploys)`)
if (!run('git', ['push', TARGET, `${branch}:${TARGET_BRANCH}`])) {
  halt('Push failed',
    'Most likely someone else pushed to main since your last fetch.',
    `  git fetch ${TARGET} && git merge ${TARGET}/${TARGET_BRANCH}\n  then re-run: npm run sync`)
}

console.log(`\n${GREEN}${BOLD}Done.${OFF} Vercel will deploy both projects automatically.`)
console.log(`${DIM}  frontend  https://container-crm-frontend.vercel.app`)
console.log(`  backend   https://container-crm-backend.vercel.app`)
console.log(`  status    npx vercel ls container-crm-frontend --cwd frontend${OFF}\n`)
