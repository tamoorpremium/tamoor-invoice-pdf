import express from 'express';
import cors from 'cors';
import puppeteer from 'puppeteer';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import handlebars from 'handlebars';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// Load and compile HTML template
const templateHtml = fs.readFileSync(path.join(process.cwd(), 'templates', 'invoice.html'), 'utf8');
const template = handlebars.compile(templateHtml);

app.get('/invoice', async (req, res) => {
  const orderId = req.query.orderId;
  if (!orderId) return res.status(400).send('Missing orderId');

  try {
    // Fetch invoice JSON from Supabase
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_invoice_data`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ p_order_id: parseInt(orderId) })
    });

    const data = await response.json();

    // Optional: set logo URL or other static values
    data.logo_url = 'https://bvnjxbbwxsibslembmty.supabase.co/storage/v1/object/public/product-images/logo.png';

    // Render HTML
    const html = template(data);

    // Generate PDF
    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();

    // Send PDF as response
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=invoice_${orderId}.pdf`,
      'Content-Length': pdfBuffer.length
    });
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to generate PDF');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Invoice service running on port ${PORT}`));
