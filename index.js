const express = require("express");
const bodyParser = require("body-parser");
const puppeteer = require("puppeteer");
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
        <h2 style="text-align: center; color: #333;">Invoice Generator with Database</h2>
        
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
        // Prevent accidental page reload
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
          // Clear existing items
          document.getElementById('items').innerHTML = '';
          
          // Populate basic fields
          document.querySelector('input[name="billto"]').value = invoice.billTo;
          document.querySelector('input[name="invoice"]').value = invoice.invoiceNo;
          document.querySelector('input[name="date"]').value = new Date(invoice.date).toISOString().split('T')[0];
          document.querySelector('input[name="duedate"]').value = new Date(invoice.dueDate).toISOString().split('T')[0];
          document.querySelector('input[name="received"]').value = invoice.received;
          
          // Populate items
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
          
          // Reset dates to today
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

        // Add event listeners to existing form fields
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
              
              // For iOS compatibility
              if (window.navigator.msSaveOrOpenBlob) {
                window.navigator.msSaveOrOpenBlob(blob, "invoice_" + data.billto + ".pdf");
              } else {
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
              }
              
              // Clean up the URL object
              setTimeout(() => window.URL.revokeObjectURL(url), 100);
              
              // Reset form modification flag after successful download
              formModified = false;
              
              // Show success message
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

        // Add first item by default
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
        // Continue with PDF generation even if database save fails
      }
    }

    // Generate PDF with Puppeteer - OPTIMIZED FOR SINGLE PAGE
    const rows = items.map(
      (item, i) =>
        `<tr>
          <td>${i + 1}</td>
          <td>${item.name}</td>
          <td>${item.qty} ${item.unit}</td>
          <td>₹${item.rate}</td>
          <td>₹${item.amount}</td>
        </tr>`
    ).join("");

    // Calculate minimum rows needed (ensure at least 8 rows for proper spacing)
    const minRows = Math.max(8, items.length);
    const emptyRowsCount = minRows - items.length;
    
    const emptyRows = Array(emptyRowsCount).fill().map(() => 
      `<tr class="empty-row">
        <td>&nbsp;</td>
        <td>&nbsp;</td>
        <td>&nbsp;</td>
        <td>&nbsp;</td>
        <td>&nbsp;</td>
      </tr>`
    ).join('');

    const totalInWords = numberToWords(Math.floor(parseFloat(total))).trim() + " Rupees";

    // Format dates
    const invoiceDate = new Date(date).toLocaleDateString('en-GB');
    const dueDateFormatted = new Date(duedate).toLocaleDateString('en-GB');

    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
      * { 
        box-sizing: border-box; 
        margin: 0; 
        padding: 0; 
      }
      
      body { 
        font-family: Arial, sans-serif;
        font-size: 10px;
        line-height: 1.2;
        color: #000;
        width: 210mm;
        height: 297mm;
        margin: 0;
        padding: 8mm;
        overflow: hidden;
        background: white;
      }
      
      .invoice-container {
        width: 100%;
        height: 100%;
        border: 2px solid #000;
        display: flex;
        flex-direction: column;
      }
      
      /* Header Section - Fixed height */
      .header {
        padding: 8px 12px;
        border-bottom: 1px solid #000;
        display: flex;
        justify-content: space-between;
        align-items: center;
        height: 35px;
        flex-shrink: 0;
      }
      
      .header h1 {
        font-size: 14px;
        font-weight: bold;
        margin: 0;
      }
      
      .original-tag {
        border: 1px solid #000;
        padding: 3px 6px;
        font-size: 8px;
        background: #f0f0f0;
      }
      
      /* Business Info - Fixed height */
      .business-info {
        text-align: center;
        padding: 10px;
        border-bottom: 1px solid #000;
        height: 55px;
        flex-shrink: 0;
      }
      
      .business-name {
        font-size: 14px;
        font-weight: bold;
        margin-bottom: 4px;
      }
      
      .business-details {
        font-size: 9px;
        line-height: 1.3;
      }
      
      /* Invoice Details - Fixed height */
      .invoice-details {
        display: flex;
        border-bottom: 1px solid #000;
        height: 65px;
        flex-shrink: 0;
      }
      
      .bill-to {
        flex: 1;
        padding: 8px 12px;
        border-right: 1px solid #000;
      }
      
      .invoice-meta {
        flex: 1;
        padding: 8px 12px;
      }
      
      .section-title {
        font-weight: bold;
        font-size: 9px;
        margin-bottom: 4px;
      }
      
      .meta-table {
        width: 100%;
        font-size: 8px;
        border-collapse: collapse;
      }
      
      .meta-table th {
        font-weight: bold;
        padding: 2px 4px;
        text-align: left;
        border-bottom: 1px solid #ddd;
      }
      
      .meta-table td {
        padding: 2px 4px;
        font-weight: normal;
      }
      
      /* Items Section - Flexible */
      .items-section {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-height: 0;
      }
      
      .items-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 9px;
        height: 100%;
      }
      
      .items-table th {
        background-color: #f0f0f0;
        border: 1px solid #000;
        padding: 6px 4px;
        font-weight: bold;
        text-align: center;
        height: 25px;
      }
      
      .items-table td {
        border: 1px solid #000;
        padding: 4px 6px;
        text-align: center;
        height: 20px;
        vertical-align: middle;
      }
      
      .items-table td:nth-child(2) {
        text-align: left;
        max-width: 120px;
        word-wrap: break-word;
      }
      
      .items-table td:nth-child(4),
      .items-table td:nth-child(5) {
        text-align: right;
      }
      
      .empty-row td {
        height: 18px;
        border-bottom: 1px solid #ddd;
      }
      
      /* Total Section - Fixed height */
      .total-section {
        border-top: 2px solid #000;
        flex-shrink: 0;
      }
      
      .total-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 10px;
      }
      
      .total-table td {
        border: 1px solid #000;
        padding: 6px 8px;
        height: 25px;
      }
      
      .total-label {
        background: #f0f0f0;
        font-weight: bold;
        text-align: center;
        width: 60%;
      }
      
      .total-amount {
        text-align: right;
        font-weight: bold;
        width: 20%;
      }
      
      /* Footer - Fixed height */
      .footer {
        border-top: 1px solid #000;
        padding: 8px 12px;
        height: 65px;
        flex-shrink: 0;
      }
      
      .amount-words {
        margin-bottom: 8px;
      }
      
      .terms {
        font-size: 8px;
        line-height: 1.3;
      }
      
      .terms-title {
        font-weight: bold;
        margin-bottom: 3px;
      }
      
      /* Column widths */
      .col-sno { width: 8%; }
      .col-item { width: 45%; }
      .col-qty { width: 15%; }
      .col-rate { width: 16%; }
      .col-amount { width: 16%; }
    </style>
</head>
<body>
<div class="invoice-container">
  <!-- Header -->
  <div class="header">
    <h1>BILL OF SUPPLY</h1>
    <div class="original-tag">ORIGINAL FOR RECIPIENT</div>
  </div>

  <!-- Business Info -->
  <div class="business-info">
    <div class="business-name">${BILL_NAME}</div>
    <div class="business-details">
      ${BILL_ADDRESS}<br>
      Mobile: ${BILL_PHONE}
    </div>
  </div>
  
  <!-- Invoice Details -->
  <div class="invoice-details">
    <div class="bill-to">
      <div class="section-title">BILL TO</div>
      <div style="font-size: 9px; line-height: 1.3;">${billto}</div>
    </div>
    <div class="invoice-meta">
      <table class="meta-table">
        <tr>
          <th>Invoice No.</th>
          <th>Invoice Date</th>
          <th>Due Date</th>
        </tr>
        <tr>
          <td>${invoice}</td>
          <td>${invoiceDate}</td>
          <td>${dueDateFormatted}</td>
        </tr>
      </table>
    </div>
  </div>
  
  <!-- Items Section -->
  <div class="items-section">
    <table class="items-table">
      <thead>
        <tr>
          <th class="col-sno">S.NO</th>
          <th class="col-item">ITEMS</th>
          <th class="col-qty">QTY.</th>
          <th class="col-rate">RATE</th>
          <th class="col-amount">AMOUNT</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        ${emptyRows}
      </tbody>
    </table>
  </div>
  
  <!-- Total Section -->
  <div class="total-section">
    <table class="total-table">
      <tr>
        <td class="total-label">TOTAL</td>
        <td class="total-amount">₹ ${total}</td>
        <td class="total-amount">₹ ${total}</td>
      </tr>
      <tr>
        <td class="total-label">RECEIVED AMOUNT</td>
        <td class="total-amount">₹ ${received}</td>
        <td class="total-amount">₹ ${received}</td>
      </tr>
    </table>
  </div>
  
  <!-- Footer -->
  <div class="footer">
    <div class="amount-words">
      <div style="font-weight: bold; font-size: 9px; margin-bottom: 2px;">Total Amount (in words)</div>
      <div style="font-size: 9px;">${totalInWords}</div>
    </div>
    
    <div class="terms">
      <div class="terms-title">Terms and Conditions</div>
      <div>1. Goods once sold will not be taken back or exchanged</div>
      <div>2. All disputes are subject to ${BILL_CITY} jurisdiction only</div>
    </div>
  </div>
</div>
</body>
</html>`;

    // Use Puppeteer for PDF generation (works great on Render.com)
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process', // Important for Render.com
          '--disable-gpu'
        ]
      });

      const page = await browser.newPage();
      
      // Set viewport and content
      await page.setViewport({ width: 794, height: 1123 }); // A4 dimensions
      await page.setContent(html, { waitUntil: 'networkidle0' });

      // Generate PDF with precise settings for single page
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '5mm',
          right: '5mm',
          bottom: '5mm',
          left: '5mm'
        },
        preferCSSPageSize: true
      });

      await browser.close();

      // Send PDF response
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", 'attachment; filename="invoice_' + billto.replace(/[^a-zA-Z0-9]/g, '_') + '_' + invoice + '.pdf"');
      res.send(pdfBuffer);

    } catch (pdfError) {
      if (browser) await browser.close();
      console.error("PDF generation error:", pdfError);
      return res.status(500).json({ success: false, message: "PDF generation failed: " + pdfError.message });
    }

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

app.listen(PORT, () => console.log("✅ Enhanced Invoice app with Puppeteer running on port", PORT));
