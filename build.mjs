/**
 * Build the node half (plain tsc-free: one hand-written file is copied) and the
 * browser half through tsdown.
 *
 * `lib/index.js` is authored directly as ESM source under `src/index.js` so no
 * compiler is needed for it; this script only has to place it and then run
 * tsdown for the client bundle.
 */
import { copyFileSync, mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(root, 'lib'), { recursive: true })
copyFileSync(join(root, 'src/index.js'), join(root, 'lib/index.js'))

// Windows resolves the tsdown shim through its .cmd wrapper, which spawn()
// refuses without a shell.
const result = spawnSync('tsdown', [], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' })
if (result.error !== undefined) throw result.error
process.exit(result.status ?? 1)
