const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');
const imap = require('imap');
const { simpleParser } = require('mailparser');

const app = express();

app.use(cors());
app.use(express.json());

// In-memory database (Resets if Render restarts)
let users = {}; 

/**
 * 1. ROOT ROUTE 
 * Prevents "Cannot GET /" and shows API status
 */
app.get('/', (req, res) => {
    res.json({
        status: "online",
        message: "GMS FamPay API is running",
        endpoints: {
            qr: "/api/qr?api=YOUR_KEY&amount=10",
            verify: "/api/verify?api_key=YOUR_KEY&order_id=ORDER_ID"
        },
        dev: "@GMS_NETWORK"
    });
});

/**
 * 2. CREATE API KEY
 */
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

/**
 * 3. GENERATE QR CODE
 */
app.get('/api/qr', async (req, res) => {
    const apiKey = req.query.api;
    const amount = parseInt(req.query.amount) || 10;

    if (!users[apiKey]) {
        return res.json({ status: "error", message: "Invalid API Key" });
    }

    const orderId = "FAMPAY" + Date.now();
    users[apiKey].orders[orderId] = { status: "pending", amount };

    const upiString = `upi://pay?pa=${users[apiKey].upi}&am=${amount}&tr=${orderId}`;

    try {
        const qrDataUrl = await QRCode.toDataURL(upiString);

        res.json({
            status: "success",
            data: {
                order_id: orderId,
                qr_url: qrDataUrl, 
                upi_id: users[apiKey].upi,
                amount: amount,
                created_at_ist: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
                expires_at_ist: new Date(Date.now() + 5*60000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
            },
            dev: "@GMS_NETWORK"
        });
    } catch (err) {
        res.json({ status: "error", message: "QR Generation Failed" });
    }
});

/**
 * 4. VERIFY PAYMENT
 */
app.get('/api/verify', async (req, res) => {
    const apiKey = req.query.api_key;
    const orderId = req.query.order_id;

    if (!users[apiKey] || !orderId) {
        return res.json({ status: "error", message: "Invalid API Key or Order ID" });
    }

    const user = users[apiKey];

    try {
        const result = await checkPaymentInEmail(user.gmail, user.appPass, orderId);
        
        if (result.status === "success") {
            res.json({
                status: "success",
                data: {
                    order_id: orderId,
                    transaction_id: result.transaction_id,
                    amount: user.orders[orderId]?.amount || "Verified",
                    utr: result.utr,
                    sender_name: result.sender,
                    payment_time_ist: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
                },
                dev: "@GMS_NETWORK"
            });
        } else {
            res.json({
                status: "pending",
                message: "Payment not found yet. Check if the amount matches and you used the correct QR.",
                order_id: orderId,
                dev: "@GMS_NETWORK"
            });
        }
    } catch (err) {
        res.json({ status: "error", message: "Verification system error" });
    }
});

/**
 * IMAP ENGINE - Optimized for Render
 */
async function checkPaymentInEmail(email, appPassword, orderId) {
    return new Promise((resolve) => {
        const client = new imap({
            user: email,
            password: appPassword,
            host: 'imap.gmail.com',
            port: 993,
            tls: true,
            tlsOptions: { servername: 'imap.gmail.com' }
        });

        // Set a timeout to prevent the function from hanging
        const timeout = setTimeout(() => {
            client.end();
            resolve({ status: "pending" });
        }, 10000);

        client.once('ready', () => {
            client.openBox('INBOX', true, (err) => {
                if (err) {
                    clearTimeout(timeout);
                    client.end();
                    return resolve({ status: "pending" });
                }

                // Look for unseen emails containing the specific order ID
                client.search(['UNSEEN', ['TEXT', orderId]], (err, results) => {
                    if (err || !results || results.length === 0) {
                        clearTimeout(timeout);
                        client.end();
                        return resolve({ status: "pending" });
                    }

                    const f = client.fetch(results, { bodies: '' });
                    f.on('message', (msg) => {
                        msg.on('body', (stream) => {
                            simpleParser(stream, (err, parsed) => {
                                if (!err && parsed.text && parsed.text.includes(orderId)) {
                                    const utrMatch = parsed.text.match(/UTR[:\s]*([0-9]+)/i) || 
                                                     parsed.text.match(/Ref\.?\s*No[:\s]*([0-9]+)/i);
                                    
                                    clearTimeout(timeout);
                                    resolve({
                                        status: "success",
                                        utr: utrMatch ? utrMatch[1] : "N/A",
                                        sender: parsed.from?.value[0]?.name || "FamPay User",
                                        transaction_id: "GMS" + Date.now()
                                    });
                                }
                            });
                        });
                    });
                    f.once('end', () => client.end());
                });
            });
        });

        client.once('error', (err) => {
            clearTimeout(timeout);
            resolve({ status: "pending" });
        });
        
        client.connect();
    });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`GMS FamPay API running on port ${PORT}`);
});
