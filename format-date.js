export default (string) => {
  const date = new Date(string)
  date.setUTCHours(12)
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(date)
}
