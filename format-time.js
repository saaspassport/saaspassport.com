export default (string) => {
  const date = new Date(string)
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeStyle: 'long' }).format(date)
}
