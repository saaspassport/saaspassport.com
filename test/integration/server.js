import assert from 'assert'
import fs from 'fs'
import handle from '../../index.js'
import http from 'http'
import path from 'path'
import pino from 'pino'
import pinoHTTP from 'pino-http'
import readEnvironment from '../../environment.js'
import testEvents from '../../test-events.js'

export default (callback, port) => {
  assert(typeof callback === 'function')
  port = port === undefined ? 0 : port
  const logger = pino({}, fs.createWriteStream('test-server.log'))
  const addLoggers = pinoHTTP({ logger })
  process.env.DIRECTORY = path.join('test', 'directory')
  const webServer = http.createServer((request, response) => {
    addLoggers(request, response)
    handle(request, response)
  })
  webServer.listen(port, function () {
    const port = this.address().port
    process.env.BASE_HREF = 'http://localhost:' + port
    process.env.STRIPE_LINK = 'https://buy.stripe.com/test_fZe6rX93U2jB4mc289'
    const environment = readEnvironment()
    if (environment.missing.length !== 0) {
      cleanup()
      environment.missing.forEach(missing => {
        process.stderr.write(`Missing environment variable: ${missing}\n`)
      })
      assert(false)
    }
    callback(port, cleanup)
  })

  function cleanup () {
    testEvents.removeAllListeners()
    if (webServer) webServer.close()
  }
}
