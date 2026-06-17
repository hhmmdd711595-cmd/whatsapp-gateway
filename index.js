const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const pino = require('pino');
const app = express();

app.use(express.json());

const CLOUDFLARE_WORKER_URL = "https://pulseops-ai.hhmmdd711595.workers.dev/api/message/incoming";

let sock = null;
let latestQr = null;

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_ultimate_v2');
    
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['Ubuntu', 'Chrome', '20.0.0'],
        markOnlineOnConnect: true
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            latestQr = qr;
            console.log("New QR Code generated");
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut);
            console.log('Reconnecting...', shouldReconnect);
            if (shouldReconnect) setTimeout(connectToWhatsApp, 5000);
        } else if (connection === 'open') {
            console.log('Connected successfully!');
            latestQr = null;
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        if (m.type !== 'notify') return;
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const fromNumber = msg.key.remoteJid.split('@')[0];
        const toNumber = sock.user.id.split(':')[0]; 
        const textMessage = msg.message.conversation || msg.message.extendedTextMessage?.text;

        if (!textMessage) return;

        try {
            const response = await fetch(CLOUDFLARE_WORKER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    from_number: fromNumber,
                    to_number: toNumber,
                    message_text: textMessage
                })
            });
        } catch (error) {
            console.error('Error:', error.message);
        }
    });
}

app.get('/api/get-pairing-code', async (req, res) => {
    const phoneNumber = req.query.phone || "967713466475"; 
    try {
        if (!sock) return res.status(500).json({ error: 'Server initializing' });
        let code = await sock.requestPairingCode(phoneNumber);
        return res.json({ success: true, pairing_code: code });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.get('/api/get-qr', (req, res) => {
    if (!latestQr) return res.status(404).json({ error: "No QR available, please wait 30 seconds and refresh" });
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(latestQr)}`;
    return res.send(`<img src="${qrImageUrl}" />`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
    connectToWhatsApp();
});
