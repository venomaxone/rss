const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/rss+xml, application/xml, text/xml, */*'
};

// Функция для получения новостей Ленты через шлюз rss2json
async function fetchLentaItems() {
  const response = await fetch('https://api.rss2json.com/v1/api.json?rss_url=https%3A%2F%2Flenta.ru%2Frss');
  const data = await response.json();

  if (data.status !== 'ok') {
    throw new Error('rss2json failed to fetch Lenta');
  }

  return data.items.map(item => ({
    title: item.title,
    link: item.link,
    description: item.description,
    pubDate: new Date(item.pubDate)
  }));
}

// Парсер элементов из XML для Цензора
function extractItemsFromXml(xmlString, sourceName) {
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

    if (title && link) {
      items.push({
        title: sourceName ? `[${sourceName}] ${title}` : title,
        link,
        description,
        pubDate: pubDateStr ? new Date(pubDateStr) : new Date()
      });
    }
  }

  return items;
}

// Вспомогательная функция сборки XML
function buildRssXml(title, items) {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${title}</title>
    <link>https://rss-c1g1.onrender.com</link>
    <description>RSS Feed Proxy</description>`;

  items.forEach(item => {
    xml += `
    <item>
      <title><![CDATA[${item.title}]]></title>
      <link>${item.link}</link>
      <description><![CDATA[${item.description}]]></description>
      <pubDate>${item.pubDate.toUTCString()}</pubDate>
    </item>`;
  });

  xml += `
  </channel>
</rss>`;

  return xml;
}

app.get('/', (req, res) => {
  res.send('RSS Proxy Server is working!');
});

// 1. Цензор
app.get('/rss.xml', async (req, res) => {
  try {
    const response = await fetch('https://assets.censor.net/rss/censor.net/rss_uk_news.xml', {
      headers: DEFAULT_HEADERS
    });

    if (!response.ok) {
      return res.status(response.status).send(`Censor status: ${response.status}`);
    }

    const xml = await response.text();
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(xml);
  } catch (err) {
    console.error('[Censor Error]:', err.message);
    res.status(500).send('Error loading Censor RSS');
  }
});

// 2. Лента.ру (стабильный обход блокировок)
app.get('/lenta.xml', async (req, res) => {
  try {
    const items = await fetchLentaItems();
    const xml = buildRssXml('Лента.ру', items);

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(xml);
  } catch (err) {
    console.error('[Lenta Error]:', err.message);
    res.status(500).send('Error loading Lenta RSS');
  }
});

// 3. Объединенная лента (Цензор + Лента)
app.get('/all.xml', async (req, res) => {
  try {
    let allItems = [];

    // Загружаем Цензор
    try {
      const censorRes = await fetch('https://assets.censor.net/rss/censor.net/rss_uk_news.xml', { headers: DEFAULT_HEADERS });
      if (censorRes.ok) {
        const censorXml = await censorRes.text();
        allItems.push(...extractItemsFromXml(censorXml, 'Цензор'));
      }
    } catch (e) {
      console.error('Censor fetch failed for /all.xml:', e.message);
    }

    // Загружаем Ленту
    try {
      const lentaItems = await fetchLentaItems();
      const formattedLenta = lentaItems.map(item => ({
        ...item,
        title: `[Лента] ${item.title}`
      }));
      allItems.push(...formattedLenta);
    } catch (e) {
      console.error('Lenta fetch failed for /all.xml:', e.message);
    }

    // Сортировка новостей по дате (свежие вверху)
    allItems.sort((a, b) => b.pubDate - a.pubDate);

    const xml = buildRssXml('Объединенная лента новостей', allItems);

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(xml);
  } catch (err) {
    console.error('[Combined RSS Error]:', err.message);
    res.status(500).send('Error generating combined RSS');
  }
});

app.listen(PORT, () => {
  console.log(`Server launched on port ${PORT}`);
});
