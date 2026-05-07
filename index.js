const express = require('express');
const cors = require('cors');
const fs = require('fs');
const app = express();

app.use(cors());
app.use(express.static('public'));
app.use(express.json());

const DATA_FILE = 'users.json';
let users = {};

// Load users from file
if (fs.existsSync(DATA_FILE)) {
  users = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

// Save users to file
function saveUsers() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2));
}

// ====================== CREATE API KEY ======================
app.post('/create-api', (req, res) => {
  const { gmail, appPass, upi } = req.body;

  if (!gmail || !appPass || !upi) {
    return res.json({ status: "error", message: "All fields are required" });
  }

  // Check for duplicate Gmail or UPI
  for (let key in users) {
    if (users[key].gmail.toLowerCase() === gmail.toLowerCase()) {
      return res.json({ status: "error", message: "This Gmail is already registered!" });
    }
    if (users[key].upi.toLowerCase() === upi.toLowerCase()) {
      return res.json({ status: "error", message: "This UPI ID is already registered!" });
    }
  }

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
    message: "API Created Successfully! One Email & One UPI only."
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

// ====================== VERIFY PAYMENT (Real IMAP) ======================
app.get('/api/verify', async (req, res) => {
  const apiKey = req.query.api_key;
  const orderId = req.query.order_id;

  if (!users[apiKey]) {
    return res.json({ status: "error", message: "Invalid API Key" });
  }

  try {
    const result = await checkPaymentInEmail(users[apiKey].gmail, users[apiKey].appPass, orderId);

    if (result.status === "success") {
      res.json({
        status: "success",
        data: {
          order_id: orderId,
          transaction_id: result.transaction_id,
          amount: 10,
          utr: result.utr,
          sender_name: result.sender,
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
  } catch (err) {
    console.error(err);
    res.json({ 
      status: "error", 
      message: "Verification failed. Please try again." 
    });
  }
});

// ====================== IMAP SCANNING FUNCTION ======================
async function checkPaymentInEmail(email, appPassword, orderId) {
  const Imap = require('imap');
  const { simpleParser } = require('mailparser');

  return new Promise((resolve) => {
    const client = new Imap({
      user: email,
      password: appPassword,
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      tlsOptions: { servername: 'imap.gmail.com' }
    });

    client.once('ready', () => {
      client.openBox('INBOX', true, (err) => {
        if (err) return resolve({ status: "pending" });

        const searchCriteria = ['UNSEEN', ['TEXT', orderId]];

        client.search(searchCriteria, (err, results) => {
          if (err || !results || results.length === 0) {
            client.end();
            return resolve({ status: "pending" });
          }

          const fetch = client.fetch(results, { bodies: '' });
          let found = false;

          fetch.on('message', (msg) => {
            msg.on('body', (stream) => {
              simpleParser(stream, (err, parsed) => {
                if (parsed.text && parsed.text.includes(orderId)) {
                  found = true;
                  const utrMatch = parsed.text.match(/UTR[:\s]*([0-9]+)/i) || 
                                  parsed.text.match(/Ref\.?\s*No[:\s]*([0-9]+)/i);

                  resolve({
                    status: "success",
                    utr: utrMatch ? utrMatch[1] : "Not Found",
                    sender: parsed.from?.text || "Unknown Sender",
                    transaction_id: "FMPIB" + Date.now()
                  });
                }
              });
            });
          });

          fetch.once('end', () => {
            if (!found) resolve({ status: "pending" });
            client.end();
          });
        });
      });
    });

    client.once('error', () => resolve({ status: "pending" }));
    client.once('end', () => {});
    client.connect();
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 GMS FamPay API running on port ${PORT}`);
});
