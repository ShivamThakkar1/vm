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
        
        /* Professional Item Table - Mobile Responsive */
        .items-container {
          background: white;
          border-radius: 15px;
          padding: 20px;
          box-shadow: 0 8px 25px rgba(0,0,0,0.1);
          margin-bottom: 25px;
          overflow-x: auto;
        }
        
        /* Desktop Table View */
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
        
        /* Mobile Card View */
        .mobile-items-container {
          display: none;
        }
        
        .item-card {
          background: white;
          border: 2px solid #e9ecef;
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 20px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          position: relative;
        }
        
        .item-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 15px;
          padding-bottom: 10px;
          border-bottom: 2px solid #e9ecef;
        }
        
        .item-number {
          background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
          color: white;
          width: 30px;
          height: 30px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          font-size: 14px;
        }
        
        .mobile-remove-btn {
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
        
        .mobile-remove-btn:hover {
          background: #c82333 !important;
          transform: translateY(-1px);
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
        
        .item-field {
          margin-bottom: 15px;
        }
        
        .item-field label {
          display: block;
          margin-bottom: 5px;
          font-weight: 600;
          color: #495057;
          font-size: 14px;
        }
        
        .item-field input,
        .item-field select {
          width: 100%;
          padding: 12px;
          border: 2px solid #e1e5e9;
          border-radius: 8px;
          font-size: 16px;
          margin: 0;
        }
        
        .mobile-amount-display {
          background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
          color: white;
          padding: 15px;
          text-align: center;
          font-weight: 700;
          font-size: 18px;
          border-radius: 8px;
          margin-top: 15px;
        }
        
        @media (max-width: 768px) {
          .item-table-container {
            display: none;
          }
          
          .mobile-items-container {
            display: block;
          }
          
          body {
            padding: 10px;
          }
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
        
        button[type="button"]:not(.remove-btn):not(.mobile-remove-btn):not(.search-row button) {
          background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
          color: white;
          font-weight: 600;
          border: none;
          cursor: pointer;
          transition: all 0.3s ease;
        }
        
        button[type="button"]:not(.remove-btn):not(.mobile-remove-btn):not(.search-row button):hover {
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
            
            <!-- Desktop Table View -->
            <div class="item-table-container">
              <table class="item-table">
                <thead>
                  <tr>
                    <th style="width: 40px;">S.No</th>
                    <th style="width: 250px;">Item/Service Description</th>
                    <th style="width: 80px;">Quantity</th>
                    <th style="width: 80px;">Unit</th>
                    <th style="width: 90px;">Rate</th>
                    <th style="width: 90px;">Discount</th>
                    <th style="width: 100px;">Amount</th>
                    <th style="width: 80px;">Action</th>
                  </tr>
                </thead>
                <tbody id="itemsTableBody">
                </tbody>
              </table>
            </div>
            
            <!-- Mobile Card View -->
            <div class="mobile-items-container" id="mobileItemsContainer">
            </div>
            
            <button type="button" onclick="addItem()">➕ Add New Item</button>
          </div>
          
          <div class="form-section">
            <div class="total-display">💰 Total Amount: <span id="total">0.00</span></div>
          </div>
          
          <button type="submit" id="submitBtn">💾 Save & Download PDF</button>
        </form>
      </div>

      <script>
        let formModified = false;
        let itemCounter = 0;
        
        // Enhanced reload prevention - multiple safety checks
        window.addEventListener('beforeunload', function (e) {
          if (formModified) {
            e.preventDefault();
            e.returnValue = 'Are you sure you want to leave? Your unsaved changes will be lost.';
            return e.returnValue;
          }
        });

        // Additional protection for accidental page refresh
        document.addEventListener('keydown', function(e) {
          // Prevent F5 and Ctrl+R if form is modified
          if (formModified && ((e.key === 'F5') || (e.ctrlKey && e.key === 'r'))) {
            e.preventDefault();
            if (confirm('You have unsaved changes. Are you sure you want to refresh the page?')) {
              window.location.reload();
            }
          }
        });

        // Prevent accidental back button if form is modified
        window.addEventListener('popstate', function(e) {
          if (formModified) {
            if (!confirm('You have unsaved changes. Are you sure you want to go back?')) {
              window.history.pushState(null, null, window.location.href);
            }
          }
        });

        // Push initial state for back button protection
        window.history.pushState(null, null, window.location.href);

        function markFormModified() {
          formModified = true;
        }

        function showMessage(message, type = 'info') {
          const messageDiv = document.getElementById('searchMessage');
          messageDiv.innerHTML = '<div class="alert alert-' + type + '">' + message + '</div>';
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
                showMessage('✅ Invoice ' + invoiceNo + ' loaded successfully! You can now edit and update it.', 'success');
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
          document.getElementById('mobileItemsContainer').innerHTML = '';
          itemCounter = 0;
          
          document.querySelector('input[name="billto"]').value = invoice.billTo;
          document.querySelector('input[name="invoice"]').value = invoice.invoiceNo;
          document.querySelector('input[name="date"]').value = new Date(invoice.date).toISOString().split('T')[0];
          document.querySelector('input[name="duedate"]').value = new Date(invoice.dueDate).toISOString().split('T')[0];
          
          invoice.items.forEach(item => {
            addItem();
            const lastDesktopRow = document.getElementById('itemsTableBody').lastElementChild;
            const lastMobileCard = document.getElementById('mobileItemsContainer').lastElementChild;
            
            // Populate desktop table
            if (lastDesktopRow) {
              const inputs = lastDesktopRow.querySelectorAll('input, select');
              inputs[0].value = item.name;
              inputs[1].value = item.qty;
              inputs[2].value = item.unit;
              inputs[3].value = item.rate;
              inputs[4].value = item.discount;
            }
            
            // Populate mobile card
            if (lastMobileCard) {
              const mobileInputs = lastMobileCard.querySelectorAll('input, select');
              mobileInputs[0].value = item.name;
              mobileInputs[1].value = item.qty;
              mobileInputs[2].value = item.unit;
              mobileInputs[3].value = item.rate;
              mobileInputs[4].value = item.discount;
            }
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
          document.getElementById('mobileItemsContainer').innerHTML = '';
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
          
          // Add to desktop table
          const tableBody = document.getElementById('itemsTableBody');
          const row = document.createElement('tr');
          
          row.innerHTML = 
            '<td style="text-align: center; font-weight: bold; background: #f8f9fa;">' + itemCounter + '</td>' +
            '<td><input name="name" placeholder="Enter item description" required /></td>' +
            '<td><input name="qty" type="number" step="0.01" placeholder="0" required /></td>' +
            '<td>' +
              '<select name="unit">' +
              '<option value="BDL">BDL - Bundle</option>' +
              '<option value="BOX">BOX - Box</option>' +
              '<option value="BTL">BTL - Bottle</option>' +
              '<option value="DOZ">DOZ - Dozen</option>' +
              '<option value="GM">GM - Gram</option>' +
              '<option value="KG">KG - Kilogram</option>' +
              '<option value="LTR">LTR - Litre</option>' +
              '<option value="ML">ML - Millilitre</option>' +
              '<option value="PCS">PCS - Pieces</option>' +
              '<option value="PKT">PKT - Packet</option>' +
              '<option value="TIN">TIN - Tin</option>' +
              '</select>' +
            '</td>' +
            '<td><input name="rate" type="number" step="0.01" placeholder="0.00" required /></td>' +
            '<td><input name="discount" type="text" placeholder="0 or 10%" /></td>' +
            '<td><div class="amount-display">0.00</div></td>' +
            '<td style="text-align: center;">' +
              '<button type="button" class="remove-btn" onclick="removeItem(this)">🗑️ Remove</button>' +
            '</td>';
          
          tableBody.appendChild(row);
          
          // Add to mobile container
          const mobileContainer = document.getElementById('mobileItemsContainer');
          const card = document.createElement('div');
          card.className = 'item-card';
          
          card.innerHTML = 
            '<div class="item-card-header">' +
              '<div class="item-number">' + itemCounter + '</div>' +
              '<button type="button" class="mobile-remove-btn" onclick="removeMobileItem(this)">🗑️ Remove</button>' +
            '</div>' +
            
            '<div class="item-field">' +
              '<label>Item/Service Description:</label>' +
              '<input name="name" placeholder="Enter item description" required />' +
            '</div>' +
            
            '<div class="item-field">' +
              '<label>Quantity:</label>' +
              '<input name="qty" type="number" step="0.01" placeholder="0" required />' +
            '</div>' +
            
            '<div class="item-field">' +
              '<label>Unit:</label>' +
              '<select name="unit">' +
                '<option value="BDL">BDL - Bundle</option>' +
                '<option value="BOX">BOX - Box</option>' +
                '<option value="BTL">BTL - Bottle</option>' +
                '<option value="DOZ">DOZ - Dozen</option>' +
                '<option value="GM">GM - Gram</option>' +
                '<option value="KG">KG - Kilogram</option>' +
                '<option value="LTR">LTR - Litre</option>' +
                '<option value="ML">ML - Millilitre</option>' +
                '<option value="PCS">PCS - Pieces</option>' +
                '<option value="PKT">PKT - Packet</option>' +
                '<option value="TIN">TIN - Tin</option>' +
              '</select>' +
            '</div>' +
            
            '<div class="item-field">' +
              '<label>Rate:</label>' +
              '<input name="rate" type="number" step="0.01" placeholder="0.00" required />' +
            '</div>' +
            
            '<div class="item-field">' +
              '<label>Discount:</label>' +
              '<input name="discount" type="text" placeholder="0 or 10%" />' +
            '</div>' +
            
            '<div class="mobile-amount-display">Amount: ₹0.00</div>';
          
          mobileContainer.appendChild(card);
          
          // Add event listeners to both desktop and mobile inputs
          row.querySelectorAll("input, select").forEach(input => {
            input.addEventListener("input", updateTotals);
            input.addEventListener("input", markFormModified);
            input.addEventListener("input", syncInputs);
          });
          
          card.querySelectorAll("input, select").forEach(input => {
            input.addEventListener("input", updateTotals);
            input.addEventListener("input", markFormModified);
            input.addEventListener("input", syncInputs);
          });
          
          updateTotals();
          markFormModified();
        }

        function syncInputs() {
          // Sync values between desktop table and mobile cards
          const desktopRows = document.querySelectorAll("#itemsTableBody tr");
          const mobileCards = document.querySelectorAll(".item-card");
          
          desktopRows.forEach((row, index) => {
            const card = mobileCards[index];
            if (card) {
              const rowInputs = row.querySelectorAll("input, select");
              const cardInputs = card.querySelectorAll("input, select");
              
              for (let i = 0; i < rowInputs.length && i < cardInputs.length; i++) {
                if (event.target === rowInputs[i]) {
                  cardInputs[i].value = rowInputs[i].value;
                } else if (event.target === cardInputs[i]) {
                  rowInputs[i].value = cardInputs[i].value;
                }
              }
            }
          });
        }

        function removeItem(btn) {
          if (document.getElementById('itemsTableBody').children.length <= 1) {
            alert('At least one item is required');
            return;
          }
          
          const row = btn.closest('tr');
          const rowIndex = Array.from(row.parentNode.children).indexOf(row);
          
          // Remove from desktop table
          row.remove();
          
          // Remove corresponding mobile card
          const mobileCards = document.querySelectorAll('.item-card');
          if (mobileCards[rowIndex]) {
            mobileCards[rowIndex].remove();
          }
          
          renumberItems();
          updateTotals();
          markFormModified();
        }

        function removeMobileItem(btn) {
          if (document.querySelectorAll('.item-card').length <= 1) {
            alert('At least one item is required');
            return;
          }
          
          const card = btn.closest('.item-card');
          const cardIndex = Array.from(card.parentNode.children).indexOf(card);
          
          // Remove from mobile cards
          card.remove();
          
          // Remove corresponding desktop row
          const desktopRows = document.querySelectorAll('#itemsTableBody tr');
          if (desktopRows[cardIndex]) {
            desktopRows[cardIndex].remove();
          }
          
          renumberItems();
          updateTotals();
          markFormModified();
        }

        function renumberItems() {
          // Renumber desktop table rows
          const rows = document.querySelectorAll('#itemsTableBody tr');
          rows.forEach((row, index) => {
            row.cells[0].textContent = index + 1;
          });
          
          // Renumber mobile cards
          const cards = document.querySelectorAll('.item-card');
          cards.forEach((card, index) => {
            const numberElement = card.querySelector('.item-number');
            if (numberElement) {
              numberElement.textContent = index + 1;
            }
          });
          
          itemCounter = rows.length;
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
            return discount;
          }
        }

        function updateTotals() {
          let total = 0;
          
          // Update desktop table amounts
          document.querySelectorAll("#itemsTableBody tr").forEach((row, index) => {
            const inputs = row.querySelectorAll("input, select");
            const qty = parseFloat(inputs[1].value) || 0;
            const rate = parseFloat(inputs[3].value) || 0;
            const discount = inputs[4].value || '0';
            
            const grossAmount = qty * rate;
            const discountAmount = calculateDiscount(grossAmount, discount);
            const netAmount = grossAmount - discountAmount;
            
            const amountDisplay = row.querySelector('.amount-display');
            amountDisplay.textContent = netAmount.toFixed(2);
            
            // Update corresponding mobile card amount
            const mobileCards = document.querySelectorAll('.item-card');
            if (mobileCards[index]) {
              const mobileAmountDisplay = mobileCards[index].querySelector('.mobile-amount-display');
              if (mobileAmountDisplay) {
                mobileAmountDisplay.textContent = 'Amount: ₹' + netAmount.toFixed(2);
              }
            }
            
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

          // Use desktop table data for form submission
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
                showMessage('✅ Invoice ' + data.invoice + ' updated and downloaded successfully!', 'success');
              } else {
                showMessage('✅ Invoice ' + data.invoice + ' saved and downloaded successfully!', 'success');
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

// Helper function to calculate text height for PDF
function calculateTextHeight(doc, text, options) {
  const lines = doc.heightOfString(text, options);
  return lines;
}

// Helper function to wrap text and get lines
function wrapText(doc, text, width) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';
  
  for (let word of words) {
    const testLine = currentLine + (currentLine ? ' ' : '') + word;
    const testWidth = doc.widthOfString(testLine);
    
    if (testWidth <= width) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        // Word is too long, break it
        lines.push(word);
      }
    }
  }
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  return lines;
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

    // Generate Clean, Professional PDF with PDFKit (Updated with fixes)
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

    // CLEAN HEADER SECTION - Centered
    drawBox(margin, currentY, contentWidth, 35, '#f5f5f5');
    doc.fontSize(18).font('Helvetica-Bold');
    doc.text('BILL OF SUPPLY', margin, currentY + 10, {
      width: contentWidth,
      align: 'center'
    });

    currentY += 35;

    // Document type indicator - RIGHT ALIGNED and HIGHLIGHTED IN GRAY
    const recipientBoxWidth = 180;
    const recipientBoxX = margin + contentWidth - recipientBoxWidth;
    drawBox(recipientBoxX, currentY, recipientBoxWidth, 20, '#e9ecef'); // Gray background
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('ORIGINAL FOR RECIPIENT', recipientBoxX + 5, currentY + 6, {
      width: recipientBoxWidth - 10,
      align: 'center'
    });

    currentY += 30;

    // BUSINESS INFORMATION SECTION - Centered
    drawBox(margin, currentY, contentWidth, 25, '#f8f9fa');
    doc.fontSize(16).font('Helvetica-Bold');
    doc.text(BILL_NAME, margin, currentY + 6, {
      width: contentWidth,
      align: 'center'
    });

    currentY += 25;

    // Business details - Centered
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

    // INVOICE DETAILS SECTION - Properly aligned with table
    const detailsRowHeight = 25;
    
    // Calculate proper alignment with the table that comes later
    const tableColumns = [
      { width: 40 }, { width: 200 }, { width: 50 }, { width: 50 }, { width: 70 }, { width: 105 }
    ];
    const totalTableWidth = tableColumns.reduce((sum, col) => sum + col.width, 0);
    
    // Make BILL TO section extend to align with table properly
    const billToWidth = tableColumns[0].width + tableColumns[1].width + tableColumns[2].width; // S.No + Item + Qty columns
    const metaStartX = margin + billToWidth + 10; // Small gap
    const metaWidth = totalTableWidth - billToWidth - 10; // Remaining width
    const metaColWidth = metaWidth / 3;

    // Bill To section (aligned with first 3 table columns)
    drawBox(margin, currentY, billToWidth, detailsRowHeight, '#e9ecef');
    doc.fontSize(11).font('Helvetica-Bold');
    doc.text('BILL TO', margin + 5, currentY + 8);

    // Invoice meta info (aligned with last 3 table columns)
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
    
    drawBox(margin, currentY, billToWidth, customerDetailsHeight);

    // Customer info
    doc.fontSize(10).font('Helvetica');
    const billToLines = billto.split('\n');
    let customerY = currentY + 8;
    billToLines.forEach((line, index) => {
      if (index < 3) { // Limit to 3 lines
        doc.text(line.substring(0, 50), margin + 8, customerY + (index * 12));
      }
    });

    // Invoice values - properly aligned
    drawBox(metaStartX, currentY, metaColWidth, customerDetailsHeight);
    doc.fontSize(10).font('Helvetica');
    doc.text(invoice, metaStartX + 5, currentY + 20);

    drawBox(metaStartX + metaColWidth, currentY, metaColWidth, customerDetailsHeight);
    doc.text(new Date(date).toLocaleDateString('en-GB'), metaStartX + metaColWidth + 5, currentY + 20);

    drawBox(metaStartX + (metaColWidth * 2), currentY, metaColWidth, customerDetailsHeight);
    doc.text(new Date(duedate).toLocaleDateString('en-GB'), metaStartX + (metaColWidth * 2) + 5, currentY + 20);

    currentY += customerDetailsHeight + 15;

    // ENHANCED ITEMS TABLE - With dynamic row heights for long product names
    const tableStartY = currentY;
    const baseRowHeight = 25;
    const headerRowHeight = 30;

    // Use the same table column definitions for consistency
    const itemTableColumns = [
      { header: 'S.No', width: 40, align: 'center' },
      { header: 'Item Description', width: 200, align: 'left' },
      { header: 'Qty', width: 50, align: 'center' },
      { header: 'Unit', width: 50, align: 'center' },
      { header: 'Rate', width: 70, align: 'center' },
      { header: 'Amount', width: 105, align: 'center' }
    ];

    let tableX = margin;

    // Table headers
    itemTableColumns.forEach(col => {
      drawBox(tableX, currentY, col.width, headerRowHeight, '#e9ecef');
      
      doc.fontSize(10).font('Helvetica-Bold');
      const textY = currentY + 10;
      doc.text(col.header, tableX + 2, textY, { width: col.width - 4, align: 'center' });
      
      tableX += col.width;
    });

    currentY += headerRowHeight;

    // Table data rows - with DYNAMIC HEIGHT for long product names
    items.forEach((item, index) => {
      tableX = margin;
      
      // Calculate required height for the item description
      doc.fontSize(9).font('Helvetica');
      const descriptionWidth = itemTableColumns[1].width - 10; // Item description column width minus padding
      const wrappedLines = wrapText(doc, item.name, descriptionWidth);
      const requiredHeight = Math.max(baseRowHeight, wrappedLines.length * 12 + 10);
      
      const rowData = [
        (index + 1).toString(),
        item.name, // Full name, no truncation
        parseFloat(item.qty).toFixed(2),
        item.unit,
        parseFloat(item.rate).toFixed(2),
        parseFloat(item.amount).toFixed(2)
      ];

      itemTableColumns.forEach((col, colIndex) => {
        drawBox(tableX, currentY, col.width, requiredHeight);
        
        doc.fontSize(9).font('Helvetica');
        const textY = currentY + 8;
        
        if (colIndex === 1) {
          // Handle multi-line item description with proper wrapping
          wrappedLines.forEach((line, lineIndex) => {
            doc.text(line, tableX + 5, textY + (lineIndex * 12), { 
              width: col.width - 10, 
              align: 'left' 
            });
          });
        } else {
          // Center align all other columns - vertically centered
          const verticalCenter = textY + (requiredHeight - baseRowHeight) / 2;
          doc.text(rowData[colIndex], tableX + 2, verticalCenter, { 
            width: col.width - 4, 
            align: 'center' 
          });
        }
        
        tableX += col.width;
      });

      currentY += requiredHeight;
    });

    // Add empty rows for clean appearance if needed
    const minRows = 8;
    const emptyRowsNeeded = Math.max(0, minRows - items.length);
    
    for (let i = 0; i < emptyRowsNeeded; i++) {
      tableX = margin;
      itemTableColumns.forEach(col => {
        drawBox(tableX, currentY, col.width, baseRowHeight);
        tableX += col.width;
      });
      currentY += baseRowHeight;
    }

    // TOTAL SECTION - Fixed to align properly with table
    const totalRowHeight = 28;
    
    // Total row - properly aligned with table columns
    tableX = margin;
    const totalLabelWidth = itemTableColumns.slice(0, 4).reduce((sum, col) => sum + col.width, 0);
    
    drawBox(tableX, currentY, totalLabelWidth, totalRowHeight, '#f0f0f0');
    doc.fontSize(12).font('Helvetica-Bold');
    doc.text('TOTAL AMOUNT', tableX + 5, currentY + 8, { width: totalLabelWidth - 10, align: 'center' });

    tableX += totalLabelWidth;

    // Rate column with dashes
    drawBox(tableX, currentY, itemTableColumns[4].width, totalRowHeight);
    doc.fontSize(11).font('Helvetica-Bold');
    doc.text('---', tableX + 2, currentY + 8, { width: itemTableColumns[4].width - 4, align: 'center' });

    tableX += itemTableColumns[4].width;

    // Amount column with total
    drawBox(tableX, currentY, itemTableColumns[5].width, totalRowHeight, '#f8f9fa');
    doc.fontSize(12).font('Helvetica-Bold');
    doc.text(parseFloat(total).toFixed(2), tableX + 2, currentY + 8, { width: itemTableColumns[5].width - 4, align: 'center' });

    currentY += totalRowHeight + 20;

    // AMOUNT IN WORDS SECTION - Centered title
    drawBox(margin, currentY, contentWidth, 25, '#f5f5f5');
    doc.fontSize(11).font('Helvetica-Bold');
    doc.text('Amount in Words', margin + 5, currentY + 8, { width: contentWidth - 10, align: 'center' });

    currentY += 25;

    const totalInWords = numberToWords(Math.floor(parseFloat(total))).trim() + " Rupees Only";
    drawBox(margin, currentY, contentWidth, 30);
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text(totalInWords, margin + 10, currentY + 10);

    currentY += 40;

    // TERMS AND CONDITIONS SECTION - Centered title
    drawBox(margin, currentY, contentWidth, 25, '#f5f5f5');
    doc.fontSize(12).font('Helvetica-Bold');
    doc.text('Terms and Conditions', margin + 5, currentY + 8, { width: contentWidth - 10, align: 'center' });

    currentY += 25;

    const termsHeight = 50;
    drawBox(margin, currentY, contentWidth, termsHeight);

    doc.fontSize(9).font('Helvetica');
    doc.text('1. Goods once sold will not be taken back or exchanged', margin + 10, currentY + 8);
    doc.text(`2. All disputes are subject to ${BILL_CITY} jurisdiction only`, margin + 10, currentY + 22);
    doc.text('3. Payment terms: As per agreement', margin + 10, currentY + 36);

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
