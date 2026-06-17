const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/ baileys');
const express = require('express');
const pino = require('pino');
const app = express();

app.use(express.json());

const CLOUDFLARE_WORKER_URL = " https://pulseops-ai. hhmmdd711595.workers.dev/api/ message/incoming ";

let sock = null;

دالة غير متزامنة connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_ info_baileys');
    
    sock = makeWASocket({
        المصادقة: الولاية،
        printQRInTerminal: false,
        logger: pino({ level: 'silent' })
    });

    sock.credsUpdate = saveCreds;
    sock.ev.on('creds.update', saveCreds);

    // إنشاء رمز الاقتران تلقائيًا في حالة البدء في العثور على أداة البحث
    إذا لم تكن بيانات اعتماد حالة المصادقة مسجلة (sock.authState.creds.registered ) {
        setTimeout(async () => {
            يحاول {
                let code = await sock.requestPairingCode(" 967713466475");
                console.log(`\n 🚀******* رمز الاقتران: ${code} ******* 🚀\n`);
            } catch (err) {
                console.log(' ❌خطأ في إنشاء رمز الاقتران:', err.message);
            }
        }, 5000); // انتظر 5 توقف بعد التأكد من جاهزية الاتصال
    }

    sock.ev.on('connection.update' , (update) => {
        const { connection, lastDisconnect } = update;
        إذا كانت حالة الاتصال مغلقة {
            const shouldReconnect = (lastDisconnect.error?.output? .statusCode !== DisconnectReason.loggedOut);
            console.log(' 🔄إعادة الاتصال...', shouldReconnect);
            إذا (يجب إعادة الاتصال) اتصل بـ WhatsApp();
        } else if (connection === 'open') {
            console.log(' ✅[تم بنجاح] تم الاتصال بـ WhatsApp!');
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        إذا كان نوع m لا يساوي 'notify'، فقم بالخروج.
        const msg = m.messages[0];
        إذا لم تكن الرسالة موجودة أو كان المفتاح موجودًا، فقم بالخروج.

        const fromNumber = msg.key.remoteJid.split('@')[ 0];
        const toNumber = sock.user.id.split(':')[0]; 
        const textMessage = msg.message.conversation || msg.message.extendedTextMessage ?.text;

        إذا لم تكن هناك رسالة نصية، فقم بالخروج.

        يحاول {
            const response = await fetch(CLOUDFLARE_WORKER_URL, {
                الطريقة: 'POST'
                headers: { 'Content-Type': 'application/json' },
                نص: JSON.stringify({
                    from_number: fromNumber,
                    to_number: toNumber,
                    نص الرسالة: رسالة نصية
                })
            });

            const result = await response.json();
            إذا كانت النتيجة ناجحة، وتم تحليلها، وتم الحصول على استجابة الذكاء الاصطناعي من النتيجة المُحللة،
                await sock.sendMessage(msg.key.remoteJid , { text: result.parsed.ai_response });
            }
        } catch (error) {
            console.error(' ❌خطأ:', error.message);
        }
    });
}

// تم البقاء على مسار الـ API كخيار مشترك
app.get('/api/get-pairing- code', async (req, res) => {
    const phoneNumber = req.query.phone || "967713466475"; 
    يحاول {
        إذا لم يكن هناك اتصال (!sock) فسيتم إرجاع res.status(500).json({ error: 'Server initializing' });
        let code = await sock.requestPairingCode( phoneNumber);
        return res.json({ success: true, pairing_code: code });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(` 🌐الخادم يعمل على المنفذ ${PORT}`);
    الاتصال بتطبيق واتساب();
});
