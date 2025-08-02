const express = require("express");
const bodyParser = require("body-parser");
const PDFDocument = require("pdfkit");
const mongoose = require("mongoose");

const app = express();
const PORT = process.env.PORT || 3000;

// Render.com compatibility - Environment detection
const isRenderEnvironment = process.env.RENDER || process.env.NODE_ENV === 'production';

const {
  BILL_NAME = "Your Business Name",
  BILL_ADDRESS = "Your Business Address",
  BILL_PHONE = "Your Phone Number", 
  BILL_CITY = "Your City",
  MONGODB_URI = isRenderEnvironment ? process.env.MONGODB_URI : "mongodb://localhost:27017/invoice_db"
} = process.env;

// MongoDB Connection with fallback and Render optimization
let isMongoConnected = false;

const connectMongoDB = async () => {
  if (MONGODB_URI && MONGODB_URI !== "mongodb://localhost:27017/invoice_db") {
    try {
      await mongoose.connect(MONGODB_URI, {
        serverSelectionTimeoutMS: isRenderEnvironment ? 10000 : 5000,
        socketTimeoutMS: 45000,
        maxPoolSize: 10,
        retryWrites: true,
        writeConcern: {
          w: 'majority'
        }
      });
      console.log("✅ Connected to MongoDB - Database features enabled");
      isMongoConnected = true;
    } catch (err) {
      console.log("⚠️  MongoDB connection failed - Running in PDF-only mode");
      console.log("Error:", err.message);
      console.log("💡 The app will still generate PDFs normally");
      isMongoConnected = false;
    }
  } else {
    console.log("⚠️  No MongoDB URI provided - Running in PDF-only mode");
    console.log("💡 Set MONGODB_URI environment variable to enable database features");
    isMongoConnected = false;
  }
};

// Initialize MongoDB connection
connectMongoDB();

// Invoice Schema
const invoiceSchema = new mongoose.Schema({
  invoiceNo: { type: String, required: true, unique: true },
  billTo: { type: String, required: true },
  date: { type: Date, required: true },
  dueDate: { type: Date, required: true },
  items: [{
    name: String,
    qty: Number,
    unit: String,
    rate: Number,
    discount: String,
    amount: Number
  }],
  total: { type: Number, required: true },
  received: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Invoice = mongoose.model('Invoice', invoiceSchema);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Get today's date in IST
function getTodayIST() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
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
        
        /* Search Section */
        .search-section {
          background: #e3f2fd;
          padding: 20px;
          border-radius: 8px;
          margin-bottom: 20px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        .search-row {
          display: flex;
          gap: 10px;
          align-items: end;
        }
        
        .search-row input {
          flex: 1;
          margin: 0;
        }
        
        .search-row button {
          width: auto;
          padding: 12px 20px;
          margin: 0;
          background: #2196f3;
          color: white;
          font-weight: bold;
        }
        
        .search-row button:hover {
          background: #1976d2;
        }
        
        .clear-btn {
          background: #ff9800 !important;
          margin-left: 5px !important;
        }
        
        .clear-btn:hover {
          background: #f57c00 !important;
        }
        
        @media (max-width: 768px) {
          .search-row {
            flex-direction: column;
          }
          
          .search-row button {
            width: 100%;
          }
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
          align-self: end;
          justify-self: center;
        }
        
        /* Add this new rule for desktop layout */
        @media (min-width: 769px) {
          .item .remove-btn {
            grid-column: 7;
            margin-top: auto !important;
            margin-bottom: auto !important;
          }
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
            display: grid !important;
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
            display: none;
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
        
        button[type="button"]:not(.remove-btn):not(.search-row button) {
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
        
        .alert {
          padding: 12px;
          margin: 10px 0;
          border-radius: 4px;
          font-weight: bold;
        }
        
        .alert-success {
          background: #d4edda;
          color: #155724;
          border: 1px solid #c3e6cb;
        }
        
        .alert-error {
          background: #f8d7da;
          color: #721c24;
          border: 1px solid #f5c6cb;
        }
        
        .alert-info {
          background: #cce7ff;
          color: #004085;
          border: 1px solid #9acffa;
        }
        
        .editing-indicator {
          background: #fff3cd;
          color: #856404;
          border: 1px solid #ffeaa7;
          padding: 10px;
          border-radius: 4px;
          margin-bottom: 15px;
          text-align: center;
          font-weight: bold;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h2 style="text-align: center; color: #333;">Invoice Generator (Render Free Optimized)</h2>
        
        <!-- Search Section -->
        <div class="search-section">
          <h3 style="margin-bottom: 15px; color: #333;">Search & Edit Existing Invoice</h3>
          <div class="search-row">
            <div>
              <label style="display: block; margin-bottom: 5px; font-weight: bold; color: #333;">Invoice Number:</label>
              <input id="searchInvoice" placeholder="Enter invoice number to search" />
            </div>
            <button type="button" onclick="searchInvoice()">Search Invoice</button>
            <button type="button" class="clear-btn" onclick="clearForm()">Clear Form</button>
          </div>
          <div id="searchMessage"></div>
        </div>
        
        <!-- Editing Indicator -->
        <div id="editingIndicator" class="editing-indicator" style="display: none;">
          Editing Invoice: <span id="editingInvoiceNo"></span>
        </div>
        
        <form id="form">
          <input type="hidden" id="isEditing" value="false" />
          <input type="hidden" id="originalInvoiceNo" value="" />
          
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
          
          <button type="submit" id="submitBtn">Save & Download PDF</button>
        </form>
      </div>

      <script>
        // [Same JavaScript code as before - unchanged]
        let formModified = false;
        
        window.addEventListener('beforeunload', function (e) {
          if (formModified) {
            e.preventDefault();
            e.returnValue = 'Are you sure you want to leave? Your unsaved changes will be lost.';
            return e.returnValue;
          }
        });

        function markFormModified() {
          formModified = true;
        }

        function showMessage(message, type = 'info') {
          const messageDiv = document.getElementById('searchMessage');
          messageDiv.innerHTML = \`<div class="alert alert-\${type}">\${message}</div>\`;
          setTimeout(() => {
            messageDiv.innerHTML = '';
          }, 5000);
        }

        function setEditingMode(invoiceNo) {
          document.getElementById('isEditing').value = 'true';
          document.getElementById('originalInvoiceNo').value = invoiceNo;
          document.getElementById('editingIndicator').style.display = 'block';
          document.getElementById('editingInvoiceNo').textContent = invoiceNo;
          document.getElementById('submitBtn').textContent = 'Update & Download PDF';
        }

        function clearEditingMode() {
          document.getElementById('isEditing').value = 'false';
          document.getElementById('originalInvoiceNo').value = '';
          document.getElementById('editingIndicator').style.display = 'none';
          document.getElementById('submitBtn').textContent = 'Save & Download PDF';
        }

        function searchInvoice() {
          const invoiceNo = document.getElementById('searchInvoice').value.trim();
          if (!invoiceNo) {
            showMessage('Please enter an invoice number to search', 'error');
            return;
          }

          fetch(\`/api/invoice/\${invoiceNo}\`)
            .then(response => response.json())
            .then(data => {
              if (data.success) {
                populateForm(data.invoice);
                setEditingMode(invoiceNo);
                showMessage(\`Invoice \${invoiceNo} loaded successfully! You can now edit and update it.\`, 'success');
              } else {
                showMessage(data.message || 'Invoice not found', 'error');
              }
            })
            .catch(error => {
              console.error('Search error:', error);
              showMessage('Error searching for invoice. Please try again.', 'error');
            });
        }

        function populateForm(invoice) {
          document.getElementById('items').innerHTML = '';
          
          document.querySelector('input[name="billto"]').value = invoice.billTo;
          document.querySelector('input[name="invoice"]').value = invoice.invoiceNo;
          document.querySelector('input[name="date"]').value = new Date(invoice.date).toISOString().split('T')[0];
          document.querySelector('input[name="duedate"]').value = new Date(invoice.dueDate).toISOString().split('T')[0];
          document.querySelector('input[name="received"]').value = invoice.received;
          
          invoice.items.forEach(item => {
            addItem();
            const lastItem = document.getElementById('items').lastElementChild;
            const inputs = lastItem.querySelectorAll('input, select');
            inputs[0].value = item.name;
            inputs[1].value = item.qty;
            inputs[2].value = item.unit;
            inputs[3].value = item.rate;
            inputs[4].value = item.discount;
          });
          
          update();
          markFormModified();
        }

        function clearForm() {
          if (formModified && !confirm('Are you sure you want to clear the form? All unsaved changes will be lost.')) {
            return;
          }
          
          document.getElementById('form').reset();
          document.getElementById('searchInvoice').value = '';
          document.getElementById('items').innerHTML = '';
          document.getElementById('searchMessage').innerHTML = '';
          clearEditingMode();
          
          const todayIST = new Date().toISOString().split('T')[0];
          document.querySelector('input[name="date"]').value = todayIST;
          document.querySelector('input[name="duedate"]').value = todayIST;
          
          addItem();
          formModified = false;
        }

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
              <option value="BDL">BDL - Bundle</option>
              <option value="BOX">BOX - Box</option>
              <option value="BTL">BTL - Bottle</option>
              <option value="DOZ">DOZ - Dozen</option>
              <option value="GM">GM - Gram</option>
              <option value="KG">KG - Kilogram</option>
              <option value="LTR">LTR - Litre</option>
              <option value="ML">ML - Millilitre</option>
              <option value="PCS">PCS - Pieces</option>
              <option value="PKT">PKT - Packet</option>
              <option value="TIN">TIN - Tin</option>
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
          item.querySelectorAll("input, select").forEach(input => {
            input.addEventListener("input", update);
            input.addEventListener("input", markFormModified);
          });
          update();
          markFormModified();
        }

        function removeItem(btn) {
          btn.parentElement.remove();
          update();
          markFormModified();
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

        document.querySelectorAll('input, select').forEach(input => {
          input.addEventListener('input', markFormModified);
        });

        document.getElementById("form").addEventListener("submit", e => {
          e.preventDefault();
          const form = new FormData(e.target);
          const isEditing = document.getElementById('isEditing').value === 'true';
          const originalInvoiceNo = document.getElementById('originalInvoiceNo').value;
          
          const data = {
            billto: form.get("billto"),
            invoice: form.get("invoice"),
            date: form.get("date"),
            duedate: form.get("duedate") || form.get("date"),
            received: form.get("received") || "0",
            items: [],
            isEditing: isEditing,
            originalInvoiceNo: originalInvoiceNo
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
            .then(res => {
              if (res.ok) {
                return res.blob();
              } else {
                return res.json().then(err => Promise.reject(err));
              }
            })
            .then(blob => {
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.style.display = "none";
              a.href = url;
              a.download = "invoice_" + data.billto + "_" + data.invoice + ".pdf";
              
              if (window.navigator.msSaveOrOpenBlob) {
                window.navigator.msSaveOrOpenBlob(blob, "invoice_" + data.billto + ".pdf");
              } else {
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
              }
              
              setTimeout(() => window.URL.revokeObjectURL(url), 100);
              formModified = false;
              
              if (isEditing) {
                showMessage(\`Invoice \${data.invoice} updated and downloaded successfully!\`, 'success');
              } else {
                showMessage(\`Invoice \${data.invoice} saved and downloaded successfully!\`, 'success');
              }
            })
            .catch(error => {
              console.error('Download error:', error);
              if (error.message) {
                showMessage(error.message, 'error');
              } else {
                showMessage('Error processing invoice. Please try again.', 'error');
              }
            });
        });

        addItem();
      </script>
    </body>
    </html>
  `);
});

// API endpoint to get invoice by number
app.get("/api/invoice/:invoiceNo", async (req, res) => {
  try {
    if (!isMongoConnected) {
      return res.json({ 
        success: false, 
        message: "Database not available. Please install and start MongoDB to use search features." 
      });
    }

    const { invoiceNo } = req.params;
    const invoice = await Invoice.findOne({ invoiceNo: invoiceNo });
    
    if (!invoice) {
      return res.json({ success: false, message: "Invoice not found" });
    }
    
    res.json({ success: true, invoice: invoice });
  } catch (error) {
    console.error("Error fetching invoice:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
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

app.post("/generate", async (req, res) => {
  try {
    const { billto, invoice, date, duedate, received, items, total, isEditing, originalInvoiceNo } = req.body;

    // Save or update invoice in MongoDB (if available)
    if (isMongoConnected) {
      try {
        const invoiceData = {
          invoiceNo: invoice,
          billTo: billto,
          date: new Date(date),
          dueDate: new Date(duedate),
          items: items.map(item => ({
            name: item.name,
            qty: parseFloat(item.qty),
            unit: item.unit,
            rate: parseFloat(item.rate),
            discount: item.discount,
            amount: parseFloat(item.amount)
          })),
          total: parseFloat(total),
          received: parseFloat(received),
          updatedAt: new Date()
        };

        if (isEditing && originalInvoiceNo) {
          const updatedInvoice = await Invoice.findOneAndUpdate(
            { invoiceNo: originalInvoiceNo },
            invoiceData,
            { new: true }
          );
          if (!updatedInvoice) {
            console.log("Original invoice not found for update, creating new one");
            const newInvoice = new Invoice(invoiceData);
            await newInvoice.save();
          }
        } else {
          try {
            const newInvoice = new Invoice(invoiceData);
            await newInvoice.save();
          } catch (error) {
            if (error.code === 11000) {
              return res.status(400).json({ success: false, message: "Invoice number already exists. Please use a different number." });
            }
            throw error;
          }
        }
      } catch (dbError) {
        console.log("Database operation failed, continuing with PDF generation:", dbError.message);
      }
    }

    // Generate PDF with PDFKit - LIGHTWEIGHT & RENDER.COM FRIENDLY
    const doc = new PDFDocument({ 
      size: 'A4', 
      margin: 30,
      bufferPages: true 
    });

    // Collect PDF data
    const buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => {
      const pdfData = Buffer.concat(buffers);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", 'attachment; filename="invoice_' + billto.replace(/[^a-zA-Z0-9]/g, '_') + '_' + invoice + '.pdf"');
      res.send(pdfData);
    });

    // Helper functions for PDF layout
    function drawBox(x, y, width, height, fillColor = null) {
      if (fillColor) {
        doc.rect(x, y, width, height).fill(fillColor);
      } else {
        doc.rect(x, y, width, height).stroke();
      }
    }

    function drawText(text, x, y, options = {}) {
      doc.text(text, x, y, options);
    }

    // Page dimensions
    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const margin = 30;
    const contentWidth = pageWidth - (margin * 2);

    // Colors
    const headerGray = '#f0f0f0';
    const borderColor = '#000000';

    // Start PDF generation
    doc.strokeColor(borderColor);
    doc.fillColor('#000000');

    // Main border
    drawBox(margin, margin, contentWidth, pageHeight - (margin * 2));

    let currentY = margin + 10;

    // Header Section
    doc.fontSize(16).font('Helvetica-Bold');
    drawText('BILL OF SUPPLY', margin + 20, currentY);
    
    doc.fontSize(8).font('Helvetica');
    doc.rect(pageWidth - 150, currentY - 2, 120, 15).fill(headerGray);
    doc.fillColor('#000000');
    drawText('ORIGINAL FOR RECIPIENT', pageWidth - 145, currentY + 2);
    
    currentY += 25;
    doc.moveTo(margin, currentY).lineTo(pageWidth - margin, currentY).stroke();

    // Business Info Section
    currentY += 15;
    doc.fontSize(14).font('Helvetica-Bold');
    drawText(BILL_NAME, margin + 20, currentY, { align: 'center', width: contentWidth - 40 });
    
    currentY += 20;
    doc.fontSize(10).font('Helvetica');
    drawText(BILL_ADDRESS, margin + 20, currentY, { align: 'center', width: contentWidth - 40 });
    
    currentY += 15;
    drawText(`Mobile: ${BILL_PHONE}`, margin + 20, currentY, { align: 'center', width: contentWidth - 40 });
    
    currentY += 20;
    doc.moveTo(margin, currentY).lineTo(pageWidth - margin, currentY).stroke();

    // Invoice Details Section
    currentY += 15;
    const detailsHeight = 60;
    const halfWidth = contentWidth / 2;

    // Bill To section
    doc.fontSize(10).font('Helvetica-Bold');
    drawText('BILL TO', margin + 20, currentY);
    
    currentY += 15;
    doc.fontSize(9).font('Helvetica');
    const billToLines = billto.split('\n');
    billToLines.forEach((line, index) => {
      drawText(line, margin + 20, currentY + (index * 12));
    });

    // Invoice meta section (right side)
    const metaX = margin + halfWidth + 10;
    let metaY = currentY - 15;
    
    doc.fontSize(9).font('Helvetica-Bold');
    drawText('Invoice No.', metaX, metaY);
    drawText('Invoice Date', metaX + 80, metaY);
    drawText('Due Date', metaX + 160, metaY);
    
    metaY += 15;
    doc.fontSize(9).font('Helvetica');
    drawText(invoice, metaX, metaY);
    drawText(new Date(date).toLocaleDateString('en-GB'), metaX + 80, metaY);
    drawText(new Date(duedate).toLocaleDateString('en-GB'), metaX + 160, metaY);

    // Vertical separator
    doc.moveTo(margin + halfWidth, currentY - 15).lineTo(margin + halfWidth, currentY + 45).stroke();

    currentY += 60;
    doc.moveTo(margin, currentY).lineTo(pageWidth - margin, currentY).stroke();

    // Items Table
    currentY += 10;
    const tableStartY = currentY;
    const rowHeight = 20;
    const headerHeight = 25;

    // Table headers
    const colWidths = [40, 280, 80, 80, 80]; // S.No, Items, Qty, Rate, Amount
    const colX = [
      margin + 10,
      margin + 50,
      margin + 330,
      margin + 410,
      margin + 490
    ];

    // Header background
    doc.rect(margin, currentY, contentWidth, headerHeight).fill(headerGray);
    doc.fillColor('#000000');

    // Header borders
    doc.rect(margin, currentY, contentWidth, headerHeight).stroke();
    for (let i = 1; i < colX.length; i++) {
      doc.moveTo(colX[i], currentY).lineTo(colX[i], currentY + headerHeight).stroke();
    }

    doc.fontSize(9).font('Helvetica-Bold');
    drawText('S.NO', colX[0] + 5, currentY + 8);
    drawText('ITEMS', colX[1] + 5, currentY + 8);
    drawText('QTY.', colX[2] + 5, currentY + 8);
    drawText('RATE', colX[3] + 5, currentY + 8);
    drawText('AMOUNT', colX[4] + 5, currentY + 8);

    currentY += headerHeight;

    // Table rows
    doc.fontSize(8).font('Helvetica');
    
    // Data rows
    items.forEach((item, index) => {
      // Row border
      doc.rect(margin, currentY, contentWidth, rowHeight).stroke();
      
      // Column separators
      for (let i = 1; i < colX.length; i++) {
        doc.moveTo(colX[i], currentY).lineTo(colX[i], currentY + rowHeight).stroke();
      }

      // Row data
      drawText((index + 1).toString(), colX[0] + 5, currentY + 6);
      drawText(item.name.substring(0, 35), colX[1] + 5, currentY + 6); // Truncate long names
      drawText(`${item.qty} ${item.unit}`, colX[2] + 5, currentY + 6);
      drawText(`₹${item.rate}`, colX[3] + 5, currentY + 6);
      drawText(`₹${item.amount}`, colX[4] + 5, currentY + 6);

      currentY += rowHeight;
    });

    // Empty rows to fill space
    const minRows = 8;
    const emptyRows = Math.max(0, minRows - items.length);
    
    for (let i = 0; i < emptyRows; i++) {
      doc.rect(margin, currentY, contentWidth, rowHeight).stroke();
      
      for (let j = 1; j < colX.length; j++) {
        doc.moveTo(colX[j], currentY).lineTo(colX[j], currentY + rowHeight).stroke();
      }
      
      currentY += rowHeight;
    }

    // Total Section
    const totalHeight = 25;
    
    // Total row
    doc.rect(margin, currentY, contentWidth, totalHeight).stroke();
    doc.rect(margin, currentY, colWidths[0] + colWidths[1] + colWidths[2], totalHeight).fill(headerGray);
    doc.fillColor('#000000');
    
    doc.fontSize(10).font('Helvetica-Bold');
    drawText('TOTAL', margin + (contentWidth * 0.6) / 2, currentY + 8, { align: 'center' });
    drawText(`₹ ${total}`, colX[3] + 5, currentY + 8);
    drawText(`₹ ${total}`, colX[4] + 5, currentY + 8);

    // Column separators for total row
    doc.moveTo(colX[3], currentY).lineTo(colX[3], currentY + totalHeight).stroke();
    doc.moveTo(colX[4], currentY).lineTo(colX[4], currentY + totalHeight).stroke();

    currentY += totalHeight;

    // Received Amount row
    doc.rect(margin, currentY, contentWidth, totalHeight).stroke();
    doc.rect(margin, currentY, colWidths[0] + colWidths[1] + colWidths[2], totalHeight).fill(headerGray);
    doc.fillColor('#000000');
    
    drawText('RECEIVED AMOUNT', margin + (contentWidth * 0.6) / 2, currentY + 8, { align: 'center' });
    drawText(`₹ ${received}`, colX[3] + 5, currentY + 8);
    drawText(`₹ ${received}`, colX[4] + 5, currentY + 8);

    doc.moveTo(colX[3], currentY).lineTo(colX[3], currentY + totalHeight).stroke();
    doc.moveTo(colX[4], currentY).lineTo(colX[4], currentY + totalHeight).stroke();

    currentY += totalHeight + 15;
    doc.moveTo(margin, currentY).lineTo(pageWidth - margin, currentY).stroke();

    // Amount in Words
    currentY += 15;
    doc.fontSize(10).font('Helvetica-Bold');
    drawText('Total Amount (in words)', margin + 20, currentY);
    
    currentY += 15;
    doc.fontSize(9).font('Helvetica');
    const totalInWords = numberToWords(Math.floor(parseFloat(total))).trim() + " Rupees";
    drawText(totalInWords, margin + 20, currentY);

    currentY += 30;
    doc.moveTo(margin, currentY).lineTo(pageWidth - margin, currentY).stroke();

    // Terms and Conditions
    currentY += 15;
    doc.fontSize(9).font('Helvetica-Bold');
    drawText('Terms and Conditions', margin + 20, currentY);
    
    currentY += 15;
    doc.fontSize(8).font('Helvetica');
    drawText('1. Goods once sold will not be taken back or exchanged', margin + 20, currentY);
    
    currentY += 12;
    drawText(`2. All disputes are subject to ${BILL_CITY} jurisdiction only`, margin + 20, currentY);

    // Finalize PDF
    doc.end();

  } catch (error) {
    console.error("Error generating invoice:", error);
    res.status(500).json({ success: false, message: error.message || "Server error" });
  }
});

// API endpoint to get all invoices (optional - for future use)
app.get("/api/invoices", async (req, res) => {
  try {
    if (!isMongoConnected) {
      return res.json({ 
        success: false, 
        message: "Database not available. Please install and start MongoDB to use this feature." 
      });
    }

    const invoices = await Invoice.find({}, 'invoiceNo billTo total createdAt')
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ success: true, invoices });
  } catch (error) {
    console.error("Error fetching invoices:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// API endpoint to delete an invoice (optional - for future use)
app.delete("/api/invoice/:invoiceNo", async (req, res) => {
  try {
    if (!isMongoConnected) {
      return res.json({ 
        success: false, 
        message: "Database not available. Please install and start MongoDB to use this feature." 
      });
    }

    const { invoiceNo } = req.params;
    const deletedInvoice = await Invoice.findOneAndDelete({ invoiceNo: invoiceNo });
    
    if (!deletedInvoice) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }
    
    res.json({ success: true, message: "Invoice deleted successfully" });
  } catch (error) {
    console.error("Error deleting invoice:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.listen(PORT, () => console.log("✅ Render.com Optimized Invoice app running on port", PORT));
