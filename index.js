const express = require('express');
const cors = require('cors');
const fs = require('fs');
const app = express();

app.use(cors());
app.use(express.static('public'));
app.use(express.json());

const DATA_FILE = 'users.json';
let users = {};

// Load users
if (fs.existsSync(DATA_FILE)) {
  users = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function saveUsers() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2));
}

// ====================== CREATE API ======================
app.post('/create-api', (req, res) => {
  const { gmail, appPass, upi } = req.body;
  if (!gmail || !appPass || !upi) {
    return res.json({ status: "error", message: "All fields are required" });
  }

  // Duplicate check REMOVED as per your request

  const apiKey = "GMS" + Math.random().toString(36).substring(2, 15).toUpperCase();
  
  users[apiKey] = { 
    gmail: gmail.toLowerCase(), 
    appPass, 
    upi: upi.toLowerCase(),
    createdAt: new Date().toISOString()
  };

  saveUsers();

  res.json({ 
    status: "success", 
    apiKey,
    message: "API Created Successfully!"
  });
});

// ====================== GENERATE QR ======================
app.get('/api/qr', (req, res) => {
  const apiKey = req.query.api;
  const amount = parseInt(req.query.amount) || 10;

  if (!users[apiKey]) {
    return res.json({ status: "error", message: "Invalid API Key" });
  }

  const orderId = "FAMPAY" + Date.now();
  const baseUrl = `${req.protocol}://${req.get('host')}`;

  const response = {
    status: "success",
    data: {
      order_id: orderId,
      qr_url: `${baseUrl}/qr/${orderId}.png`,
      upi_id: users[apiKey].upi,
      amount: amount,
      created_at_ist: new Date().toLocaleString('en-IN'),
      expires_at_ist: new Date(Date.now() + 300000).toLocaleString('en-IN')
    }
  };
  res.json(response);
});

// ====================== QR IMAGE ======================
app.get('/qr/:orderId.png', (req, res) => {
  const orderId = req.params.orderId;
  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(`
    <svg width="300" height="320" xmlns="http://www.w3.org/2000/svg">
      <rect width="300" height="320" fill="#111"/>
      <text x="150" y="80" font-size="22" text-anchor="middle" fill="#0f0">🔥 GMS PAY</text>
      <rect x="40" y="110" width="220" height="220" fill="#fff"/>
      <text x="150" y="170" font-size="18" text-anchor="middle" fill="#000">SCAN TO PAY</text>
      <text x="150" y="200" font-size="14" text-anchor="middle" fill="#000">${orderId}</text>
      <text x="150" y="290" font-size="16" text-anchor="middle" fill="#0f0">Powered by GMS</text>
    </svg>
  `);
});

// ====================== VERIFY ======================
app.get('/api/verify', (req, res) => {
  const apiKey = req.query.api_key;
  const orderId = req.query.order_id;

  if (!users[apiKey]) {
    return res.json({ status: "error", message: "Invalid API Key" });
  }

  const isSuccess = Math.random() > 0.35;

  if (isSuccess) {
    res.json({
      status: "success",
      data: {
        order_id: orderId,
        transaction_id: "FMPIB" + Math.floor(Math.random()*1000000000),
        amount: 10,
        utr: "3" + Math.floor(Math.random()*10000000000),
        sender_name: "Test User",
        payment_time_ist: new Date().toLocaleString('en-IN')
      }
    });
  } else {
    res.json({
      status: "pending",
      message: "Payment verification in progress",
      order_id: orderId
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 GMS FamPay API running on port ${PORT}`);
});
