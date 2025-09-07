import chromium from '@sparticuz/chromium';
import puppeteerCore from 'puppeteer-core';
import puppeteer from 'puppeteer'; // local dev
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import handlebars from 'handlebars';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Handlebars helpers
handlebars.registerHelper('inc', (value) => parseInt(value) + 1);
handlebars.registerHelper('formatCurrency', (value) => `₹${Number(value).toFixed(2)}`);
handlebars.registerHelper('formatDate', (value) => value ? value.toString().substring(0, 10) : '');

// Load template
const templateHtml = fs.readFileSync(
  path.join(process.cwd(), 'templates', 'invoice.html'),
  'utf8'
);
const template = handlebars.compile(templateHtml);

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "https://tamoorb2p.vercel.app"); 
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Preflight check
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const orderId = req.query.orderId;
  if (!orderId) return res.status(400).send('Missing orderId');

  try {
    // 1. Fetch invoice data from Supabase RPC
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
      return res.status(404).send('Order not found');
    }

    // Add branding/logo
    const data = { ...result };
    data.logo_url =
      'https://bvnjxbbwxsibslembmty.supabase.co/storage/v1/object/public/product-images/logo.png';

    // 2. Render template
    const html = template(data);

    // 3. Generate PDF
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

    // 4. Upload to Supabase (private bucket)
    const filename = `invoice_${orderId}.pdf`;
    const { error: uploadError } = await supabase
      .storage
      .from('invoices') // 👈 make sure you created this bucket
      .upload(filename, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload Error:", uploadError);
      return res.status(500).send('Failed to upload invoice');
    }

    // 5. Save filename in orders table
    await supabase
      .from('orders')
      .update({ invoice_file: filename })
      .eq('id', orderId);

    // 6. Respond with success JSON
    res.status(200).json({
      message: "Invoice generated & uploaded",
      file: filename
    });

  } catch (error) {
    console.error('PDF Generation Error:', error);
    res.status(500).send('Failed to generate PDF');
  }
}
