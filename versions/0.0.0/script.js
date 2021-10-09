document.addEventListener('DOMContentLoaded', () => {
  const main = document.querySelector('main[role=main]')
  const aside = document.createElement('aside')
  aside.className = 'info'
  aside.appendChild(document.createTextNode('Client script loaded.'))
  main.appendChild(aside)
})
