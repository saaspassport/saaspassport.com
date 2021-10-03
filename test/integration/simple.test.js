import constants from '../../constants.js'
import fs from 'fs'
import handle from '../../index.js'
import http from 'http'
import os from 'os'
import path from 'path'
import pino from 'pino'
import pinoHTTP from 'pino-http'
import rimraf from 'rimraf'
import simpleConcat from 'simple-concat'
import tap from 'tap'

simple({
  path: '/',
  status: 200,
  mime: 'text/html',
  content: '<!doctype html>'
})

simple({
  path: '/styles.css',
  status: 200,
  mime: 'text/css; charset=UTF-8',
  content: 'font-family'
})

simple({
  path: '/security.txt',
  status: 200,
  mime: 'text/plain; charset=UTF-8',
  content: 'security@'
})

simple({
  path: '/nonexistent',
  status: 404,
  mime: 'text/html',
  content: '<!doctype html>'
})

simple({
  path: '/internal-error',
  status: 500,
  mime: 'text/html',
  content: '<!doctype html>'
})

simple({
  method: 'POST',
  path: '/',
  status: 405,
  mime: 'text/plain',
  content: 'Method Not Allowed'
})

function simple ({
  auth,
  method = 'GET',
  path,
  status,
  mime,
  content
}) {
  tap.test(`${method} ${path}`, test => {
    server((port, close) => {
      http.request({ auth, method, port, path })
        .once('response', response => {
          if (status) {
            test.equal(response.statusCode, status, String(status))
          }
          if (mime) {
            test.equal(response.headers['content-type'], mime, mime)
          }
          if (content) {
            return simpleConcat(response, (error, body) => {
              test.error(error, 'no error')
              test.assert(
                body.toString().includes(content),
                content
              )
              test.end()
              close()
            })
          }
          test.end()
          close()
        })
        .end()
    })
  })
}

function server (callback) {
  const logger = pino({}, fs.createWriteStream('test-server.log'))
  const server = http.createServer()
  const addLoggers = pinoHTTP({ logger })
  const tmpdir = path.join(os.tmpdir(), constants.name.toLowerCase() + '-test')
  fs.mkdtemp(tmpdir, (error, directory) => {
    if (error) throw error
    process.env.DIRECTORY = directory
    server.on('request', (request, response) => {
      addLoggers(request, response)
      handle(request, response)
    })
    server.listen(0, function () {
      const port = this.address().port
      callback(port, cleanup)
    })
    function cleanup () {
      server.close(() => {
        rimraf(directory, () => { })
      })
    }
  })
}
