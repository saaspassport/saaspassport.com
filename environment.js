// Environment Variable Parsing and Validation
export default () => {
  const variables = [
    { name: 'BASE_HREF', required: true },
    { name: 'DIRECTORY', required: true },
    { name: 'STRIPE_LINK', required: true }
  ]
  const returned = { missing: [] }
  variables.forEach(variable => {
    const name = variable.name
    const value = process.env[name]
    if (!value) returned.missing.push(name)
    else returned[name] = value
  })
  returned.production = process.env.NODE_ENV === 'production'

  return returned
}
