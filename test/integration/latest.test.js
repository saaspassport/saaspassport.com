import interactive from './interactive.js'

interactive('latest version', async ({ page, port, test }) => {
  await page.goto(`http://localhost:${port}`)
  await page.click('#latest')
  await page.click('#agree')
  await page.waitForURL(`http://localhost:${port}/versions/1.0.0`)
  const h2Text = await page.textContent('h2')
  test.equal(h2Text, 'Version 1.0.0', 'Version 1.0.0')
})
