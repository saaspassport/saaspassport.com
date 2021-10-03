import constants from '../../constants.js'
import fs from 'fs'
import http from 'http'
import rimraf from 'rimraf'
import simpleConcat from 'simple-concat'
import { spawn } from 'child_process'
import tap from 'tap'

tap.test('server', test => {
  fs.mkdtemp('/tmp/', (_, directory) => {
    const serverPort = 8989
    const server = spawn('node', ['server.js'], {
      env: {
        PORT: serverPort.toString(),
        PATH: process.env.PATH,
        NODE_ENV: 'test',
        BASE_HREF: 'http://localhost:' + serverPort + '/',
        DIRECTORY: directory
      }
    })
    server.stdout.once('data', () => {
      test.pass('spawned server')
      http.request(`http://localhost:${serverPort}`)
        .once('response', response => {
          simpleConcat(response, (error, buffer) => {
            test.error(error, 'no concat error')
            test.ok(
              buffer.toString().includes(`<h1>${constants.name}</h1>`),
              `output includes <h1>${constants.name}</h1>`
            )
            server.kill(9)
            rimraf.sync(directory)
            test.end()
          })
        })
        .end()
    })
  })
})
