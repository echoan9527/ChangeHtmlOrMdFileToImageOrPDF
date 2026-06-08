import express from 'express';
import path from 'path';
import puppeteer from 'puppeteer';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  app.post('/api/capture', async (req, res) => {
    const { url, htmlContent, format = 'png', fullPage = true, selector, width = 1920, height = 1080, deviceScaleFactor = 1 } = req.body;

    if (!url && !htmlContent) {
      return res.status(400).json({ error: 'URL or HTML Content is required' });
    }

    try {
      const browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        headless: true,
      });

      const page = await browser.newPage();
      await page.setViewport({ width, height: height || 1080, deviceScaleFactor });

      if (htmlContent) {
        await page.setContent(htmlContent, { waitUntil: 'networkidle0', timeout: 30000 });
      } else {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      }

      let resultBuffer;
      let contentType;

      if (format === 'pdf') {
        resultBuffer = await page.pdf({
          format: 'A4',
          printBackground: true,
        });
        contentType = 'application/pdf';
      } else { // png or jpeg
        if (selector) {
          try {
            await page.waitForSelector(selector, { timeout: 5000 });
            const element = await page.$(selector);
            if (!element) {
              throw new Error(`Selector "${selector}" not found`);
            }
            const screenshotOptions: any = { type: format as any };
            if (format === 'jpeg') screenshotOptions.quality = 100;
            resultBuffer = await element.screenshot(screenshotOptions);
          } catch (e: any) {
             return res.status(400).json({ error: e.message || `Could not capture selector ${selector}` });
          }
        } else {
          const screenshotOptions: any = { type: format as any, fullPage };
          if (format === 'jpeg') screenshotOptions.quality = 100;
          resultBuffer = await page.screenshot(screenshotOptions);
        }
        contentType = `image/${format}`;
      }

      await browser.close();

      res.setHeader('Content-Type', contentType);
      res.send(Buffer.from(resultBuffer));
    } catch (error: any) {
      console.error('Failed to capture:', error);
      res.status(500).json({ error: 'Failed to capture the webpage: ' + error.message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
