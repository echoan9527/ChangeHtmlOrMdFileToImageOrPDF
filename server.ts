import express from 'express';
import path from 'path';
import puppeteer from 'puppeteer';
import sharp from 'sharp';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  app.post('/api/capture', async (req, res) => {
    const { url, htmlContent, format = 'png', fullPage = true, selector, width = 1920, height = 1080, deviceScaleFactor = 1, pdfBreakAvoidSelectors, pdfMargin = '0px', sliceMode = false, sliceAspectRatio = '4:5' } = req.body;

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
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' as any, timeout: 30000 });
      } else {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      }

      let resultBuffer;
      let contentType;

      if (format === 'pdf') {
        // Auto-inject print styles to prevent page breaks inside elements
        let printStyleContent = `
            @media print {
              h1, h2, h3, h4, h5, h6,
              p, img, svg, table, tr, th, td,
              pre, code, blockquote, li, figure,
              [class*="card"], [class*="box"], [class*="panel"], [class*="alert"], [class*="container"], [class*="item"],
              [style*="background"], [class*="bg-"] {
                page-break-inside: avoid !important;
                break-inside: avoid !important;
              }
            }
          `;
          
        if (pdfBreakAvoidSelectors) {
           printStyleContent += `
             @media print {
               ${pdfBreakAvoidSelectors} {
                 page-break-inside: avoid !important;
                 break-inside: avoid !important;
                 display: block !important;
               }
             }
           `;
        }

        await page.addStyleTag({
          content: printStyleContent
        });

        resultBuffer = await page.pdf({
          format: 'A4',
          printBackground: true,
          margin: { top: pdfMargin, bottom: pdfMargin, left: pdfMargin, right: pdfMargin }
        });
        contentType = 'application/pdf';
      } else { // png or jpeg
        if (sliceMode) {
          let clipRegion: { x: number, y: number, width: number, height: number } | null = null;
          
          if (selector) {
            try {
              await page.waitForSelector(selector, { timeout: 5000 });
              const element = await page.$(selector);
              if (!element) throw new Error(`Selector "${selector}" not found`);
              const box = await element?.boundingBox();
              if (!box) throw new Error(`Could not get bounding box for selector "${selector}"`);
              clipRegion = box;
            } catch (e: any) {
              await browser.close();
              return res.status(400).json({ error: e.message || `Could not capture selector ${selector}` });
            }
          } else if (!fullPage) {
            clipRegion = { x: 0, y: 0, width, height };
          } else {
            const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
            clipRegion = { x: 0, y: 0, width, height: scrollHeight };
          }

          if (clipRegion) {
            const cw = clipRegion.width;
            let sh = cw;
            if (sliceAspectRatio === '4:5') sh = Math.ceil(cw * (5 / 4));
            else if (sliceAspectRatio === '3:4') sh = Math.ceil(cw * (4 / 3));
            else if (sliceAspectRatio === '16:9') sh = Math.ceil(cw * (9 / 16));
            else if (sliceAspectRatio === '9:16') sh = Math.ceil(cw * (16 / 9));
            else if (sliceAspectRatio === '1:1') sh = cw;

            const marginValue = parseInt(pdfMargin) || 0;

            const breakpoints = await page.evaluate((startY, totalHeight, maxSliceHeight, avoidSelectors) => {
                const cuts: {y: number, h: number}[] = [];
                let currentY = startY;
                const endY = startY + totalHeight;
                
                let selectors = 'h1, h2, h3, h4, h5, h6, p, img, svg, table, tr, pre, code, blockquote, figure, [class*="card"], [class*="box"], [class*="container"], [class*="item"]';
                if (avoidSelectors) {
                    selectors += ', ' + avoidSelectors;
                }
                
                const elements = Array.from(document.querySelectorAll(selectors));
                const rects = elements.map(el => {
                    const r = el.getBoundingClientRect();
                    return { top: r.top + window.scrollY, bottom: r.bottom + window.scrollY };
                })
                .filter(r => r.bottom - r.top > 0)
                .sort((a, b) => a.top - b.top);
                
                while (currentY < endY) {
                    let proposedCutY = currentY + maxSliceHeight;
                    
                    if (proposedCutY >= endY) {
                        const h = endY - currentY;
                        if (h > 50 || cuts.length === 0) cuts.push({ y: currentY, h });
                        break;
                    }
                    
                    let adjustedCutY = proposedCutY;
                    for (const rect of rects) {
                        if (rect.top > currentY && rect.top < proposedCutY && rect.bottom > proposedCutY) {
                             if (rect.top - currentY > Math.min(100, maxSliceHeight * 0.2)) {
                                 adjustedCutY = rect.top;
                                 break;
                             }
                        }
                    }
                    
                    cuts.push({ y: currentY, h: adjustedCutY - currentY });
                    currentY = adjustedCutY;
                }
                return cuts;
            }, clipRegion.y, clipRegion.height, sh, pdfBreakAvoidSelectors);

            const slices: string[] = [];
            for (const cut of breakpoints) {
               let buffer = await page.screenshot({
                 type: format as any,
                 clip: { x: clipRegion.x, y: cut.y, width: cw, height: cut.h },
               });
               
               if (marginValue > 0) {
                 buffer = await sharp(buffer)
                    .extend({
                        top: marginValue,
                        bottom: marginValue,
                        left: marginValue,
                        right: marginValue,
                        background: { r: 255, g: 255, b: 255, alpha: 1 }
                    })
                    .toBuffer();
               }
               
               slices.push(`data:image/${format};base64,${Buffer.from(buffer).toString('base64')}`);
            }
            await browser.close();
            return res.json({ slices });
          }
        } else if (selector) {
          try {
            await page.waitForSelector(selector, { timeout: 5000 });
            const element = await page.$(selector);
            if (!element) {
              throw new Error(`Selector "${selector}" not found`);
            }
            resultBuffer = await Object(element).screenshot({ type: format as any });
          } catch (e: any) {
             return res.status(400).json({ error: e.message || `Could not capture selector ${selector}` });
          }
        } else {
          resultBuffer = await page.screenshot({ type: format as any, fullPage });
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
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`(Also accessible on your network at http://<your-ip>:${PORT} and locally on http://127.0.0.1:${PORT})`);
  });
}

startServer();
