const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Заголовки для имитации запроса из браузера
const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/rss+xml, application/xml, text/xml, */*'
};

// Главная страница для проверки работы сервера
app.get('/', (req, res) => {
  res.send('RSS Proxy Server is working!');
});

// 1. Первая ссылка (Цензор)
app.get('/rss.xml', async (req, res) => {
  try {
    const response = await fetch('https://assets.censor.net/rss/censor.net/rss_uk_news.xml', {
      headers: DEFAULT_HEADERS
    });

    if (!response.ok) {
      console.error(`[Censor Error] HTTP Status: ${response.status}`);
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

// 2. Вторая ссылка (Лента.ру - через прокси для обхода блокировки Render)
app.get('/lenta.xml', async (req, res) => {
  try {
    const proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent('https://lenta.ru/rss');
    
    const response = await fetch(proxyUrl, {
      headers: DEFAULT_HEADERS
    });

    if (!response.ok) {
      console.error(`[Lenta Error] HTTP Status: ${response.status}`);
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

app.listen(PORT, () => {
  console.log(`Server launched on port ${PORT}`);
});
