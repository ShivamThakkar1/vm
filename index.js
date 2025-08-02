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

// Invoice Schema (removed received field)
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
      <title>Professional Invoice Generator</title>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>
        * { box-sizing: border-box; }
        body { 
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
          padding: 15px; 
          margin: 0; 
          background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
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
          border: 2px solid #e1e5e9;
          border-radius: 8px;
          transition: all 0.3s ease;
        }
        
        input:focus, select:focus {
          border-color: #007bff;
          outline: none;
          box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
        }
        
        /* Search Section */
        .search-section {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 25px;
          border-radius: 15px;
          margin-bottom: 25px;
          box-shadow: 0 8px 25px rgba(0,0,0,0.15);
        }
        
        .search-section h3 {
          margin: 0 0 20px 0;
          font-size: 20px;
          font-weight: 600;
        }
        
        .search-row {
          display: flex;
          gap: 15px;
          align-items: end;
          flex-wrap: wrap;
        }
        
        .search-input-wrapper {
          flex: 1;
          min-width: 200px;
        }
        
        .search-row input {
          margin: 0;
          border: none;
          background: rgba(255,255,255,0.9);
        }
        
        .search-buttons {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        
        .search-row button {
          width: auto;
          padding: 12px 25px;
          margin: 0;
          background: #28a745;
          color: white;
          font-weight: 600;
          border: none;
          cursor: pointer;
          transition: all 0.3s ease;
          white-space: nowrap;
        }
        
        .search-row button:hover {
          background: #218838;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        }
        
        .clear-btn {
          background: #fd7e14 !important;
        }
        
        .clear-btn:hover {
          background: #e8660c !important;
        }
        
        @media (max-width: 768px) {
          .search-row {
            flex-direction: column;
            align-items: stretch;
          }
          
          .search-input-wrapper {
            min-width: auto;
          }
          
          .search-buttons {
            justify-content: stretch;
          }
          
          .search-row button {
            flex: 1;
            min-width: 120px;
          }
        }
        
        /* Professional Item Table */
        .items-container {
          background: white;
          border-radius: 15px;
          padding: 20px;
          box-shadow: 0 8px 25px rgba(0,0,0,0.1);
          margin-bottom: 25px;
          overflow-x: auto;
        }
        
        .item-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
          font-size: 14px;
          min-width: 800px;
        }
        
        .item-table th {
          background: linear-gradient(135deg, #343a40 0%, #495057 100%);
          color: white;
          padding: 15px 8px;
          text-align: center;
          font-weight: 600;
          border: 1px solid #dee2e6;
          font-size: 13px;
        }
        
        .item-table td {
          padding: 12px 8px;
          border: 1px solid #dee2e6;
          background: #fff;
          vertical-align: middle;
        }
        
        .item-table tbody tr:nth-child(even) {
          background: #f8f9fa;
        }
        
        .item-table tbody tr:hover {
          background: #e3f2fd;
          transition: background-color 0.2s ease;
        }
        
        .item-table input, .item-table select {
          width: 100%;
          padding: 8px;
          border: 1px solid #ced4da;
          border-radius: 4px;
          margin: 0;
          font-size: 13px;
        }
        
        .item-table input:focus, .item-table select:focus {
          border-color: #007bff;
          box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.1);
        }
        
        .amount-display {
          background: #f8f9fa;
          padding: 8px;
          text-align: right;
          font-weight: 600;
          color: #28a745;
          border-radius: 4px;
        }
        
        .remove-btn { 
          background: #dc3545 !important; 
          color: white !important; 
          border: none !important; 
          padding: 8px 15px !important; 
          cursor: pointer !important; 
          border-radius: 6px !important; 
          font-size: 12px !important;
          width: auto !important;
          margin: 0 !important;
          font-weight: 600;
          transition: all 0.3s ease;
        }
        
        .remove-btn:hover {
          background: #c82333 !important;
          transform: translateY(-1px);
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
        
        .form-section { 
          margin-bottom: 25px; 
          background: white;
          padding: 20px;
          border-radius: 15px;
          box-shadow: 0 8px 25px rgba(0,0,0,0.1);
        }
        
        .form-row { 
          display: flex; 
          gap: 15px; 
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
          
          .item-table {
            font-size: 12px;
          }
          
          .item-table th, .item-table td {
            padding: 8px 4px;
          }
        }
        
        .three-col { 
          display: grid; 
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
          gap: 15px; 
        }
        
        button[type="submit"] {
          background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
          color: white;
          font-weight: 600;
          padding: 18px;
          font-size: 16px;
          border: none;
          cursor: pointer;
          transition: all 0.3s ease;
        }
        
        button[type="submit"]:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(0,0,0,0.2);
        }
        
        button[type="button"]:not(.remove-btn):not(.search-row button) {
          background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
          color: white;
          font-weight: 600;
          border: none;
          cursor: pointer;
          transition: all 0.3s ease;
        }
        
        button[type="button"]:not(.remove-btn):not(.search-row button):hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(40, 167, 69, 0.3);
        }
        
        .total-display {
          font-size: 24px;
          font-weight: 700;
          color: #28a745;
          text-align: center;
          padding: 20px;
          background: linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%);
          border-radius: 12px;
          margin: 15px 0;
          border: 2px solid #28a745;
        }
        
        .alert {
          padding: 15px;
          margin: 15px 0;
          border-radius: 8px;
          font-weight: 600;
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
          background: linear-gradient(135deg, #fff3cd 0%, #ffeaa7 100%);
          color: #856404;
          border: 2px solid #ffc107;
          padding: 15px;
          border-radius: 8px;
          margin-bottom: 20px;
          text-align: center;
          font-weight: 600;
        }
        
        label {
          display: block;
          margin-bottom: 8px;
          font-weight: 600;
          color: #495057;
          font-size: 14px;
        }
        
        h2 {
          text-align: center;
          color: #343a40;
          font-size: 28px;
          font-weight: 700;
          margin-bottom: 30px;
          text-shadow: 2px 2px 4px rgba(0,0,0,0.1);
        }
        
        h3 {
          color: #495057;
          font-weight: 600;
          margin-bottom: 15px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>🧾 Professional Invoice Generator</h2>
        
        <!-- Search Section -->
        <div class="search-section">
          <h3>🔍 Search & Edit Existing Invoice</h3>
          <div class="search-row">
            <div class="search-input-wrapper">
              <label style="color: white; margin-bottom: 8px;">Invoice Number:</label>
              <input id="searchInvoice" placeholder="Enter invoice number to search" />
            </div>
            <div class="search-buttons">
              <button type="button" onclick="searchInvoice()">Search Invoice</button>
              <button type="button" class="clear-btn" onclick="clearForm()">Clear Form</button>
            </div>
          </div>
          <div id="searchMessage"></div>
        </div>
        
        <!-- Editing Indicator -->
        <div id="editingIndicator" class="editing-indicator" style="display: none;">
          ✏️ Editing Invoice: <span id="editingInvoiceNo"></span>
        </div>
        
        <form id="form">
          <input type="hidden" id="isEditing" value="false" />
          <input type="hidden" id="originalInvoiceNo" value="" />
          
          <div class="form-section">
            <h3>📋 Customer Information</h3>
            <label>Bill To:</label>
            <input name="billto" placeholder="Enter customer name and address" required />
          </div>
          
          <div class="form-section">
            <h3>📄 Invoice Details</h3>
            <div class="three-col">
              <div>
                <label>Invoice Number:</label>
                <input name="invoice" placeholder="Enter invoice number" required />
              </div>
              <div>
                <label>Invoice Date:</label>
                <input name="date" type="date" value="${todayIST}" required />
              </div>
              <div>
                <label>Due Date:</label>
                <input name="duedate" type="date" value="${todayIST}" />
              </div>
            </div>
          </div>

          <div class="items-container">
            <h3>📦 Items & Services</h3>
            <table class="item-table">
              <thead>
                <tr>
                  <th style="width: 40px;">S.No</th>
                  <th style="width: 250px;">Item/Service Description</th>
                  <th style="width: 80px;">Quantity</th>
                  <th style="width: 80px;">Unit</th>
                  <th style="width: 90px;">Rate (₹)</th>
                  <th style="width: 90px;">Discount</th>
                  <th style="width: 100px;">Amount (₹)</th>
                  <th style="width: 80px;">Action</th>
                </tr>
              </thead>
              <tbody id="itemsTableBody">
              </tbody>
            </table>
            <button type="button" onclick="addItem()">➕ Add New Item</button>
          </div>
          
          <div class="form-section">
            <div class="total-display">💰 Total Amount: ₹<span id="total">0.00</span></div>
          </div>
          
          <button type="submit" id="submitBtn">💾 Save & Download PDF</button>
        </form>
      </div>

      <script>
        let formModified = false;
        let itemCounter = 0;
        
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
          document.getElementById('submitBtn').innerHTML = '🔄 Update & Download PDF';
        }

        function clearEditingMode() {
          document.getElementById('isEditing').value = 'false';
          document.getElementById('originalInvoiceNo').value = '';
          document.getElementById('editingIndicator').style.display = 'none';
          document.getElementById('submitBtn').innerHTML = '💾 Save & Download PDF';
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
                showMessage(\`✅ Invoice \${invoiceNo} loaded successfully! You can now edit and update it.\`, 'success');
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
          document.getElementById('itemsTableBody').innerHTML = '';
          itemCounter = 0;
          
          document.querySelector('input[name="billto"]').value = invoice.billTo;
          document.querySelector('input[name="invoice"]').value = invoice.invoiceNo;
          document.querySelector('input[name="date"]').value = new Date(invoice.date).toISOString().split('T')[0];
          document.querySelector('input[name="duedate"]').value = new Date(invoice.dueDate).toISOString().split('T')[0];
          
          invoice.items.forEach(item => {
            addItem();
            const lastRow = document.getElementById('itemsTableBody').lastElementChild;
            const inputs = lastRow.querySelectorAll('input, select');
            inputs[0].value = item.name;
            inputs[1].value = item.qty;
            inputs[2].value = item.unit;
            inputs[3].value = item.rate;
            inputs[4].value = item.discount;
          });
          
          updateTotals();
          markFormModified();
        }

        function clearForm() {
          if (formModified && !confirm('Are you sure you want to clear the form? All unsaved changes will be lost.')) {
            return;
          }
          
          document.getElementById('form').reset();
          document.getElementById('searchInvoice').value = '';
          document.getElementById('itemsTableBody').innerHTML = '';
          document.getElementById('searchMessage').innerHTML = '';
          clearEditingMode();
          itemCounter = 0;
          
          const todayIST = new Date().toISOString().split('T')[0];
          document.querySelector('input[name="date"]').value = todayIST;
          document.querySelector('input[name="duedate"]').value = todayIST;
          
          addItem();
          formModified = false;
          updateTotals();
        }

        function addItem() {
          itemCounter++;
          const tableBody = document.getElementById('itemsTableBody');
          const row = document.createElement('tr');
          
          row.innerHTML = \`
            <td style="text-align: center; font-weight: bold; background: #f8f9fa;">\${itemCounter}</td>
            <td><input name="name" placeholder="Enter item description" required /></td>
            <td><input name="qty" type="number" step="0.01" placeholder="0" required /></td>
            <td>
              <select name="unit">
                <option value="PCS">PCS - Pieces</option>
                <option value="KG">KG - Kilogram</option>
                <option value="GM">GM - Gram</option>
                <option value="LTR">LTR - Litre</option>
                <option value="ML">ML - Millilitre</option>
                <option value="DOZ">DOZ - Dozen</option>
                <option value="BOX">BOX - Box</option>
                <option value="PKT">PKT - Packet</option>
                <option value="BTL">BTL - Bottle</option>
                <option value="TIN">TIN - Tin</option>
                <option value="BDL">BDL - Bundle</option>
                <option value="SQM">SQM - Square Meter</option>
                <option value="MTR">MTR - Meter</option>
                <option value="SET">SET - Set</option>
                <option value="UNIT">UNIT - Unit</option>
              </select>
            </td>
            <td><input name="rate" type="number" step="0.01" placeholder="0.00" required /></td>
            <td><input name="discount" type="text" placeholder="0 or 10%" /></td>
            <td><div class="amount-display">₹0.00</div></td>
            <td style="text-align: center;">
              <button type="button" class="remove-btn" onclick="removeItem(this)">🗑️ Remove</button>
            </td>
          \`;
          
          tableBody.appendChild(row);
          
          // Add event listeners to the new row inputs
          row.querySelectorAll("input, select").forEach(input => {
            input.addEventListener("input", updateTotals);
            input.addEventListener("input", markFormModified);
          });
          
          updateTotals();
          markFormModified();
        }

        function removeItem(btn) {
          if (document.getElementById('itemsTableBody').children.length <= 1) {
            alert('At least one item is required');
            return;
          }
          
          btn.closest('tr').remove();
          
          // Renumber the rows
          const rows = document.querySelectorAll('#itemsTableBody tr');
          rows.forEach((row, index) => {
            row.cells[0].textContent = index + 1;
          });
          
          itemCounter = rows.length;
          updateTotals();
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

        function updateTotals() {
          let total = 0;
          
          document.querySelectorAll("#itemsTableBody tr").forEach(row => {
            const inputs = row.querySelectorAll("input, select");
            const qty = parseFloat(inputs[1].value) || 0;
            const rate = parseFloat(inputs[3].value) || 0;
            const discount = inputs[4].value || '0';
            
            const grossAmount = qty * rate;
            const discountAmount = calculateDiscount(grossAmount, discount);
            const netAmount = grossAmount - discountAmount;
            
            const amountDisplay = row.querySelector('.amount-display');
            amountDisplay.textContent = "₹" + netAmount.toFixed(2);
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
            items: [],
            isEditing: isEditing,
            originalInvoiceNo: originalInvoiceNo
          };

          document.querySelectorAll("#itemsTableBody tr").forEach(row => {
            const inputs = row.querySelectorAll("input, select");
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
              a.download = "invoice_" + data.billto.replace(/[^a-zA-Z0-9]/g, '_') + "_" + data.invoice + ".pdf";
              
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
                showMessage(\`✅ Invoice \${data.invoice} updated and downloaded successfully!\`, 'success');
              } else {
                showMessage(\`✅ Invoice \${data.invoice} saved and downloaded successfully!\`, 'success');
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

        // Initialize with one item
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
    const { billto, invoice, date, duedate, items, total, isEditing, originalInvoiceNo } = req.body;

    // Save or update invoice in MongoDB (if available) - removed received field
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

    // Generate Clean, Professional PDF with PDFKit
    const doc = new PDFDocument({ 
      size: 'A4', 
      margin: 40,
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

    // Page dimensions and settings
    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const margin = 40;
    const contentWidth = pageWidth - (margin * 2);

    // Helper function to draw simple bordered rectangle
    function drawBox(x, y, width, height, fillColor = null) {
      if (fillColor) {
        doc.rect(x, y, width, height).fill(fillColor);
        doc.fillColor('#000000'); // Reset to black
      }
      doc.rect(x, y, width, height).stroke('#000000');
    }

    let currentY = margin;

    // CLEAN HEADER SECTION
    // Main title
    drawBox(margin, currentY, contentWidth, 35, '#f5f5f5');
    doc.fontSize(18).font('Helvetica-Bold');
    doc.text('BILL OF SUPPLY', margin, currentY + 10, {
      width: contentWidth,
      align: 'center'
    });

    currentY += 35;

    // Document type indicator
    drawBox(pageWidth - 180, currentY, 140, 20);
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('ORIGINAL FOR RECIPIENT', pageWidth - 180, currentY + 6, {
      width: 140,
      align: 'center'
    });

    currentY += 30;

    // BUSINESS INFORMATION SECTION
    drawBox(margin, currentY, contentWidth, 25, '#f8f9fa');
    doc.fontSize(16).font('Helvetica-Bold');
    doc.text(BILL_NAME, margin, currentY + 6, {
      width: contentWidth,
      align: 'center'
    });

    currentY += 25;

    // Business details
    const businessInfoHeight = 60;
    drawBox(margin, currentY, contentWidth, businessInfoHeight);

    doc.fontSize(11).font('Helvetica');
    let businessY = currentY + 10;
    doc.text(BILL_ADDRESS, margin + 10, businessY, {
      width: contentWidth - 20,
      align: 'center'
    });
    
    businessY += 20;
    doc.text(`Mobile: ${BILL_PHONE}`, margin + 10, businessY, {
      width: contentWidth - 20,
      align: 'center'
    });

    currentY += businessInfoHeight + 10;

    // INVOICE DETAILS SECTION
    const detailsRowHeight = 25;
    const colWidth = contentWidth / 2;

    // Bill To section (left half)
    drawBox(margin, currentY, colWidth - 5, detailsRowHeight, '#e9ecef');
    doc.fontSize(11).font('Helvetica-Bold');
    doc.text('BILL TO', margin + 5, currentY + 8);

    // Invoice meta info (right half)
    const metaStartX = margin + colWidth + 5;
    const metaColWidth = (colWidth - 10) / 3;

    drawBox(metaStartX, currentY, metaColWidth, detailsRowHeight, '#e9ecef');
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('Invoice No.', metaStartX + 5, currentY + 8);

    drawBox(metaStartX + metaColWidth, currentY, metaColWidth, detailsRowHeight, '#e9ecef');
    doc.text('Invoice Date', metaStartX + metaColWidth + 5, currentY + 8);

    drawBox(metaStartX + (metaColWidth * 2), currentY, metaColWidth, detailsRowHeight, '#e9ecef');
    doc.text('Due Date', metaStartX + (metaColWidth * 2) + 5, currentY + 8);

    currentY += detailsRowHeight;

    // Customer details and invoice values
    const customerDetailsHeight = 50;
    
    drawBox(margin, currentY, colWidth - 5, customerDetailsHeight);

    // Customer info
    doc.fontSize(10).font('Helvetica');
    const billToLines = billto.split('\n');
    let customerY = currentY + 8;
    billToLines.forEach((line, index) => {
      if (index < 3) { // Limit to 3 lines
        doc.text(line.substring(0, 50), margin + 8, customerY + (index * 12));
      }
    });

    // Invoice values
    drawBox(metaStartX, currentY, metaColWidth, customerDetailsHeight);
    doc.fontSize(10).font('Helvetica');
    doc.text(invoice, metaStartX + 5, currentY + 20);

    drawBox(metaStartX + metaColWidth, currentY, metaColWidth, customerDetailsHeight);
    doc.text(new Date(date).toLocaleDateString('en-GB'), metaStartX + metaColWidth + 5, currentY + 20);

    drawBox(metaStartX + (metaColWidth * 2), currentY, metaColWidth, customerDetailsHeight);
    doc.text(new Date(duedate).toLocaleDateString('en-GB'), metaStartX + (metaColWidth * 2) + 5, currentY + 20);

    currentY += customerDetailsHeight + 15;

    // CLEAN ITEMS TABLE
    const tableStartY = currentY;
    const rowHeight = 25;
    const headerRowHeight = 30;

    // Table column definitions with proper alignment
    const tableColumns = [
      { header: 'S.No', width: 40, align: 'center' },
      { header: 'Item Description', width: 180, align: 'left' },
      { header: 'Qty', width: 50, align: 'right' },
      { header: 'Unit', width: 50, align: 'center' },
      { header: 'Rate (₹)', width: 70, align: 'right' },
      { header: 'Discount', width: 70, align: 'center' },
      { header: 'Amount (₹)', width: 85, align: 'right' }
    ];

    let tableX = margin;

    // Table headers
    tableColumns.forEach(col => {
      drawBox(tableX, currentY, col.width, headerRowHeight, '#e9ecef');
      
      doc.fontSize(10).font('Helvetica-Bold');
      const textY = currentY + 10;
      
      if (col.align === 'center') {
        doc.text(col.header, tableX + 2, textY, { width: col.width - 4, align: 'center' });
      } else if (col.align === 'right') {
        doc.text(col.header, tableX + 2, textY, { width: col.width - 4, align: 'right' });
      } else {
        doc.text(col.header, tableX + 5, textY);
      }
      
      tableX += col.width;
    });

    currentY += headerRowHeight;

    // Table data rows
    items.forEach((item, index) => {
      tableX = margin;
      
      // Row data
      const rowData = [
        (index + 1).toString(),
        item.name.length > 25 ? item.name.substring(0, 25) + '...' : item.name,
        parseFloat(item.qty).toFixed(2),
        item.unit,
        parseFloat(item.rate).toFixed(2),
        item.discount || '0',
        parseFloat(item.amount).toFixed(2)
      ];

      tableColumns.forEach((col, colIndex) => {
        drawBox(tableX, currentY, col.width, rowHeight);
        
        doc.fontSize(9).font('Helvetica');
        const textY = currentY + 8;
        
        if (col.align === 'center') {
          doc.text(rowData[colIndex], tableX + 2, textY, { width: col.width - 4, align: 'center' });
        } else if (col.align === 'right') {
          doc.text(rowData[colIndex], tableX + 2, textY, { width: col.width - 4, align: 'right' });
        } else {
          doc.text(rowData[colIndex], tableX + 5, textY);
        }
        
        tableX += col.width;
      });

      currentY += rowHeight;
    });

    // Add empty rows for clean appearance
    const minRows = 8;
    const emptyRowsNeeded = Math.max(0, minRows - items.length);
    
    for (let i = 0; i < emptyRowsNeeded; i++) {
      tableX = margin;
      tableColumns.forEach(col => {
        drawBox(tableX, currentY, col.width, rowHeight);
        tableX += col.width;
      });
      currentY += rowHeight;
    }

    // TOTAL SECTION - Simplified without colors
    const totalRowHeight = 28;
    
    // Total row
    tableX = margin;
    const totalLabelWidth = tableColumns.slice(0, 5).reduce((sum, col) => sum + col.width, 0);
    
    drawBox(tableX, currentY, totalLabelWidth, totalRowHeight, '#f0f0f0');
    doc.fontSize(12).font('Helvetica-Bold');
    doc.text('TOTAL AMOUNT', tableX + 5, currentY + 8, { width: totalLabelWidth - 10, align: 'center' });

    tableX += totalLabelWidth;

    drawBox(tableX, currentY, tableColumns[5].width, totalRowHeight);
    doc.fontSize(11).font('Helvetica-Bold');
    doc.text('---', tableX + 2, currentY + 8, { width: tableColumns[5].width - 4, align: 'center' });

    tableX += tableColumns[5].width;

    drawBox(tableX, currentY, tableColumns[6].width, totalRowHeight, '#f8f9fa');
    doc.fontSize(12).font('Helvetica-Bold');
    doc.text(`₹ ${parseFloat(total).toFixed(2)}`, tableX + 2, currentY + 8, { width: tableColumns[6].width - 4, align: 'right' });

    currentY += totalRowHeight + 20;

    // AMOUNT IN WORDS SECTION
    drawBox(margin, currentY, contentWidth, 25, '#f5f5f5');
    doc.fontSize(11).font('Helvetica-Bold');
    doc.text('Amount in Words', margin + 5, currentY + 8);

    currentY += 25;

    const totalInWords = numberToWords(Math.floor(parseFloat(total))).trim() + " Rupees Only";
    drawBox(margin, currentY, contentWidth, 30);
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text(totalInWords, margin + 10, currentY + 10);

    currentY += 40;

    // TERMS AND CONDITIONS SECTION
    drawBox(margin, currentY, contentWidth, 25, '#f5f5f5');
    doc.fontSize(12).font('Helvetica-Bold');
    doc.text('Terms and Conditions', margin + 5, currentY + 8);

    currentY += 25;

    const termsHeight = 50;
    drawBox(margin, currentY, contentWidth, termsHeight);

    doc.fontSize(9).font('Helvetica');
    doc.text('1. Goods once sold will not be taken back or exchanged', margin + 10, currentY + 8);
    doc.text(`2. All disputes are subject to ${BILL_CITY} jurisdiction only`, margin + 10, currentY + 22);
    doc.text('3. Payment terms: As per agreement', margin + 10, currentY + 36);

    // SIGNATURE SECTION
    currentY += termsHeight + 20;
    if (currentY < pageHeight - 80) {
      const signatureWidth = contentWidth / 2;
      
      // Authorized Signatory
      drawBox(margin + signatureWidth, currentY, signatureWidth, 60);
      
      doc.fontSize(10).font('Helvetica');
      doc.text('For ' + BILL_NAME, margin + signatureWidth + 10, currentY + 10);
      doc.text('Authorized Signatory', margin + signatureWidth + 10, currentY + 40);
    }

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

app.listen(PORT, () => console.log("✅ Professional Invoice Generator running on port", PORT));
