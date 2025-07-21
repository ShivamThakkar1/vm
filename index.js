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
        * { box-sizing: border-box; }
        body { 
          font-family: sans-serif; 
          padding: 15px; 
          margin: 0; 
          background: #f8f8f8; 
          font-size: 14px;
        }
        
        .container {
          max-width: 1200px;
          margin: 0 auto;
        }
        
        input, button, select { 
          width: 100%; 
          padding: 12px; 
          margin: 8px 0; 
          font-size: 16px; 
          border: 1px solid #ddd;
          border-radius: 4px;
        }
        
        /* Mobile-first responsive item grid */
        .item { 
          display: grid;
          gap: 8px; 
          margin-bottom: 12px; 
          padding: 12px;
          background: white;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        .item input, .item select { 
          padding: 10px; 
          margin: 4px 0; 
          font-size: 14px;
          border: 1px solid #ddd;
          border-radius: 4px;
        }
        
        /* FIXED: Remove button styling - more specific selector */
        .item .remove-btn { 
          background: #ff4444 !important; 
          color: white !important; 
          border: none !important; 
          padding: 10px 15px !important; 
          cursor: pointer !important; 
          border-radius: 4px !important; 
          font-size: 14px !important;
          width: auto !important;
          margin: 8px 0 !important;
          align-self: center;
        }
        
        .item .remove-btn:hover {
          background: #cc0000 !important;
        }
        
        /* Mobile layout - stacked */
        @media (max-width: 768px) {
          .item {
            grid-template-columns: 1fr;
          }
          
          .item-header {
            display: grid !important; /* FIXED: Show headers on mobile with better styling */
            grid-template-columns: 1fr;
            gap: 0;
            margin-bottom: 12px;
            padding: 12px;
            background: #333 !important;
            color: white !important;
            border-radius: 8px;
            font-weight: bold;
            font-size: 16px;
            text-align: center;
          }
          
          .item-header div {
            display: none; /* Hide individual header cells on mobile */
          }
          
          .item-header::before {
            content: "Item Details";
          }
          
          .mobile-label {
            font-size: 12px;
            color: #666;
            margin-bottom: 4px;
            font-weight: bold;
            display: block !important;
          }
        }
        
        /* Desktop layout */
        @media (min-width: 769px) {
          .item {
            grid-template-columns: 2.5fr 0.8fr 0.8fr 1fr 1fr 1.2fr 1fr;
            align-items: end;
            padding: 8px;
          }
          
          .item-header { 
            display: grid; 
            grid-template-columns: 2.5fr 0.8fr 0.8fr 1fr 1fr 1.2fr 1fr;
            gap: 8px; 
            margin-bottom: 8px; 
            font-weight: bold; 
            font-size: 14px; 
            background: #333;
            padding: 12px 8px;
            border-radius: 8px;
          }
          
          .item-header div { 
            text-align: center; 
            padding: 8px; 
            background: transparent;
            border-radius: 4px;
            color: white;
          }
          
          .mobile-label {
            display: none;
          }
          
          .item input, .item select {
            margin: 0;
          }
        }
        
        .form-section { 
          margin-bottom: 20px; 
          background: white;
          padding: 15px;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        .form-row { 
          display: flex; 
          gap: 10px; 
          flex-wrap: wrap;
        }
        
        .form-row input { 
          flex: 1; 
          min-width: 200px;
        }
        
        @media (max-width: 768px) {
          .form-row {
            flex-direction: column;
          }
          
          .form-row input {
            min-width: auto;
          }
          
          body {
            padding: 10px;
          }
        }
        
        .three-col { 
          display: grid; 
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
          gap: 10px; 
        }
        
        .received-section { 
          margin-top: 15px; 
        }
        
        button[type="submit"] {
          background: #007bff;
          color: white;
          font-weight: bold;
          padding: 15px;
          font-size: 16px;
        }
        
        button[type="button"]:not(.remove-btn) {
          background: #28a745;
          color: white;
          font-weight: bold;
        }
        
        .total-display {
          font-size: 18px;
          font-weight: bold;
          color: #007bff;
          text-align: center;
          padding: 15px;
          background: #f8f9fa;
          border-radius: 8px;
          margin: 10px 0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h2 style="text-align: center; color: #333;">Invoice Generator</h2>
        <form id="form">
          <div class="form-section">
            <label style="display: block; margin-bottom: 5px; font-weight: bold; color: #333;">Bill To:</label>
            <input name="billto" placeholder="Enter customer name and address" required />
          </div>
          
          <div class="form-section">
            <div class="three-col">
              <div>
                <label style="display: block; margin-bottom: 5px; font-weight: bold; color: #333;">Invoice No.:</label>
                <input name="invoice" placeholder="Enter invoice number" required />
              </div>
              <div>
                <label style="display: block; margin-bottom: 5px; font-weight: bold; color: #333;">Invoice Date:</label>
                <input name="date" type="date" value="${todayIST}" required />
              </div>
              <div>
                <label style="display: block; margin-bottom: 5px; font-weight: bold; color: #333;">Due Date:</label>
                <input name="duedate" type="date" value="${todayIST}" />
              </div>
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
          
          <div class="form-section">
            <div class="total-display">Total: ₹<span id="total">0</span></div>
            <div class="received-section">
              <label style="display: block; margin-bottom: 5px; font-weight: bold; color: #333;">Received Amount:</label>
              <input name="received" type="number" step="0.01" placeholder="Enter received amount (default: 0)" />
            </div>
          </div>
          
          <button type="submit">Download PDF</button>
        </form>
      </div>

      <script>
        function addItem() {
          const item = document.createElement("div");
          item.className = "item";
          item.innerHTML = \`
            <div class="mobile-label">Item Name</div>
            <input name="name" placeholder="Item Name" required />
            
            <div class="mobile-label">Quantity</div>
            <input name="qty" type="number" step="0.01" placeholder="Qty" required />
            
            <div class="mobile-label">Unit</div>
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
            
            <div class="mobile-label">Rate</div>
            <input name="rate" type="number" step="0.01" placeholder="Rate" required />
            
            <div class="mobile-label">Discount</div>
            <input name="discount" type="text" placeholder="0 or 10%" />
            
            <div class="mobile-label">Amount</div>
            <input name="amount" type="text" placeholder="₹0" disabled />
            
            <button type="button" class="remove-btn" onclick="removeItem(this)">Remove Item</button>
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
            return discount;
          } else {
            return '₹' + discount;
          }
        }

        function update() {
          let total = 0;
          document.querySelectorAll(".item").forEach(item => {
            const inputs = item.querySelectorAll("input, select");
            const qty = parseFloat(inputs[1].value) || 0;
            const rate = parseFloat(inputs[3].value) || 0;
            const discount = inputs[4].value || '0';
            
            const grossAmount = qty * rate;
            const discountAmount = calculateDiscount(grossAmount, discount);
            const netAmount = grossAmount - discountAmount;
            
            inputs[5].value = "₹" + netAmount.toFixed(2);
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
            duedate: form.get("duedate") || form.get("date"),
            received: form.get("received") || "0",
            items: [],
          };

          document.querySelectorAll(".item").forEach(item => {
            const inputs = item.querySelectorAll("input, select");
            const name = inputs[0].value;
            const qty = inputs[1].value;
            const unit = inputs[2].value;
            const rate = inputs[3].value;
            const discount = inputs[4].value || '0';
            
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
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.style.display = "none";
              a.href = url;
              a.download = "invoice_" + data.invoice + ".pdf";
              
              // For iOS compatibility
              if (window.navigator.msSaveOrOpenBlob) {
                window.navigator.msSaveOrOpenBlob(blob, "invoice_" + data.invoice + ".pdf");
              } else {
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
              }
              
              // Clean up the URL object
              setTimeout(() => window.URL.revokeObjectURL(url), 100);
            })
            .catch(error => {
              console.error('Download error:', error);
              alert('Error downloading PDF. Please try again.');
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
        <td style="border: 1px solid #000; padding: 6px; text-align: center; font-size: 10px;">${i + 1}</td>
        <td style="border: 1px solid #000; padding: 6px; font-size: 10px;">${item.name}</td>
        <td style="border: 1px solid #000; padding: 6px; text-align: center; font-size: 10px;">${item.qty} ${item.unit}</td>
        <td style="border: 1px solid #000; padding: 6px; text-align: center; font-size: 10px;">₹${item.rate}</td>
        <td style="border: 1px solid #000; padding: 6px; text-align: center; font-size: 10px;">${item.discount || '0'}</td>
        <td style="border: 1px solid #000; padding: 6px; text-align: right; font-size: 10px;">₹${item.amount}</td>
      </tr>`
  ).join("");

  // Reduce minimum rows to fit on single page
  const minRows = Math.max(12, items.length);
  const emptyRowsCount = minRows - items.length;
  
  // FIXED: Proper empty rows with exact same column structure
  const emptyRows = Array(emptyRowsCount).fill().map(() => 
    `<tr>
      <td style="border: 1px solid #000; padding: 6px; height: 18px; font-size: 10px;"></td>
      <td style="border: 1px solid #000; padding: 6px; font-size: 10px;"></td>
      <td style="border: 1px solid #000; padding: 6px; font-size: 10px;"></td>
      <td style="border: 1px solid #000; padding: 6px; font-size: 10px;"></td>
      <td style="border: 1px solid #000; padding: 6px; font-size: 10px;"></td>
      <td style="border: 1px solid #000; padding: 6px; font-size: 10px;"></td>
    </tr>`
  ).join('');

  const totalInWords = numberToWords(Math.floor(parseFloat(total))).trim() + " Rupees";

  // Format dates
  const invoiceDate = new Date(date).toLocaleDateString('en-GB');
  const dueDateFormatted = new Date(duedate).toLocaleDateString('en-GB');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; }
        table { border-collapse: collapse; }
      </style>
    </head>
    <body>
    <div style="font-family: Arial, sans-serif; padding: 8mm; max-width: 190mm; margin: auto; border: 2px solid #000; font-size: 10px; box-sizing: border-box;">
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <div style="font-weight: bold; font-size: 12px;">BILL OF SUPPLY</div>
        <div style="border: 1px solid #000; padding: 2px 6px; font-size: 9px; background: #f0f0f0;">ORIGINAL FOR RECIPIENT</div>
      </div>
      
      <div style="border: 1px solid #000; margin-bottom: 8px;">
        <!-- Business Info -->
        <div style="text-align: center; padding: 10px; border-bottom: 1px solid #000;">
          <div style="font-weight: bold; font-size: 14px; margin-bottom: 3px;">${BILL_NAME}</div>
          <div style="font-size: 10px; margin-bottom: 2px;">${BILL_ADDRESS}</div>
          <div style="font-size: 10px;">Mobile: ${BILL_PHONE}</div>
        </div>
        
        <!-- Bill To and Invoice Details -->
        <div style="display: flex;">
          <div style="flex: 1; padding: 8px; border-right: 1px solid #000;">
            <div style="font-weight: bold; font-size: 10px; margin-bottom: 4px;">BILL TO</div>
            <div style="font-size: 10px;">${billto}</div>
          </div>
          <div style="flex: 1; padding: 8px;">
            <table style="width: 100%; font-size: 10px;">
              <tr>
                <td style="font-weight: bold; padding: 1px 0;">Invoice No.</td>
                <td style="font-weight: bold; padding: 1px 0;">Invoice Date</td>
                <td style="font-weight: bold; padding: 1px 0;">Due Date</td>
              </tr>
              <tr>
                <td style="padding: 1px 0;">${invoice}</td>
                <td style="padding: 1px 0;">${invoiceDate}</td>
                <td style="padding: 1px 0;">${dueDateFormatted}</td>
              </tr>
            </table>
          </div>
        </div>
        
        <!-- Items Table -->
        <table style="width: 100%; border-collapse: collapse; font-size: 10px;">
          <thead>
            <tr style="background-color: #f0f0f0;">
              <th style="border: 1px solid #000; padding: 6px; text-align: center; font-weight: bold; width: 8%;">S.NO</th>
              <th style="border: 1px solid #000; padding: 6px; text-align: center; font-weight: bold; width: 35%;">ITEMS</th>
              <th style="border: 1px solid #000; padding: 6px; text-align: center; font-weight: bold; width: 15%;">QTY.</th>
              <th style="border: 1px solid #000; padding: 6px; text-align: center; font-weight: bold; width: 12%;">RATE</th>
              <th style="border: 1px solid #000; padding: 6px; text-align: center; font-weight: bold; width: 15%;">DISCOUNT</th>
              <th style="border: 1px solid #000; padding: 6px; text-align: center; font-weight: bold; width: 15%;">AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
            ${emptyRows}
          </tbody>
        </table>
        
        <!-- Total Section -->
        <div style="border-top: 2px solid #000;">
          <table style="width: 100%; font-size: 10px; border-collapse: collapse;">
            <tr>
              <td style="border: 1px solid #000; padding: 6px; text-align: center; font-weight: bold; width: 58%; background: #f0f0f0;">TOTAL</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: center; font-weight: bold; width: 27%;"></td>
              <td style="border: 1px solid #000; padding: 6px; text-align: right; font-weight: bold; width: 15%;">₹ ${total}</td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; padding: 6px; text-align: center; font-weight: bold; background: #f0f0f0;">RECEIVED AMOUNT</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: center; font-weight: bold;"></td>
              <td style="border: 1px solid #000; padding: 6px; text-align: right; font-weight: bold;">₹ ${received}</td>
            </tr>
          </table>
        </div>
      </div>
      
      <!-- Amount in Words -->
      <div style="border: 1px solid #000; margin-bottom: 8px; padding: 6px;">
        <div style="font-weight: bold; font-size: 10px; margin-bottom: 2px;">Total Amount (in words)</div>
        <div style="font-size: 10px;">${totalInWords}</div>
      </div>
      
      <!-- Terms and Conditions -->
      <div style="border: 1px solid #000; padding: 6px;">
        <div style="font-weight: bold; font-size: 10px; margin-bottom: 3px;">Terms and Conditions</div>
        <div style="font-size: 9px;">1. Goods once sold will not be taken back or exchanged</div>
        <div style="font-size: 9px;">2. All disputes are subject to ${BILL_CITY} jurisdiction only</div>
      </div>
    </div>
    </body>
    </html>
  `;

  pdf.create(html, {
    format: 'A4',
    orientation: 'portrait',
    border: {
      top: '5mm',
      right: '5mm',
      bottom: '5mm',
      left: '5mm'
    },
    type: 'pdf',
    quality: '75'
  }).toStream((err, stream) => {
    if (err) return res.status(500).send("PDF error");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="invoice_' + billto + '.pdf"');
    stream.pipe(res);
  });
});

app.listen(PORT, () => console.log("✅ Enhanced Invoice app running on port", PORT));
