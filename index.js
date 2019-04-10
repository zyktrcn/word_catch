const cheerio = require('cheerio')
const https = require('https')
const iconv = require('iconv-lite')

const Book = require('./models/index').Book
const Word = require('./models/index').Word

const domain = 'https://www.shanbay.com/'

async function getHttps(fn, url, parameter) {
  return new Promise((resolve) => {
    https.get(url, (sres) => {
      let chunks = []
      sres.on('data', (chunk) => {
        chunks.push(chunk)
      })
      sres.on('end', () => {
        const html = iconv.decode(Buffer.concat(chunks), 'UTF-8');
        const $ = cheerio.load(html, {decodeEntities: false})
        let result = fn($, url, parameter)
        resolve(result)
      })
    })
  })
}

async function getBookUrls($) {
  let urls = []
  $('.container .row .span8 .row').each((i, rowEl) => {
    $(rowEl).children('.span4').each((j, spanEl) => {
      const el = $(spanEl).children('.row')
      const url =  domain + el.children('.wordbook-cover').children('a').attr('href')
      urls.push(url)
    })
  })

  return urls
}

async function getBook($) {
  // name
  // category：分类
  // price：价格
  // pic：封面图 url
  // chapter：拥有章节，////分割
  // content：拥有单词，英文逗号分隔；章节之间用////分割
  // word_count：单词量
  // description：单词书介绍

  const el = $('.container .row .span8 .wordbook-container')
  const infoEl = el.children('.wordbook-detail-container').children('.wordbook-basic-info')

  const name = infoEl.children('.wordbook-title').children('a').text()
  const category = infoEl.children('div').eq('1').children('a').text()
  // const price = stringHandle(infoEl.children('.wordbook-price').text().split('价格： ')[1])
  const price = 1
  const pic = el.children('.wordbook-detail-container').children('.wordbook-cover').children('a').children('img').attr('src')

  let chapter = ''
  let chapterUrls = []
  let chapterWordCount = []
  el.children('#wordbook-detail-container').children('#wordbook-wordlist-container').children('.wordbook-containing-wordlist').each((i, listEl) => {
    const element = $(listEl).children('.wordbook-create-wordlist-title').children('table').children('tbody').children('tr').children('td').eq('0').children('a')
    const title = element.text()
    if (i === 0) {
      chapter += title
    } else {
      chapter += ('////' + title)
    }

    chapterUrls.push(domain + element.attr('href'))
    const count = parseInt($(listEl).children('.wordbook-create-wordlist-title').children('table').children('tbody').children('tr').children('td').eq('1').text().split('单词数：')[1])
    chapterWordCount.push(count)
  })

  const wordCount = parseInt(stringHandle(infoEl.children('.wordbook-count').text().split('单词数：')[1]))
  const description = stringHandle(el.children('.wordbook-description').children('.indent').text())

  return [{name, category, price, pic, chapter, word_count: wordCount, description}, chapterUrls, chapterWordCount]
}

async function getWords($, url, parameter) {
  // book_id
  // name
  // content
  // appear_times：出现次数
  // wrong_times：错误次数
  // wrong_rate：错误率
  let handle = function($) {
    let words = []
    let chapterWords = []
    $('.container .row .span8 .row').eq('2').children('.span8').children('table').children('tbody').children('tr').each((i, tr) => {
      let name = ''
      let content = ''
      $(tr).children('td').each((j, td) => {
        if (j === 0) {
          name = $(td).children('strong').text()
        } else {
          content = $(td).text()
        }
      })
      words.push({ name, content })
      chapterWords.push(name)
    })

    return [words, chapterWords]
  }

  let count = 0
  if (!parameter.chapterWordCount) {
    count = Math.ceil(parameter.wordCount / 20) || 1
  } else {
    count = Math.ceil(parameter.chapterWordCount / 20) || 1
  }
  console.log(count)
  let promiseArr = []
  for (let i=0; i<count; i++) {
    promiseArr.push(getHttps(handle, `${url}?page=${i+1}`))
  }
  let result = await Promise.all(promiseArr)
  let words = []
  let chapterWords = []
  for (let i=0; i<result.length; i++) {
    words = words.concat(result[i][0])
    chapterWords = chapterWords.concat(result[i][1])
  }
  return [words, chapterWords]
}

function stringHandle(str) {
  if (!str) {
    return ''
  }
  return str.replace(/\ +/g,"").replace(/[\r\n]/g,"")
}

async function run() {
  console.log('=====start=====')
  const urls = await getHttps(getBookUrls, 'https://www.shanbay.com/wordbook/category/103/')
  let books = []
  let words = []
  for (let i=0; i<urls.length; i++) {
    let result = await getHttps(getBook, urls[i])
    let chapterUrls =  result[1]
    let chapterWordCount = result[2]
    let chapterWords = ''
    for (let j=0; j<chapterUrls.length; j++) {
      let chapterResult = await getHttps(getWords, chapterUrls[j], { wordCount: result[0].word_count, chapterWordCount: chapterWordCount[j]})
      words = words.concat(chapterResult[0])
      if (j === 0) {
        chapterWords += chapterResult[1].join(',')
      } else {
        chapterWords += ('////' + chapterResult[1].join(','))
      }
    }
    books[i] = result[0]
    books[i].content = chapterWords
    Book.create(books[i])
  }

  for (let i=0; i<words.length; i++) {
    Word.create(words[i])
  }

  console.log(books)

  console.log('=====finish=====')
}

run()
