import bent from 'bent'
import urlify from 'urlify'
import fixed from 'fixed-chunker'
import dagdb from '../dagdb/src/index.js'
import FeedParser from 'feedparser'

const folderName = urlify.create()

const headers = {'user-agent': 'fork-this-podcast-v0.0.0-dev'}
const follow = (...args) => {
  const req = bent(302, ...args)
  return async (...args) => {
    let resp = await req(...args)
    while(resp.statusCode === 302) {
      resp = await req(resp.headers.location, ...args.slice(1))
    }
    return resp
  }
}
const get = follow(200, headers)
const getOrCache = follow(200, 304, headers)

const parse = async function * (url) {
  const feedparser = new FeedParser()
  const p = new Promise((resolve, reject) => {
    feedparser.on('error', reject)
    feedparser.on('readable', function () {
      resolve(this)
    })
  })
  const resp = await get(url)
  const buffer = await resp.arrayBuffer()
  feedparser.write(buffer)
  feedparser.end()
  const stream = await p
  yield stream.meta
  let item
  while (item = stream.read()) {
    yield item
  }
}

const getid = item => {
  if (!item.guid) throw new Error('Missing guid')
  return item.guid
}

const getFeed = async url => {
  let meta
  const items = []
  for await (const item of parse(url)) {
    if (!meta) {
      meta = item
    } else {
      items.push(item)
    }
  }
  return { url, meta, items }
}

const updateFeed = async (feeds, url) => {
  let podcast
  if (await feeds.has(url)) {
    podcast = await feeds.get(url)
  } else {
    podcast = { items: await feeds.empty() }
  }
  const { meta, items } = await getFeed(url)
  podcast.meta = meta
  if (!podcast.items) {
    podcast.items = await feeds.empty()
  }

  const filter = async block => {
    const cid = await block.cid()
    if (cid.code === 0x55) return false
    return true
  }

  const promises = []
  for (const item of items) {
    const id = getid(item)
    let value
    if (await podcast.items.has(id)) {
      value = await podcast.items.get(id)
    } else {
      value = { item, cache: {}, enclosures: {} }
      await podcast.items.set(id, value)
    }
    // Disabled for now
    /*
    const { cache } = value
    for (const { url } of value.item.enclosures) {
      const resp = await getOrCache(url, null, cache[url])
      if (resp.status === 304) continue
      const { etag } = resp.headers
      if (etag) cache[url] = { 'if-none-match': etag }
      else if (resp.headers['last-modified']) {
        cache[url] = { 'if-modified-since': resp.headers['last-modified'] }
      }
      console.log('GET', url)
      value.enclosures[url] = fixed(resp, 1024 * 100)
    }
    promises.push(podcast.items.set(id, value, {filter}))
    */
  }
  await Promise.all(promises)
  podcast.items = await podcast.items.commit()
  await feeds.set(url, podcast)
}

const getDatabase = async () => {
  let db = await dagdb.create('inmem')
  let feeds = await db.empty()
  await db.set({feeds})
  return db.update()
}

const writeFeeds = async feeds => {
  const pending = []
  for await (const [, podcast] of feeds.all()) {
    const f = 'podcasts/' + filename(podast.title) + '.html'
    pending.push(templates.podcast(podcast).then(html => fs.writeFile(f, html))
  }
  return Promise.all(pending)
}

const run = async () => {
  const url = 'https://rss.art19.com/nice-white-parents'
  // const url = 'https://changelog.com/jsparty/feed'
  let db = await getDatabase()

  let feeds = await db.get('feeds')
  await updateFeed(feeds, url)
  await db.set('feeds', await feeds.commit())

  feeds = await db.get('feeds')
  await updateFeed(feeds, url)
  feeds = await feeds.commit()
  await writeFeeds(feeds)
}
run()
