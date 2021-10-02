// `npm start` runs this script.

import readEnvironment from './environment.js'
import requestHandler from './index.js'
import http from 'http'
import pino from 'pino'
import pinoHTTP from 'pino-http'
import toobusy from 'toobusy-js'

// Logging

const logger = pino()
const addLoggers = pinoHTTP({ logger })

// Environment

const environment = readEnvironment()
if (environment.missing.length !== 0) {
  environment.missing.forEach(missing => {
    logger.error({ variable: missing }, 'missing environment variable')
  })
  process.exit(1)
}

// Error Handling

process
  .on('SIGTERM', shutdown)
  .on('SIGQUIT', shutdown)
  .on('SIGINT', shutdown)
  .on('uncaughtException', (error) => {
    logger.error(error, 'uncaughtException')
    shutdown()
  })

// HTTP Server

const server = http.createServer()

server.on('request', (request, response) => {
  try {
    addLoggers(request, response)
    if (toobusy()) {
      response.statusCode = 503
      response.end('Server Too Busy')
    }
    requestHandler(request, response)
  } catch (error) {
    request.log.error(error)
  }
})

server.listen(process.env.PORT || 8080, () => {
  logger.info({ port: server.address().port }, 'listening')
})

function shutdown () {
  server.close(() => process.exit())
}
