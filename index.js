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

// Get today's date in IST
function getTodayIST() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
  const istTime = new Date(now.getTime() + istOffset);
  return istTime.toISOString().split('T')[0];
}

app.get("/", (req, res) => {
  const todayIST = getTodayIST();
  
  res.send(`
    <html>
    <head>
      <title>Invoice Generator</title>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>
        body { font-family: sans-serif; padding: 20px; max-width: 800px; margin: auto; background: #f8f8f8; }
        input, button, select { width: 100%; padding: 10px; margin: 8px 0; font-size: 16px; box-sizing: border-box; }
        .item { 
          display: grid; 
          grid-template-columns: 2fr 1fr 0.8fr 1fr 0.8fr 1.2fr auto; 
          gap: 8px; 
          margin-bottom: 8px; 
          align-items: center; 
        }
        .item input, .item select { 
          padding: 8px; 
          margin: 0; 
          font-size: 14px;
          min-width: 0;
        }
        #items hr { margin: 5px 0; }
        .form-row { display: flex; gap: 10px; }
        .form-row input { flex: 1; }
        .item-header { 
          display: grid; 
          grid-template-columns: 2fr 1fr 0.8fr 1fr 0.8fr 1.2fr auto; 
          gap: 8px; 
          margin-bottom: 8px; 
          font-weight: bold; 
          font-size: 14px; 
        }
        .item-header div { 
          text-align: center; 
          padding: 8px; 
          background: #ddd; 
          border-radius: 4px;
        }
        .remove-btn { 
          background: #ff4444; 
          color: white; 
          border: none; 
          padding: 8px 12px; 
          cursor: pointer; 
          border-radius: 4px; 
          font-size: 16px;
          width: auto;
          margin: 0;
        }
        .form-section { margin-bottom: 20px; }
        .three-col { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
        .received-section { margin-top: 10px; }
      </style>
    </head>
    <body>
      <h2>Invoice Generator</h2>
      <form id="form">
        <div class="form-section">
          <input name="billto" placeholder="BILL TO" required />
        </div>
        
        <div class="form-section">
          <div class="three-col">
            <input name="invoice" placeholder="Invoice No." required />
            <input name="date" type="date" value="${todayIST}" required />
            <input name="duedate" type="date" value="${todayIST}" placeholder="Due Date" />
          </div>
        </div>

        <div class="form-section">
          <div class="item-header">
            <div>Item Name</div>
            <div>Qty</div>
            <div>Unit</div>
            <div>Rate</div>
            <div>Discount</div>
            <div>Amount</div>
            <div>Action</div>
          </div>

          <div id="items"></div>
          <button type="button" onclick="addItem()">+ Add Item</button>
        </div>
        
        <hr/>
        
        <div class="form-section">
          <h3>Total: ₹<span id="total">0</span></h3>
          <div class="received-section">
            <input name="received" type="number" step="0.01" placeholder="Received Amount (default: 0)" />
          </div>
        </div>
        
        <button type="submit">Download PDF</button>
      </form>

      <script>
        function addItem() {
          const item = document.createElement("div");
          item.className = "item";
          item.innerHTML = \`
            <input name="name" placeholder="Item Name" required />
            <input name="qty" type="number" step="0.01" placeholder="Qty" required />
            <select name="unit">
              <option value="PCS">PCS</option>
              <option value="KG">KG</option>
              <option value="GM">GM</option>
              <option value="ML">ML</option>
              <option value="LTR">LTR</option>
              <option value="PAC">PAC</option>
              <option value="BDL">BDL</option>
              <option value="BOX">BOX</option>
              <option value="BTL">BTL</option>
              <option value="MTR">MTR</option>
            </select>
            <input name="rate" type="number" step="0.01" placeholder="Rate" required />
            <input name="discount" type="text" placeholder="0 or 10%" />
            <input name="amount" type="text" placeholder="₹0" disabled />
            <button type="button" class="remove-btn" onclick="removeItem(this)">×</button>
          \`;
          document.getElementById("items").appendChild(item);
          item.querySelectorAll("input, select").forEach(input => input.addEventListener("input", update));
          update();
        }

        function removeItem(btn) {
          btn.parentElement.remove();
          update();
        }

        function calculateDiscount(amount, discount) {
          if (!discount || discount.trim() === '') return 0;
          
          discount = discount.trim();
          if (discount.endsWith('%')) {
            const percent = parseFloat(discount.slice(0, -1));
            return (amount * percent) / 100;
          } else {
            return parseFloat(discount) || 0;
          }
        }

        function formatDiscountForPDF(discount) {
          if (!discount || discount.trim() === '' || discount === '0') return '0';
          
          discount = discount.trim();
          if (discount.endsWith('%')) {
            return discount; // Already has %
          } else {
            return '₹' + discount; // Add ₹ for amount discount
          }
        }

        function update() {
          let total = 0;
          document.querySelectorAll(".item").forEach(item => {
            const qty = parseFloat(item.children[1].value) || 0;
            const rate = parseFloat(item.children[3].value) || 0;
            const discount = item.children[4].value || '0';
            
            const grossAmount = qty * rate;
            const discountAmount = calculateDiscount(grossAmount, discount);
            const netAmount = grossAmount - discountAmount;
            
            item.children[5].value = "₹" + netAmount.toFixed(2);
            total += netAmount;
          });
          document.getElementById("total").textContent = total.toFixed(2);
        }

        document.getElementById("form").addEventListener("submit", e => {
          e.preventDefault();
          const form = new FormData(e.target);
          const data = {
            billto: form.get("billto"),
            invoice: form.get("invoice"),
            date: form.get("date"),
            duedate: form.get("duedate") || form.get("date"), // Default to invoice date if empty
            received: form.get("received") || "0", // Default to 0 if empty
            items: [],
          };

          document.querySelectorAll(".item").forEach(item => {
            const name = item.children[0].value;
            const qty = item.children[1].value;
            const unit = item.children[2].value;
            const rate = item.children[3].value;
            const discount = item.children[4].value || '0';
            
            const grossAmount = qty * rate;
            const discountAmount = calculateDiscount(grossAmount, discount);
            const amount = grossAmount - discountAmount;
            
            data.items.push({ 
              name, 
              qty, 
              unit, 
              rate, 
              discount: formatDiscountForPDF(discount), 
              amount: amount.toFixed(2) 
            });
          });

          data.total = data.items.reduce((sum, i) => sum + parseFloat(i.amount), 0).toFixed(2);

          fetch("/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          })
            .then(res => res.blob())
            .then(blob => {
              const a = document.createElement("a");
              a.href = window.URL.createObjectURL(blob);
              a.download = "invoice_" + data.invoice + ".pdf";
              a.click();
            });
        });

        // Add first item by default
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
  const { billto, invoice, date, duedate, received, items, total } = req.body;

  const rows = items.map(
    (item, i) =>
      `<tr>
        <td style="border: 1px solid #000; padding: 8px; text-align: center;">${i + 1}</td>
        <td style="border: 1px solid #000; padding: 8px;">${item.name}</td>
        <td style="border: 1px solid #000; padding: 8px; text-align: center;">${item.qty} ${item.unit}</td>
        <td style="border: 1px solid #000; padding: 8px; text-align: center;">${item.rate}</td>
        <td style="border: 1px solid #000; padding: 8px; text-align: center;">${item.discount || '0'}</td>
        <td style="border: 1px solid #000; padding: 8px; text-align: right;">${item.amount}</td>
      </tr>`
  ).join("");

  // Calculate minimum rows needed (at least 15, but more if items exceed 15)
  const minRows = Math.max(15, items.length);
  const emptyRowsCount = minRows - items.length;

  const totalInWords = numberToWords(Math.floor(parseFloat(total))).trim() + " Rupees";

  // Format dates
  const invoiceDate = new Date(date).toLocaleDateString('en-GB');
  const dueDateFormatted = new Date(duedate).toLocaleDateString('en-GB');

  const html = `
    <div style="font-family: Arial, sans-serif; padding: 15px; max-width: 210mm; margin: auto; border: 2px solid #000;">
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <div style="font-weight: bold; font-size: 14px;">BILL OF SUPPLY</div>
        <div style="border: 1px solid #000; padding: 3px 8px; font-size: 10px; background: #f0f0f0;">ORIGINAL FOR RECIPIENT</div>
      </div>
      
      <div style="border: 1px solid #000; margin-bottom: 10px;">
        <!-- Business Info -->
        <div style="text-align: center; padding: 15px; border-bottom: 1px solid #000;">
          <div style="font-weight: bold; font-size: 16px; margin-bottom: 5px;">${BILL_NAME}</div>
          <div style="font-size: 11px; margin-bottom: 2px;">${BILL_ADDRESS}</div>
          <div style="font-size: 11px;">Mobile: ${BILL_PHONE}</div>
        </div>
        
        <!-- Bill To and Invoice Details -->
        <div style="display: flex;">
          <div style="flex: 1; padding: 10px; border-right: 1px solid #000;">
            <div style="font-weight: bold; font-size: 11px; margin-bottom: 5px;">BILL TO</div>
            <div style="font-size: 11px;">${billto}</div>
          </div>
          <div style="flex: 1; padding: 10px;">
            <table style="width: 100%; font-size: 11px;">
              <tr>
                <td style="font-weight: bold; padding: 2px 0;">Invoice No.</td>
                <td style="font-weight: bold; padding: 2px 0;">Invoice Date</td>
                <td style="font-weight: bold; padding: 2px 0;">Due Date</td>
              </tr>
              <tr>
                <td style="padding: 2px 0;">${invoice}</td>
                <td style="padding: 2px 0;">${invoiceDate}</td>
                <td style="padding: 2px 0;">${dueDateFormatted}</td>
              </tr>
            </table>
          </div>
        </div>
        
        <!-- Items Table -->
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
          <thead>
            <tr style="background-color: #f0f0f0;">
              <th style="border: 1px solid #000; padding: 8px; text-align: center; font-weight: bold; width: 8%;">S.NO</th>
              <th style="border: 1px solid #000; padding: 8px; text-align: center; font-weight: bold; width: 35%;">ITEMS</th>
              <th style="border: 1px solid #000; padding: 8px; text-align: center; font-weight: bold; width: 15%;">QTY.</th>
              <th style="border: 1px solid #000; padding: 8px; text-align: center; font-weight: bold; width: 12%;">RATE</th>
              <th style="border: 1px solid #000; padding: 8px; text-align: center; font-weight: bold; width: 15%;">DISCOUNT</th>
              <th style="border: 1px solid #000; padding: 8px; text-align: center; font-weight: bold; width: 15%;">AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
            <!-- Empty rows to maintain table height -->
            ${Array(emptyRowsCount).fill().map(() => 
              '<tr><td style="border: 1px solid #000; padding: 8px; height: 25px;"></td><td style="border: 1px solid #000; padding: 8px;"></td><td style="border: 1px solid #000; padding: 8px;"></td><td style="border: 1px solid #000; padding: 8px;"></td><td style="border: 1px solid #000; padding: 8px;"></td><td style="border: 1px solid #000; padding: 8px;"></td></tr>'
            ).join('')}
          </tbody>
        </table>
        
        <!-- Total Section -->
        <div style="border-top: 2px solid #000;">
          <table style="width: 100%; font-size: 11px;">
            <tr>
              <td style="border: 1px solid #000; padding: 8px; text-align: center; font-weight: bold; width: 73%; background: #f0f0f0;">TOTAL</td>
              <td style="border: 1px solid #000; padding: 8px; text-align: center; font-weight: bold; width: 2%;">-</td>
              <td style="border: 1px solid #000; padding: 8px; text-align: right; font-weight: bold; width: 25%;">₹ ${total}</td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; padding: 8px; text-align: center; font-weight: bold; background: #f0f0f0;">RECEIVED AMOUNT</td>
              <td style="border: 1px solid #000; padding: 8px; text-align: center; font-weight: bold;"></td>
              <td style="border: 1px solid #000; padding: 8px; text-align: right; font-weight: bold;">₹ ${received}</td>
            </tr>
          </table>
        </div>
      </div>
      
      <!-- Amount in Words -->
      <div style="border: 1px solid #000; margin-bottom: 10px; padding: 8px;">
        <div style="font-weight: bold; font-size: 11px; margin-bottom: 3px;">Total Amount (in words)</div>
        <div style="font-size: 11px;">${totalInWords}</div>
      </div>
      
      <!-- Terms and Conditions -->
      <div style="border: 1px solid #000; padding: 8px;">
        <div style="font-weight: bold; font-size: 11px; margin-bottom: 5px;">Terms and Conditions</div>
        <div style="font-size: 10px;">1. Goods once sold will not be taken back or exchanged</div>
        <div style="font-size: 10px;">2. All disputes are subject to ${BILL_CITY} jurisdiction only</div>
      </div>
    </div>
  `;

  pdf.create(html, {
    format: 'A4',
    orientation: 'portrait',
    border: {
      top: '0.5in',
      right: '0.5in',
      bottom: '0.5in',
      left: '0.5in'
    }
  }).toStream((err, stream) => {
    if (err) return res.status(500).send("PDF error");
    res.setHeader("Content-Type", "application/pdf");
    stream.pipe(res);
  });
});

app.listen(PORT, () => console.log("✅ Enhanced Invoice app running on port", PORT));