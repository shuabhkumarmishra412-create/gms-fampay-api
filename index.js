const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.static('public'));
app.use(express.json());

let users = {}; // In-memory DB (apiKey -> user data)

// Serve index.html
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Create API Key
app.post('/create-api', (req, res) => {
  const { gmail, appPass, upi } = req.body;
  if (!gmail || !appPass || !upi) {
    return res.json({ status: "error", message: "All fields required" });
  }

  const apiKey = "GMS" + Math.random().toString(36).substring(2, 15).toUpperCase();
  
  users[apiKey] = { gmail, appPass, upi };

  res.json({ 
    status: "success", 
    apiKey,
    message: "API Created Successfully"
  });
});

// Generate QR
app.get('/api/qr', (req, res) => {
  const apiKey = req.query.api;
  const amount = req.query.amount || 10;

  if (!users[apiKey]) {
    return res.json({ status: "error", message: "Invalid API Key" });
  }

  const orderId = "FAMPAY" + Date.now();
  const response = {
    status: "success",
    data: {
      order_id: orderId,
      qr_url: `https://api.gms.site/qr/${orderId}.png`,
      upi_id: users[apiKey].upi,
      amount: Number(amount),
      created_at_ist: new Date().toLocaleString('en-IN'),
      expires_at_ist: new Date(Date.now() + 5*60000).toLocaleString('en-IN')
    }
  };
  res.json(response);
});

// Verify Payment (Simulated)
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
  console.log(`GMS FamPay API running on http://localhost:${PORT}`);
});
