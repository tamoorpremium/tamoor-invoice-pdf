import chromium from '@sparticuz/chrome-aws-lambda';
import puppeteer from 'puppeteer-core';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import handlebars from 'handlebars';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// Load and compile template
const templateHtml = fs.readFileSync(path.join(process.cwd(), 'templates', 'invoice.html'), 'utf8');
const template = handlebars.compile(templateHtml);

export default async function handler(req, res) {
  const orderId = req.query.orderId;
  if (!orderId) return res.status(400).send('Missing orderId');

  try {
    // Fetch invoice data
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
    if (!data) return res.status(404).send('Order not found');

    data.logo_url = 'https://bvnjxbbwxsibslembmty.supabase.co/storage/v1/object/public/product-images/logo.png';

    const html = template(data);

    // Launch puppeteer in serverless mode
    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice_${orderId}.pdf`);
    res.send(pdfBuffer);

  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to generate PDF');
  }
}
