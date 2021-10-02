// HTTP Server Request Handler
import Stripe from 'stripe'
import constants from './constants.js'
// import cookie from 'cookie'
import doNotCache from 'do-not-cache'
import escapeHTML from 'escape-html'
import fs from 'fs'
import grayMatter from 'gray-matter'
import html from './html.js'
import httpHash from 'http-hash'
import markdown from 'kemarkdown'
import parseURL from 'url-parse'
import path from 'path'
import readEnvironment from './environment.js'
import send from 'send'
import simpleConcatLimit from 'simple-concat-limit'

const environment = readEnvironment()
const stripe = new Stripe(environment.STRIPE_SECRET_KEY)

// Router

const routes = httpHash()

routes.set('/', serveHomepage)
routes.set('/pay', servePay)
routes.set('/agree', serveAgree)
routes.set('/terms', serveTerms)
routes.set('/privacy', servePrivacy)
routes.set('/stripe-webhook', serveStripeWebhook)

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

for (const basename of ['about']) {
  routes.set(`/${basename}`, (request, response) => {
    serveStaticPage(request, response, basename)
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
  <a class=spaced href=/about>About</a>
  <a class=spaced href=/terms>Terms of Service</a>
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

function serveAgree (request, response) {
  serve404(request, response)
}

function servePay (request, response) {
  serve404(request, response)
}

function serveTerms (request, response) {
  serve404(request, response)
}

function servePrivacy (request, response) {
  serve404(request, response)
}

function serveStaticPage (request, response, slug) {
  fs.readFile(
    path.join('pages', `${slug}.md`),
    'utf8',
    (error, read) => {
      if (error) {
        if (error.code === 'ENOENT') {
          return serve404(request, response)
        }
        return serve500(request, response, error)
      }
      const { content, data: { title, summary } } = grayMatter(read)
      response.setHeader('Content-Type', 'text/html')
      response.end(html`
<!doctype html>
<html lang=en-US>
  <head>
    ${meta({ title, description: summary })}
    <title>${escapeHTML(title)}</title>
  </head>
  <body>
    ${nav}
    ${header}
    <main role=main>
      <h1>${escapeHTML(title)}</h1>
      ${markdown(content, { unsafe: true })}
    </main>
    ${footer}
  </body>
</html>
      `)
    }
  )
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
