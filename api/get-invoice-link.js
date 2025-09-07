// api/get-invoice-link.js
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export default async function handler(req, res) {

   // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*'); // allow all origins (or restrict to your admin domain)
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const orderId = req.query.orderId;
  if (!orderId) return res.status(400).send('Missing orderId');

  try {
    // 1. Fetch invoice filename from DB
    const { data, error } = await supabase
      .from('orders')
      .select('invoice_file')
      .eq('id', orderId)
      .single();

    if (error || !data?.invoice_file) {
      return res.status(404).send('Invoice not found');
    }

    // 2. Create signed URL (valid 1 hour)
    const { data: signedUrlData, error: urlError } = await supabase
      .storage
      .from('invoices')
      .createSignedUrl(data.invoice_file, 60 * 60 * 24);

    if (urlError) {
      console.error("Signed URL error:", urlError);
      return res.status(500).send('Failed to generate signed URL');
    }

    res.status(200).json({ url: signedUrlData.signedUrl });

  } catch (err) {
    console.error("Get Invoice Link Error:", err);
    res.status(500).send('Server error');
  }
}
