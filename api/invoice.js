import chromium from '@sparticuz/chromium';
import puppeteerCore from 'puppeteer-core';
import puppeteer from 'puppeteer'; // local dev
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import handlebars from 'handlebars';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// Keep helper for item indexing
handlebars.registerHelper('inc', function (value) {
  return parseInt(value) + 1;
});

// Optional: format currency
handlebars.registerHelper('formatCurrency', function (value) {
  return `₹${Number(value).toFixed(2)}`;
});

// Register helper to format date (take first 10 chars)
handlebars.registerHelper('formatDate', function (value) {
  if (!value) return '';
  return value.toString().substring(0, 10); // YYYY-MM-DD
});

// Compile template once
const templateHtml = fs.readFileSync(
  path.join(process.cwd(), 'templates', 'invoice.html'),
  'utf8'
);
const template = handlebars.compile(templateHtml);

export default async function handler(req, res) {
  const orderId = req.query.orderId;
  if (!orderId) return res.status(400).send('Missing orderId');

  try {
    // Fetch invoice data from Supabase
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_invoice_data`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_order_id: parseInt(orderId) }),
    });

    const result = await response.json();

    if (!result || typeof result !== 'object') {
      console.error("Supabase returned:", result);
      return res.status(404).send('Order not found');
    }

    // Enrich data
    const data = { ...result };
    data.logo_url =
      'https://bvnjxbbwxsibslembmty.supabase.co/storage/v1/object/public/product-images/logo.png';

    console.log("Invoice data from Supabase:", result);

    // Render template
    const html = template(data);

    // Launch Puppeteer
    let browser;
    if (process.platform === 'win32' || process.platform === 'darwin') {
      browser = await puppeteer.launch({ headless: true });
    } else {
      browser = await puppeteerCore.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: true,
      });
    }

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle2' });

    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });

    await browser.close();

    // Return PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice_${orderId}.pdf"`);
    res.status(200).end(pdfBuffer);

  } catch (error) {
    console.error('PDF Generation Error:', error);
    res.status(500).send('Failed to generate PDF');
  }
}
