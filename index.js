// HTTP Server Request Handler
import Busboy from 'busboy'
import Stripe from 'stripe'
import constants from './constants.js'
import cookie from 'cookie'
import doNotCache from 'do-not-cache'
import escapeHTML from 'escape-html'
import fs from 'fs'
import grayMatter from 'gray-matter'
import html from './html.js'
import httpHash from 'http-hash'
import markdown from 'kemarkdown'
import parseURL from 'url-parse'
import path from 'path'
import querystring from 'querystring'
import readEnvironment from './environment.js'
import send from 'send'
import simpleConcatLimit from 'simple-concat-limit'

const environment = readEnvironment()
const stripe = new Stripe(environment.STRIPE_SECRET_KEY)

const agreement = grayMatter(fs.readFileSync('agreement.md'))

// Router

const routes = httpHash()

routes.set('/', serveHomepage)
routes.set('/pay', servePay)
routes.set('/agree', serveAgree)
routes.set('/privacy', servePrivacy)
routes.set('/stripe-webhook', serveStripeWebhook)
routes.set('/version/:version', requireCookie(serveVersion))

if (!environment.production) {
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
  title = constants.website,
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
<meta name="og:site" content="${escapeHTML(constants.website)}">
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
  <h1>${constants.website}</h1>
  <p class=slogan>${escapeHTML(constants.slogan)}</p>
</header>
`

const footer = `
<footer role=contentinfo>
  <a class=spaced href=/>About</a>
  <a class=spaced href=/agree>Agreement</a>
  <a class=spaced href=mailto:${constants.support}>E-Mail</a>
  <a class=spaced href=/credits.txt>Credits</a>
</footer>
`

const nav = `
<nav role=navigation>
</nav>
`

// Routes

function serveHomepage (request, response) {
  if (request.method !== 'GET') return serve405(request, response)
  doNotCache(response)
  response.setHeader('Content-Type', 'text/html')
  response.end(html`
<!doctype html>
<html lang=en-US>
  <head>
    ${meta({
      title: constants.website,
      description: constants.slogan
    })}
    <title>${constants.website}</title>
  </head>
  <body>
    ${nav}
    ${header}
    <main role=main>
    </main>
    ${footer}
  </body>
</html>
  `)
}

const agreeForm = {
  name: 'terms',
  value: 'accepted'
}

function serveAgree (request, response) {
  const { method } = request
  if (method === 'POST') {
    let parser
    let valid = false
    try {
      parser = new Busboy({
        headers: request.headers,
        limits: {
          fieldNameSize: agreeForm.name.length,
          fields: 1,
          fieldSizeLimit: agreeForm.value.length,
          parts: 1
        }
      })
        .once('field', (name, value, truncated, encoding, mime) => {
          if (name === agreeForm.name && value === agreeForm.value) {
            valid = true
          }
        })
        .once('finish', () => {
          if (valid) {
            const expires = new Date(
              Date.now() + (30 * 24 * 60 * 60 * 1000)
            )
            setCookie(response, agreement.data.version, expires)
            const location = request.parsed.query.destination || '/'
            serve303(request, response, location)
          } else {
            serveAgreeForm(request, response)
          }
        })
      request.pipe(parser)
    } catch (error) {
      response.statusCode = 400
      response.end()
    }
  } else if (method === 'GET') {
    serveAgreeForm(request, response)
  } else {
    serve405(request, response)
  }
}

function serveAgreeForm (request, response) {
  response.setHeader('Content-Type', 'text/html')
  response.end(html`
<!doctype html>
<html lang=en-US>
  <head>
    ${meta({
      title: agreement.data.title,
      description: agreement.data.description
    })}
    <title>${escapeHTML(agreement.data.title)}</title>
  </head>
  <body>
    ${header}
    <main role=main>
      <form id=passwordForm method=post>
        <input type=hidden name=${agreeForm.name} value=${agreeForm.value}>
        <h2>${escapeHTML(agreement.data.title)}</h2>
        <p id=version>Version ${escapeHTML(agreement.data.version)}</p>
        ${markdown(agreement.content)}
        <button type=submit>Agree</button>
      </form>
    </main>
    ${footer}
  </body>
</html>
  `)
}

function servePay (request, response) {
  serve404(request, response)
}

function serveVersion (request, response) {
  serve404(request, response)
}

function servePrivacy (request, response) {
  serve404(request, response)
}

function serveStripeWebhook (request, response) {
  simpleConcatLimit(request, 32768, (error, buffer) => {
    if (error) {
      request.log.error(error)
      response.statusCode = 413
      return response.end()
    }

    let event
    try {
      event = stripe.webhooks.constructEvent(
        // constructEvent wants the raw, unparsed JSON request body.
        buffer.toString(),
        request.headers['stripe-signature'],
        process.env.STRIPE_WEBHOOK_SECRET
      )
    } catch (error) {
      request.log.warn(error)
      response.statusCode = 400
      return response.end()
    }

    const { id, type } = event
    request.log.info({ id, type }, 'Stripe webhook event')

    rejectEvent()
  })

  function acceptEvent () {
    response.statusCode = 200
    response.end()
  }

  function rejectEvent () {
    response.statusCode = 400
    response.end()
  }
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
    ${nav}
    ${header}
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

function requireCookie (request, response, handler) {
  return (request, reponse) => {
    const header = request.headers.cookie
    if (!header) return redirect()
    const parsed = cookie.parse(header)
    const version = parsed[constants.cookie]
    if (!version) return redirect()
    if (version !== agreement.data.version) return redirect()
    handler(request, response)
  }

  function redirect () {
    const location = '/agree?' + querystring.stringify({
      destination: request.url
    })
    serve303(request, response, location)
  }
}

function setCookie (response, value, expires) {
  response.setHeader(
    'Set-Cookie',
    cookie.serialize(constants.cookie, value, {
      expires,
      httpOnly: true,
      sameSite: 'strict',
      secure: environment.production
    })
  )
}
