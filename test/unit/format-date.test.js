import tap from 'tap'
import formatDate from '../../format-date.js'

tap.test('format date', test => {
  const iso = '2020-11-27T18:04:16.354Z'
  test.equal(formatDate(iso), 'November 27, 2020')
  test.end()
})
