// HTTP Server Request Handler
import Busboy from 'busboy'
import constants from './constants.js'
import cookie from 'cookie'
import doNotCache from 'do-not-cache'
import escapeHTML from 'escape-html'
import etag from 'etag'
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
import relativeDate from 'tiny-relative-date'
import runParallel from 'run-parallel'
import semver from 'semver'
import yaml from 'js-yaml'
import { spawnSync } from 'child_process'

const about = preloadMarkdown('about.md')
const contribute = preloadMarkdown('contribute.md')
const thanks = preloadMarkdown('thanks.md')
const contact = preloadMarkdown('contact.md')
const versionsBlurb = preloadMarkdown('versions.md')
const dealTerms = (() => {
  const { content, data: { title, description } } = grayMatter(fs.readFileSync('deal.md', 'utf8'))
  return {
    title,
    description,
    content: preprocessMarkdown(content)
  }
})()
dealTerms.version = new Date(spawnSync('/usr/bin/git', ['log', '-1', '--format="%ad"', '--date=rfc', '--', 'deal.md']).stdout.toString()).toISOString()

function preloadMarkdown (file) {
  return preprocessMarkdown(fs.readFileSync(file, 'utf8'))
}

function preprocessMarkdown (text) {
  return replaceConstants(markdown(text, { unsafe: true }))
}

// Router

const routes = httpHash()

routes.set('/', serveHomepage)
routes.set('/pay', servePay)
const dealHREF = '/deal'
routes.set(dealHREF, serveDeal)
routes.set('/privacy', servePrivacy)
routes.set('/versions', serveVersionsIndex)
routes.set('/versions/:version', requireCookie(serveVersion))
routes.set('/contribute', serveContribute)
routes.set('/thanks', serveThanks)
routes.set('/contact', serveContact)

if (process.env.NODE_ENV !== 'production') {
  routes.set('/internal-error', (request, response) => {
    serve500(request, response, new Error('test error'))
  })
}

const staticFiles = {
  'ads.txt': 'text/plain; charset=UTF-8',
  'styles.css': 'text/css; charset=UTF-8',
  'normalize.css': 'text/css; charset=UTF-8',
  'credits.txt': 'text/plain; charset=UTF-8',
  'security.txt': 'text/plain; charset=UTF-8',
  'logo.svg': 'image/svg+xml',
  'logo-on-white-100.png': 'image/png'
}
for (const name in staticFiles) {
  const data = fs.readFileSync(name, 'utf8')
  staticFiles[name] = {
    content: staticFiles[name],
    data,
    etag: etag(data)
  }
  routes.set(`/${name}`, (request, response) => {
    const { etag, data, content } = staticFiles[name]
    response.setHeader('Content-Type', content)
    response.setHeader('ETag', etag)
    response.end(data)
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
<meta name="twitter:site" content="@${escapeHTML(constants.twitter)}">
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
  <h1>${escapeHTML(constants.name)}</h1>
  <p class=slogan>${escapeHTML(constants.slogan)}</p>
</header>
`

const footer = `
<footer role=contentinfo>
  <a href=${dealHREF}>Deal</a>
  <a href=/contact>Contact</a>
  <a href=/credits.txt>Software</a>
  <a href=/thanks>Thanks</a>
  <p>an <a href=https://artlessdevices.com>Artless Devices</a> project</p>
</footer>
`

const latestVersionHREF = '/versions/latest'

const nav = `
<nav role=navigation>
  <a href=/>About</a>
  <a id=latest href=${latestVersionHREF}>Terms</a>
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
    <title>${escapeHTML(constants.name)}</title>
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
    content: contribute,
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

function serveContact (request, response) {
  serveStatic(request, response, {
    content: contact,
    title: 'Contact',
    heading: 'Contact',
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

function serveDeal (request, response) {
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
          if (name === 'version' && value === dealTerms.version) {
            valid = true
          }
        })
        .once('finish', () => {
          if (valid) {
            setCookie(response, dealTerms.version)
            const location = request.query.destination || latestVersionHREF
            serve303(request, response, location)
          } else {
            serveDealForm(request, response)
          }
        })
      request.pipe(parser)
    } catch (error) {
      response.statusCode = 400
      response.end()
    }
  } else if (method === 'GET') {
    serveDealForm(request, response)
  } else {
    serve405(request, response)
  }
}

function serveDealForm (request, response) {
  doNotCache(response)
  if (
    request.headers.cookie &&
    cookie.parse(request.headers.cookie)[constants.cookie.name] !== dealTerms.version
  ) clearCookie(response)
  const title = `${dealTerms.title} — ${constants.name}`
  response.setHeader('Content-Type', 'text/html')
  response.end(html`
<!doctype html>
<html lang=en-US>
  <head>
    ${meta({
      title,
      description: dealTerms.description
    })}
    <title>${escapeHTML(title)}</title>
  </head>
  <body>
    ${header}
    ${nav}
    <main role=main>
      <form id=passwordForm method=post>
        <input type=hidden name=version value="${dealTerms.version}">
        <p id=version>These terms were last updated ${escapeHTML(relativeDate(new Date(dealTerms.version)))}, on ${escapeHTML(formatTime(dealTerms.version))}.</p>
        <button id=agree type=submit>Agree and Continue</button>
        ${dealTerms.content}
        <button type=submit>Agree and Continue</button>
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
    <title>${escapeHTML(constants.name)}</title>
  </head>
  <body>
    ${header}
    ${nav}
    <main role=main>
      <h2>Version ${escapeHTML(version)}</h2>
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
    <title>${escapeHTML(title)}</title>
  </head>
  <body>
    ${header}
    ${nav}
    <main role=main>
      <h2>${escapeHTML(title)}</h2>
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
    <title>${escapeHTML(title)}</title>
  </head>
  <body>
    <main role=main>
      <h1>${escapeHTML(title)}</h1>
      <p>The server ran into an error.</p>
      <p>
        If you'd like, you can
        <a href=mailto:${escapeHTML(constants.email)}>e-mail support</a>,
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
    if (version !== dealTerms.version) return redirect()
    handler(request, response)

    function redirect () {
      const query = querystring.stringify({ destination: request.url })
      const location = dealHREF + '?' + query
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
