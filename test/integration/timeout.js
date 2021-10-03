export default function (delay) {
  return new Promise(function (resolve) {
    setTimeout(resolve, delay)
  })
}
