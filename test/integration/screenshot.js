import assert from 'assert'
import path from 'path'

export default async ({ test, page, title }) => {
  assert(typeof page === 'object')
  assert(typeof test === 'string')
  assert(typeof title === 'string')
  await page.screenshot({
    path: path.join('test', 'screenshots', `${test}-${title}.png`),
    fullPage: true
  })
}
