const express = require("express");
const bodyParser = require("body-parser");
const pdf = require("html-pdf");

const app = express();
const PORT = process.env.PORT || 3000;

const {
  BILL_NAME,
  BILL_ADDRESS,
  BILL_PHONE,
  BILL_CITY
} = process.env;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.get("/", (req, res) => {
  res.send(`
    <html>
    <head>
      <title>Invoice Generator</title>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>
        body { font-family: sans-serif; padding: 20px; max-width: 600px; margin: auto; background: #f8f8f8; }
        input, button { width: 100%; padding: 10px; margin: 8px 0; font-size: 16px; }
        .item { display: flex; gap: 5px; margin-bottom: 5px; }
        .item input { flex: 1; padding: 6px; }
        #items hr { margin: 5px 0; }
      </style>
    </head>
    <body>
      <h2>Invoice Generator</h2>
      <form id="form">
        <input name="billto" placeholder="BILL TO" required />
        <input name="invoice" placeholder="Invoice No." required />
        <input name="date" type="date" required />

        <div id="items"></div>
        <button type="button" onclick="addItem()">+ Add Item</button>
        <hr/>
        <h3>Total: ₹<span id="total">0</span></h3>
        <button type="submit">Download PDF</button>
      </form>

      <script>
        function addItem() {
          const item = document.createElement("div");
          item.className = "item";
          item.innerHTML = \`
            <input name="name" placeholder="Item" required />
            <input name="qty" type="number" placeholder="Qty" required />
            <input name="rate" type="number" placeholder="Rate" required />
            <input name="amount" type="text" placeholder="₹0" disabled />
          \`;
          document.getElementById("items").appendChild(item);
          item.querySelectorAll("input").forEach(input => input.addEventListener("input", update));
          update();
        }

        function update() {
          let total = 0;
          document.querySelectorAll(".item").forEach(item => {
            const qty = parseFloat(item.children[1].value) || 0;
            const rate = parseFloat(item.children[2].value) || 0;
            const amount = qty * rate;
            item.children[3].value = "₹" + amount;
            total += amount;
          });
          document.getElementById("total").textContent = total;
        }

        document.getElementById("form").addEventListener("submit", e => {
          e.preventDefault();
          const form = new FormData(e.target);
          const data = {
            billto: form.get("billto"),
            invoice: form.get("invoice"),
            date: form.get("date"),
            items: [],
          };

          document.querySelectorAll(".item").forEach(item => {
            const name = item.children[0].value;
            const qty = item.children[1].value;
            const rate = item.children[2].value;
            const amount = qty * rate;
            data.items.push({ name, qty, rate, amount });
          });

          data.total = data.items.reduce((sum, i) => sum + i.amount, 0);

          fetch("/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          })
            .then(res => res.blob())
            .then(blob => {
              const a = document.createElement("a");
              a.href = window.URL.createObjectURL(blob);
              a.download = "invoice_" + data.billto.replace(/\s+/g, "_") + ".pdf";
              a.click();
            });
        });

        addItem();
      </script>
    </body>
    </html>
  `);
});

// Number to words helper
function numberToWords(n) {
  const a = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven",
    "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen",
    "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"
  ];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  if (n < 20) return a[n];
  if (n < 100) return b[Math.floor(n / 10)] + " " + a[n % 10];
  if (n < 1000) return a[Math.floor(n / 100)] + " Hundred " + numberToWords(n % 100);
  if (n < 100000) return numberToWords(Math.floor(n / 1000)) + " Thousand " + numberToWords(n % 1000);
  if (n < 10000000) return numberToWords(Math.floor(n / 100000)) + " Lakh " + numberToWords(n % 100000);
  return numberToWords(Math.floor(n / 10000000)) + " Crore " + numberToWords(n % 10000000);
}

app.post("/generate", (req, res) => {
  const { billto, invoice, date, items, total } = req.body;

  const rows = items.map(
    (item, i) =>
      `<tr><td>${i + 1}</td><td>${item.name}</td><td>${item.qty}</td><td>${item.rate}</td><td>${item.amount}</td></tr>`
  ).join("");

  const totalInWords = numberToWords(total).trim() + " Rupees";

  const html = `
    <div style="font-family: sans-serif; padding: 20px;">
      <h2 style="text-align:center;">BILL OF SUPPLY</h2>
      <h3>${BILL_NAME}</h3>
      <p>${BILL_ADDRESS}</p>
      <p>Mobile: ${BILL_PHONE}</p>
      <hr/>
      <p><strong>BILL TO:</strong> ${billto}</p>
      <p><strong>Invoice No:</strong> ${invoice}</p>
      <p><strong>Invoice Date:</strong> ${date}</p>

      <table border="1" cellspacing="0" cellpadding="8" width="100%">
        <tr><th>S.No</th><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr>
        ${rows}
      </table>

      <h3>Total: ₹${total}</h3>
      <p><strong>Total Amount (in words):</strong> ${totalInWords}</p>

      <br/>
      <h4>Terms and Conditions</h4>
      <p>1. Goods once sold will not be taken back or exchanged</p>
      <p>2. All disputes are subject to ${BILL_CITY} jurisdiction only</p>
    </div>
  `;

  pdf.create(html).toStream((err, stream) => {
    if (err) return res.status(500).send("PDF error");
    res.setHeader("Content-Type", "application/pdf");
    stream.pipe(res);
  });
});

app.listen(PORT, () => console.log("✅ Invoice app running on port", PORT));