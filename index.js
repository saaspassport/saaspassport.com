// HTTP Server Request Handler
import Busboy from 'busboy'
import constants from './constants.js'
import cookie from 'cookie'
import doNotCache from 'do-not-cache'
import escapeHTML from 'escape-html'
import formatTime from './format-time.js'
import fs from 'fs'
import grayMatter from 'gray-matter'
import html from './html.js'
import httpHash from 'http-hash'
import markdown from 'kemarkdown'
import mustache from 'mustache'
import parseURL from 'url-parse'
import path from 'path'
import querystring from 'querystring'
import runParallel from 'run-parallel'
import semver from 'semver'
import send from 'send'
import yaml from 'js-yaml'

const about = preloadMarkdown('about.md')
const contribute = preloadMarkdown('contribute.md')
const thanks = preloadMarkdown('thanks.md')
const versionsBlurb = preloadMarkdown('versions.md')
const accessTerms = (() => {
  const { content: markdown, data: { version, title, description } } = grayMatter(fs.readFileSync('access.md'))
  return { version, title, description, markdown }
})()
function preloadMarkdown (file) {
  return replaceConstants(markdown(fs.readFileSync(file, 'utf8'), { unsafe: true }))
}

// Router

const routes = httpHash()

routes.set('/', serveHomepage)
routes.set('/pay', servePay)
const accessHREF = '/access'
routes.set(accessHREF, serveAccess)
routes.set('/privacy', servePrivacy)
routes.set('/versions', serveVersionsIndex)
routes.set('/versions/:version', requireCookie(serveVersion))
routes.set('/contribute', serveContribute)
routes.set('/thanks', serveThanks)

if (process.env.NODE_ENV !== 'production') {
  routes.set('/internal-error', (request, response) => {
    serve500(request, response, new Error('test error'))
  })
}

for (const file of [
  'ads.txt',
  'styles.css',
  'normalize.css',
  'credits.txt',
  'security.txt',
  'logo.svg',
  'logo-on-white-100.png'
]) {
  routes.set(`/${file}`, (request, response) => {
    send(request, file).pipe(response)
  })
}

// HTTP Request Handler

export default (request, response) => {
  const parsed = request.parsed = parseURL(request.url, true)
  const pathname = request.pathname = parsed.pathname
  request.query = parsed.query
  const { handler, params } = routes.get(pathname)
  if (handler) {
    request.parameters = params
    return handler(request, response)
  }
  serve404(request, response)
}

// Partials

function meta ({
  title = constants.name,
  description = constants.slogan
}) {
  let returned = html`
<meta charset=UTF-8>
<meta name=viewport content="width=device-width, initial-scale=1">
  `
  if (description) {
    returned += html`
<meta name="description" content="${escapeHTML(description)}">
    `
  }
  if (title && description) {
    returned += html`
<meta name="twitter:card" content="summary">
<meta name="twitter:description" content="${escapeHTML(description)}">
<meta name="twitter:image" content="${process.env.BASE_HREF}/logo-on-white-100.png">
<meta name="twitter:site" content="@${constants.twitter}">
<meta name="twitter:title" content="${escapeHTML(title)}">
<meta name="og:type" content="website">
<meta name="og:title" content="${escapeHTML(title)}">
<meta name="og:description" content="${escapeHTML(description)}">
<meta name="og:image" content="${process.env.BASE_HREF}/logo-on-white-100.png">
<meta name="og:site" content="${escapeHTML(constants.name)}">
    `
  }
  returned += html`
<link href=/normalize.css rel=stylesheet>
<link href=/styles.css rel=stylesheet>
  `
  return returned
}

const header = `
<header role=banner>
  <a href=/><img src=/logo.svg id=logo alt=logo></a>
  <h1>${constants.name}</h1>
  <p class=slogan>${escapeHTML(constants.slogan)}</p>
</header>
`

const footer = `
<footer role=contentinfo>
  <a href=${accessHREF}>Access Agreement</a>
  <a href=mailto:${constants.email}>E-Mail</a>
  <a href=/credits.txt>Software Credits</a>
  <a href=/thanks>Thanks</a>
  <p>an <a href=https://artlessdevices.com>Artless Devices</a> project</p>
</footer>
`

const latestVersionHREF = '/versions/latest'

const nav = `
<nav role=navigation>
  <a href=/>About</a>
  <a href=${latestVersionHREF}>Latest Terms</a>
  <a href=/versions>Versions</a>
  <a href=/pay>Pay</a>
  <a href=/contribute>Contribute</a>
</nav>
`

// Routes

function serveHomepage (request, response) {
  if (request.method !== 'GET') return serve405(request, response)
  response.setHeader('Content-Type', 'text/html')
  response.end(html`
<!doctype html>
<html lang=en-US>
  <head>
    ${meta({
      title: constants.name,
      description: constants.slogan
    })}
    <title>${constants.name}</title>
  </head>
  <body>
    ${header}
    ${nav}
    <main role=main>
      ${about}
    </main>
    ${footer}
  </body>
</html>
  `)
}

function serveContribute (request, response) {
  serveStatic(request, response, {
    content: thanks,
    title: `Contribute to ${constants.name}`,
    heading: 'Contribute',
    description: constants.slogan
  })
}

function serveThanks (request, response) {
  serveStatic(request, response, {
    content: thanks,
    title: `${constants.name} Thanks`,
    heading: 'Thanks',
    description: constants.slogan
  })
}

function serveStatic (request, response, { title, heading, description, content }) {
  if (request.method !== 'GET') return serve405(request, response)
  response.setHeader('Content-Type', 'text/html')
  response.end(html`
<!doctype html>
<html lang=en-US>
  <head>
    ${meta({ title, description })}
    <title>${escapeHTML(title)}</title>
  </head>
  <body>
    ${header}
    ${nav}
    <main role=main>
      <h2>${escapeHTML(heading)}</h2>
      ${content}
    </main>
    ${footer}
  </body>
</html>
  `)
}

function serveAccess (request, response) {
  const { method } = request
  if (method === 'POST') {
    let parser
    let valid = false
    try {
      parser = new Busboy({
        headers: request.headers,
        limits: {
          fieldNameSize: 'version'.length,
          fields: 1,
          fieldSizeLimit: new Date().toISOString().length,
          parts: 1
        }
      })
        .once('field', (name, value, truncated, encoding, mime) => {
          if (name === 'version' && value === accessTerms.version) {
            valid = true
          }
        })
        .once('finish', () => {
          if (valid) {
            setCookie(response, accessTerms.version)
            const location = request.query.destination || latestVersionHREF
            serve303(request, response, location)
          } else {
            serveAccessForm(request, response)
          }
        })
      request.pipe(parser)
    } catch (error) {
      response.statusCode = 400
      response.end()
    }
  } else if (method === 'GET') {
    serveAccessForm(request, response)
  } else {
    serve405(request, response)
  }
}

function serveAccessForm (request, response) {
  doNotCache(response)
  clearCookie(response)
  response.setHeader('Content-Type', 'text/html')
  response.end(html`
<!doctype html>
<html lang=en-US>
  <head>
    ${meta({
      title: accessTerms.title,
      description: accessTerms.description
    })}
    <title>${escapeHTML(accessTerms.title)}</title>
  </head>
  <body>
    ${header}
    ${nav}
    <main role=main>
      <form id=passwordForm method=post>
        <input type=hidden name=version value=${accessTerms.version}>
        <h2>${escapeHTML(accessTerms.title)}</h2>
        <p id=version>These terms were last updated on ${formatTime(accessTerms.version)}.</p>
        ${markdown(accessTerms.markdown)}
        <button id=agree type=submit>Agree</button>
      </form>
    </main>
    ${footer}
  </body>
</html>
  `)
}

function servePay (request, response) {
  serve302(request, response, process.env.STRIPE_LINK)
}

function serveVersionsIndex (request, response) {
  if (request.method !== 'GET') return serve405(request, response)
  response.setHeader('Content-Type', 'text/html')
  readVersions((error, versions) => {
    if (error) return serve500(request, response, error)
    const title = `${constants.name} Versions`
    response.end(html`
<!doctype html>
<html lang=en-US>
  <head>
    ${meta({
      title: title,
      description: constants.slogan
    })}
    <title>${escapeHTML(title)}</title>
  </head>
  <body>
    ${header}
    ${nav}
    <main role=main>
      <h2>Versions</h2>
      ${versionsBlurb}
      <ul>
        ${versions.map(v => `<li><a href=/versions/${escapeHTML(v)}>Version ${escapeHTML(v)}</a></li>`)}
      </ul>
    </main>
    ${footer}
  </body>
</html>
    `)
  })
}

function serveVersion (request, response) {
  const { version } = request.parameters
  if (version === 'latest') {
    return redirectToLatestVersion(request, response)
  }
  runParallel({
    prompts: done => {
      const file = path.join(process.env.DIRECTORY, 'versions', version, 'prompts.yml')
      fs.readFile(file, 'utf8', (error, data) => {
        if (error) return done(error)
        let parsed
        try {
          parsed = yaml.load(data, { schema: yaml.JSON_SCHEMA })
        } catch (error) {
          return done(error)
        }
        done(null, parsed)
      })
    },
    terms: readTemplate('terms'),
    order: readTemplate('order')
  }, (error, results) => {
    if (error) return serve500(request, response, error)
    response.setHeader('Content-Type', 'text/html')
    response.end(html`
<!doctype html>
<html lang=en-US>
  <head>
    ${meta({
      title: `${constants.name} ${version}`,
      description: constants.slogan
    })}
    <title>${constants.name}</title>
  </head>
  <body>
    ${header}
    ${nav}
    <main role=main>
      <h2>Version ${version}</h2>
      <h3>Prompts</h3>
      <pre>${escapeHTML(results.prompts)}</pre>
      <h3>Order</h3>
      <pre>${escapeHTML(results.order)}</pre>
      <h3>Terms</h3>
      <pre>${escapeHTML(results.terms)}</pre>
    </main>
    ${footer}
  </body>
</html>
    `)
  })

  function readTemplate (basename) {
    return done => {
      const file = path.join(process.env.DIRECTORY, 'versions', version, `${basename}.md`)
      fs.readFile(file, 'utf8', done)
    }
  }
}

function redirectToLatestVersion (request, response) {
  readLatestVersion((error, version) => {
    if (error) return serve500(request, response, error)
    serve302(request, response, `/versions/${version}`)
  })
}

function servePrivacy (request, response) {
  serve404(request, response)
}

function serve404 (request, response) {
  response.statusCode = 404
  const title = 'Not Found'
  response.setHeader('Content-Type', 'text/html')
  response.end(`
<!doctype html>
<html lang=en-US>
  <head>
    ${meta({})}
    <title>${title}</title>
  </head>
  <body>
    ${header}
    ${nav}
    <main role=main>
      <h2>${title}</h2>
      <p>The page you tried to visit doesn’t exist on this site.</p>
    </main>
    ${footer}
  </body>
</html>
  `)
}

function serve500 (request, response, error) {
  request.log.error(error)
  response.statusCode = 500
  const title = 'Internal Error'
  response.setHeader('Content-Type', 'text/html')
  response.end(html`
<!doctype html>
<html lang=en-US>
  <head>
    ${meta({})}
    <title>${title}</title>
  </head>
  <body>
    <main role=main>
      <h1>${title}</h1>
      <p>The server ran into an error.</p>
      <p>
        If you'd like, you can
        <a href=mailto:${constants.support}>e-mail support</a>,
        pasting in this unique support number:
        <code>${escapeHTML(request.id)}</code>
      </p>
    </main>
    ${footer}
  </body>
</html>
  `)
}

function serve405 (request, response) {
  response.statusCode = 405
  response.setHeader('Content-Type', 'text/plain')
  response.end('Method Not Allowed')
}

function serve303 (request, response, location) {
  response.statusCode = 303
  response.setHeader('Location', location)
  response.end()
}

function serve302 (request, response, location) {
  response.statusCode = 302
  response.setHeader('Location', location)
  response.end()
}

function requireCookie (handler) {
  return (request, response) => {
    const header = request.headers.cookie
    if (!header) return redirect()
    const parsed = cookie.parse(header)
    const version = parsed[constants.cookie.name]
    if (!version) return redirect()
    if (version !== accessTerms.version) return redirect()
    handler(request, response)

    function redirect () {
      const query = querystring.stringify({ destination: request.url })
      const location = accessHREF + '?' + query
      serve303(request, response, location)
    }
  }
}

function setCookie (response, value) {
  const expires = new Date(
    Date.now() + (constants.cookie.days * 24 * 60 * 60 * 1000)
  )
  response.setHeader(
    'Set-Cookie',
    cookie.serialize(constants.cookie.name, value, {
      expires,
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production'
    })
  )
}

function clearCookie (response) {
  setCookie(response, '', new Date('1970-01-01'))
}

function readVersions (callback) {
  const directory = path.join(process.env.DIRECTORY, 'versions')
  fs.readdir(directory, (error, entries) => {
    if (error) return callback(error)
    const versions = entries
      .filter(semver.valid)
      .sort(semver.rcompare)
    callback(null, versions)
  })
}

function readLatestVersion (callback) {
  readVersions((error, versions) => {
    if (error) return callback(error)
    callback(null, versions[0])
  })
}

function replaceConstants (template) {
  return mustache.render(template, constants)
}
