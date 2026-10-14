import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const dist = join(process.cwd(), 'dist')
const outDir = join(process.cwd(), 'release')
const src = join(dist, 'index.html')

if (!existsSync(src)) {
  console.error('dist/index.html not found. Run the single-file build first.')
  process.exit(1)
}

mkdirSync(outDir, { recursive: true })
const dest = join(outDir, 'VSP-Vessel-Schedule-Platform.html')
copyFileSync(src, dest)

const size = statSync(dest).size
const mb = (size / (1024 * 1024)).toFixed(2)
console.log(`Single-file build ready:`)
console.log(`  ${dest}`)
console.log(`  ${(size / 1024).toFixed(0)} KB (${mb} MB)`)
console.log(`Open by double-clicking the HTML file in a browser.`)

// Helpful: list leftover assets if any (should be none / unused with singlefile)
const leftovers = readdirSync(dist).filter((name) => name !== 'index.html')
if (leftovers.length) {
  console.log(`(dist also contains: ${leftovers.join(', ')})`)
}
