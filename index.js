const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode'); // Added for Base64 QR Generation
const app = express();

app.use(cors());
app.use(express.json());

// In-memory database (Note: Data clears if Render puts the app to sleep)
let users = {}; 

// 1. Create API Key
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

// 2. Generate QR Code (Updated with Render Link and Base64)
app.get('/api/qr', async (req, res) => {
    const apiKey = req.query.api;
    const amount = parseInt(req.query.amount) || 10;

    if (!users[apiKey]) {
        return res.json({ status: "error", message: "Invalid API Key" });
    }

    const orderId = "FAMPAY" + Date.now();
    users[apiKey].orders[orderId] = { status: "pending", amount };

    // Create the UPI string for the QR code
    const upiString = `upi://pay?pa=${users[apiKey].upi}&am=${amount}&tr=${orderId}`;

    try {
        // Generate QR as a Base64 Data URL (Instant loading, no file storage needed)
        const qrDataUrl = await QRCode.toDataURL(upiString);

        res.json({
            status: "success",
            data: {
                order_id: orderId,
                qr_url: qrDataUrl, // This sends the image data directly
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

// 3. Verify Payment Status
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
                    transaction_id: result.transaction_id,
                    amount: user.orders[orderId]?.amount || 10,
                    utr: result.utr,
                    sender_name: result.sender,
                    payment_time_ist: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
                },
                dev: "@GMS_NETWORK"
            });
        } else {
            res.json({
                status: "pending",
                message: "Payment verification in progress",
                order_id: orderId,
                dev: "@GMS_NETWORK"
            });
        }
    } catch (err) {
        res.json({ status: "error", message: "Verification failed" });
    }
});

// IMAP Verification Engine
async function checkPaymentInEmail(email, appPassword, orderId) {
    const imap = require('imap');
    const { simpleParser } = require('mailparser');

    return new Promise((resolve) => {
        const client = new imap({
            user: email,
            password: appPassword,
            host: 'imap.gmail.com',
            port: 993,
            tls: true,
            tlsOptions: { servername: 'imap.gmail.com' }
        });

        client.once('ready', () => {
            client.openBox('INBOX', true, (err, box) => {
                if (err) {
                    client.end();
                    return resolve({ status: "pending" });
                }

                // Search for unseen emails containing the OrderID
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
                                    const utrMatch = parsed.text.match(/UTR[:\s]*([0-9]+)/i) || 
                                                     parsed.text.match(/Ref\.?\s*No[:\s]*([0-9]+)/i);
                                    
                                    resolve({
                                        status: "success",
                                        utr: utrMatch ? utrMatch[1] : "N/A",
                                        sender: parsed.from?.value[0]?.name || "Customer",
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

        client.once('error', (err) => {
            console.log("IMAP Error:", err);
            resolve({ status: "pending" });
        });
        client.connect();
    });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`GMS FamPay API live on https://gms-fampay-api.onrender.com`);
});
