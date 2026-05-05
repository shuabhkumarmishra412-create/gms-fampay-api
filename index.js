const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.static('public'));
app.use(express.json());

let users = {}; // apiKey -> user data

// Create API Key
app.post('/create-api', (req, res) => {
  const { gmail, appPass, upi } = req.body;
  if (!gmail || !appPass || !upi) {
    return res.json({ status: "error", message: "All fields required" });
  }

  const apiKey = "GMS" + Math.random().toString(36).substring(2, 15).toUpperCase();
  
  users[apiKey] = { gmail, appPass, upi, orders: {} };

  res.json({ 
    status: "success", 
    apiKey,
    message: "API Created Successfully"
  });
});

// Generate QR
app.get('/api/qr', (req, res) => {
  const apiKey = req.query.api;
  const amount = parseInt(req.query.amount) || 10;

  if (!users[apiKey]) {
    return res.json({ status: "error", message: "Invalid API Key" });
  }

  const orderId = "FAMPAY" + Date.now();
  
  users[apiKey].orders[orderId] = { status: "pending", amount };

  const response = {
    status: "success",
    data: {
      order_id: orderId,
      qr_url: `https://api.gms.site/qr/${orderId}.png`,
      upi_id: users[apiKey].upi,
      amount: amount,
      created_at_ist: new Date().toLocaleString('en-IN'),
      expires_at_ist: new Date(Date.now() + 5*60000).toLocaleString('en-IN')
    }
  };
  res.json(response);
});

// Real Verify with IMAP
app.get('/api/verify', async (req, res) => {
  const apiKey = req.query.api_key;
  const orderId = req.query.order_id;

  if (!users[apiKey]) {
    return res.json({ status: "error", message: "Invalid API Key" });
  }

  const user = users[apiKey];

  try {
    const result = await checkPaymentInEmail(user.gmail, user.appPass, orderId);
    
    if (result.status === "success") {
      res.json({
        status: "success",
        data: {
          order_id: orderId,
          transaction_id: result.transaction_id || "FMPIB" + Date.now(),
          amount: user.orders[orderId]?.amount || 10,
          utr: result.utr,
          sender_name: result.sender || "Unknown",
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
    res.json({ status: "error", message: "Verification failed" });
  }
});

// IMAP Function
async function checkPaymentInEmail(email, appPassword, orderId) {
  const imap = require('imap');
  const { simpleParser } = require('mailparser');
  const Imap = imap;

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
      client.openBox('INBOX', true, (err, box) => {
        if (err) return resolve({ status: "pending" });

        const searchCriteria = ['UNSEEN', ['TEXT', orderId]];
        
        client.search(searchCriteria, (err, results) => {
          if (err || !results || results.length === 0) {
            client.end();
            return resolve({ status: "pending" });
          }

          const fetch = client.fetch(results, { bodies: '' });
          fetch.on('message', (msg) => {
            msg.on('body', (stream) => {
              simpleParser(stream, (err, parsed) => {
                if (parsed.text && parsed.text.includes(orderId)) {
                  // Extract UTR / details (basic)
                  const utrMatch = parsed.text.match(/UTR[:\s]*([0-9]+)/i) || 
                                  parsed.text.match(/Ref\.?\s*No[:\s]*([0-9]+)/i);
                  resolve({
                    status: "success",
                    utr: utrMatch ? utrMatch[1] : "Not Found",
                    sender: parsed.from?.text || "Unknown",
                    transaction_id: "FMPIB" + Date.now()
                  });
                }
              });
            });
          });
          fetch.once('end', () => client.end());
        });
      });
    });

    client.once('error', () => resolve({ status: "pending" }));
    client.connect();
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`GMS FamPay API running on port ${PORT}`);
});
