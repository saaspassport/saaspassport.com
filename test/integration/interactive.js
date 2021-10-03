import playwright from 'playwright'
import server from './server.js'
import tap from 'tap'

export default (label, logic, port = 0) => {
  tap.test(label, test => {
    server((port, done) => {
      test.teardown(done)
      ;(async () => {
        let browser
        try {
          browser = await playwright.chromium.launch({
            headless: !process.env.HEADFUL
          })
          const context = await browser.newContext()
          const page = await context.newPage()
          await logic({ test, page, port })
        } catch (error) {
          test.error(error)
        } finally {
          if (browser) await browser.close()
          test.end()
        }
      })()
    }, port)
  })
}
