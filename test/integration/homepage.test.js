import constants from '../../constants.js'
import http from 'http'
import interactive from './interactive.js'
import parse5 from 'parse5'
import server from './server.js'
import simpleConcat from 'simple-concat'
import tap from 'tap'

tap.test('parse homepage', test => {
  server((port, close) => {
    http.request({ port })
      .once('response', response => {
        simpleConcat(response, (error, buffer) => {
          test.error(error, 'no concat error')
          const string = buffer.toString()
          test.doesNotThrow(() => parse5.parse(string), 'valid HTML5')
          test.end()
          close()
        })
      })
      .end()
  })
})

interactive('visit homepage', async ({ page, port, test }) => {
  await page.goto(`http://localhost:${port}`)
  const h1Text = await page.textContent('h1')
  test.equal(h1Text, constants.website, `h1 says "${constants.website}"`)
})
