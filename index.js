import express from "express";
import puppeteer from "puppeteer";
import fetch from "node-fetch";
import fs from "fs";
import handlebars from "handlebars";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const SUPABASE_URL = "https://YOUR_SUPABASE_URL";
const SUPABASE_KEY = "YOUR_SERVICE_ROLE_KEY";

app.get("/generate-invoice", async (req, res) => {
  const { order_id } = req.query;

  if (!order_id) return res.status(400).send("order_id is required");

  try {
    // 1️⃣ Fetch invoice JSON from Supabase function
    const invoiceResp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_invoice_data?p_order_id=${order_id}`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    });

    const invoiceData = await invoiceResp.json();

    // 2️⃣ Load HTML template
    const templateHtml = fs.readFileSync("template.html", "utf8");
    const template = handlebars.compile(templateHtml);
    const html = template(invoiceData);

    // 3️⃣ Launch Puppeteer & generate PDF
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });

    await browser.close();

    // 4️⃣ Return PDF
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=invoice_${order_id}.pdf`,
      "Content-Length": pdfBuffer.length
    });
    res.send(pdfBuffer);

  } catch (error) {
    console.error(error);
    res.status(500).send("Error generating invoice PDF");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
