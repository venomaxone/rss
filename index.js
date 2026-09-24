const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Первая ссылка (Цензор)
app.get('/rss.xml', async (req, res) => {
  try {
    const response = await fetch('https://assets.censor.net/rss/censor.net/rss_uk_news.xml');
    const xml = await response.text();
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(xml);
  } catch (err) {
    res.status(500).send('Error loading Censor RSS');
  }
});

// Вторая ссылка (Лента.ру)
app.get('/lenta.xml', async (req, res) => {
  try {
    const response = await fetch('https://lenta.ru/rss');
    const xml = await response.text();
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(xml);
  } catch (err) {
    res.status(500).send('Error loading Lenta RSS');
  }
});

app.listen(PORT);
