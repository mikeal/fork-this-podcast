import html from 'nanohtml'
import raw from 'nanohtml/raw.js'

const head = (title, base) => html`
  <head>
    <script src="${base}app.js"></script>
  </head>
`

const pubdate = item => {
  let str
  if (item['rss:pubdate']) {
    if (item['rss:pubdate']['#']) {
      str = item['rss:pubdate']['#']
    }
  }
  if (!str) throw new Error('Cannot find pub date')
  return (new Date(str)).getTime()
}

const sorter = (a, b) => {
  const [aTime, bTime] = [a, b].map(pubdate)
  if (aTime < bTime) return -1
  if (aTime > bTime) return 1
  if (a.title < b.title) return -1
  if (a.title > b.title) return 1
  return 0
}

const video = enc => {
  return html`<video controls src="${enc.url}"></video>`
}

const audio = enc => {
  return html`<audio controls src="${enc.url}"></audio>`
}

const player = enclosure => {
  if (enclosure.type.startsWith('audio')) return audio(enclosure)
  else if (enclosure.type.startsWith('video')) return video(enclosure)
  return ''
}

const episode = async item => {
  const elem = html`
    <podcast-episode>
      <episode-title>${item.title}</episode-title>
      <episode-desc>${raw(item.description)}</episode-desc>
      <episode-enclosures>${item.enclosures.map(player)}</episode-enclosures>
    </podcast-episode>
  `
  return elem
}

const podcast = async cast => {
  let episodes = []
  for await (const [, { item }] of cast.items.all()) {
    if (!item.enclosures || !item.enclosures.length) continue
    episodes.push(item)
  }
  episodes = episodes.sort(sorter).reverse()
  return html`<html>
    ${head(cast.meta.title, '../app.js')}
    <body>
      <h1>${cast.meta.title}</h1>
      <p> ${cast.meta.description} </p>
      <h2>Episodes</h2>
      <podcast-episodes>${await Promise.all(episodes.map(episode))}</podcast-episodes>
    </body>
  </html>`
}

export { podcast }
