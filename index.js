const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Заголовки для имитации запроса из браузера
const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/rss+xml, application/xml, text/xml, */*'
};

// Простой парсер элементов <item> из XML
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

    const pubDate = pubDateStr ? new Date(pubDateStr) : new Date();

    if (title && link) {
      items.push({
        title: `[${sourceName}] ${title}`,
        link,
        description,
        pubDate
      });
    }
  }

  return items;
}

// Главная страница для проверки работы сервера
app.get('/', (req, res) => {
  res.send('RSS Proxy Server is working!');
});

// 1. Отдельно Цензор
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

// 2. Отдельно Лента.ру
app.get('/lenta.xml', async (req, res) => {
  try {
    const proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent('https://lenta.ru/rss');
    const response = await fetch(proxyUrl, { headers: DEFAULT_HEADERS });

    if (!response.ok) {
      return res.status(response.status).send(`Lenta status: ${response.status}`);
    }

    const xml = await response.text();
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(xml);
  } catch (err) {
    console.error('[Lenta Error]:', err.message);
    res.status(500).send('Error loading Lenta RSS');
  }
});

// 3. ОБЪЕДИНЕННАЯ ЛЕНТА (Цензор + Лента)
app.get('/all.xml', async (req, res) => {
  try {
    const [censorRes, lentaRes] = await Promise.allSettled([
      fetch('https://assets.censor.net/rss/censor.net/rss_uk_news.xml', { headers: DEFAULT_HEADERS }),
      fetch('https://corsproxy.io/?' + encodeURIComponent('https://lenta.ru/rss'), { headers: DEFAULT_HEADERS })
    ]);

    let allItems = [];

    if (censorRes.status === 'fulfilled' && censorRes.value.ok) {
      const censorXml = await censorRes.value.text();
      allItems.push(...extractItems(censorXml, 'Цензор'));
    }

    if (lentaRes.status === 'fulfilled' && lentaRes.value.ok) {
      const lentaXml = await lentaRes.value.text();
      allItems.push(...extractItems(lentaXml, 'Лента'));
    }

    // Сортировка новостей по дате (самые свежие вверху)
    allItems.sort((a, b) => b.pubDate - a.pubDate);

    // Генерируем единый RSS XML
    let combinedXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Объединенная лента новостей</title>
    <link>https://rss-c1g1.onrender.com/all.xml</link>
    <description>Новости Цензор.нет и Лента.ру</description>`;

    allItems.forEach(item => {
      combinedXml += `
    <item>
      <title><![CDATA[${item.title}]]></title>
      <link>${item.link}</link>
      <description><![CDATA[${item.description}]]></description>
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
    console.error('[Combined RSS Error]:', err.message);
    res.status(500).send('Error generating combined RSS');
  }
});

app.listen(PORT, () => {
  console.log(`Server launched on port ${PORT}`);
});
