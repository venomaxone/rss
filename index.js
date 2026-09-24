const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/rss+xml, application/xml, text/xml, */*'
};

// Функция безопасной очистки от невидимых символов и экранирования CDATA
function cleanCdata(text) {
  if (!text) return '';
  return text.replace(/\]\]>/g, ']]&gt;');
}

// Парсинг элементов из сторонних RSS
function extractItems(xmlString, sourceName) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xmlString)) !== null) {
    const itemContent = match[1];
    
    const titleMatch = itemContent.match(/<title>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/title>/i);
    const linkMatch = itemContent.match(/<link>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/link>/i);
    const descMatch = itemContent.match(/<description>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/description>/i);
    const dateMatch = itemContent.match(/<pubDate>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/pubDate>/i);

    const title = (titleMatch ? (titleMatch[1] || titleMatch[2]) : '').trim();
    const link = (linkMatch ? (linkMatch[1] || linkMatch[2]) : '').trim();
    const description = (descMatch ? (descMatch[1] || descMatch[2]) : '').trim();
    const pubDateStr = (dateMatch ? (dateMatch[1] || dateMatch[2]) : '').trim();

    let pubDate = new Date();
    if (pubDateStr) {
      const parsed = new Date(pubDateStr);
      if (!isNaN(parsed.getTime())) {
        pubDate = parsed;
      }
    }

    if (title && link) {
      items.push({
        title: sourceName ? `[${sourceName}] ${title}` : title,
        link,
        description,
        pubDate
      });
    }
  }

  return items;
}

app.get('/', (req, res) => {
  res.send('RSS Server is running');
});

// 1. Цензор
app.get('/rss.xml', async (req, res) => {
  try {
    const response = await fetch('https://assets.censor.net/rss/censor.net/rss_uk_news.xml', { headers: HEADERS });
    if (!response.ok) return res.status(response.status).send('Censor error');
    
    const xml = await response.text();
    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(xml);
  } catch (err) {
    res.status(500).send('Error loading Censor RSS');
  }
});

// 2. Лента
app.get('/lenta.xml', async (req, res) => {
  try {
    const response = await fetch('https://lenta.ru/rss', { headers: HEADERS });
    if (!response.ok) return res.status(response.status).send(`Lenta returned ${response.status}`);
    
    const xml = await response.text();
    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(xml);
  } catch (err) {
    res.status(500).send('Error loading Lenta RSS');
  }
});

// 3. Валидная Объединенная лента (/all.xml)
app.get('/all.xml', async (req, res) => {
  try {
    const [censorRes, lentaRes] = await Promise.allSettled([
      fetch('https://assets.censor.net/rss/censor.net/rss_uk_news.xml', { headers: HEADERS }),
      fetch('https://lenta.ru/rss', { headers: HEADERS })
    ]);

    let allItems = [];

    if (censorRes.status === 'fulfilled' && censorRes.value.ok) {
      const xml = await censorRes.value.text();
      allItems.push(...extractItems(xml, 'Цензор'));
    }

    if (lentaRes.status === 'fulfilled' && lentaRes.value.ok) {
      const xml = await lentaRes.value.text();
      allItems.push(...extractItems(xml, 'Лента'));
    }

    // Сортировка по дате (самые свежие сначала)
    allItems.sort((a, b) => b.pubDate - a.pubDate);

    // Сборка строго специфицированного RSS 2.0 XML
    let combinedXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Объединенная лента новостей</title>
    <link>https://rss-c1g1.onrender.com/all.xml</link>
    <description>Новости Цензор.нет и Лента.ру</description>
    <language>ru</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>`;

    allItems.forEach(item => {
      combinedXml += `
    <item>
      <title><![CDATA[${cleanCdata(item.title)}]]></title>
      <link>${item.link}</link>
      <description><![CDATA[${cleanCdata(item.description)}]]></description>
      <guid isPermaLink="false">${item.link}</guid>
      <pubDate>${item.pubDate.toUTCString()}</pubDate>
    </item>`;
    });

    combinedXml += `
  </channel>
</rss>`;

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(combinedXml);
  } catch (err) {
    console.error('[Combined Error]:', err.message);
    res.status(500).send('Error generating combined RSS');
  }
});

app.listen(PORT);
