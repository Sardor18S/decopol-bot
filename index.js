/**
 * Decopol Davomat — Telegram bot (Node.js, Render.com uchun)
 *
 * Bu bot:
 * 1. Shaxsiy chatda: "Keldim"/"Ketdim"/"Erta ketish so'rovi" tugmalari,
 *    rasm qabul qilib Claude orqali vaqtni o'qiydi, Firebase'ga yozadi.
 * 2. Guruhda ("Keldi-Ketdi"): rasm tashlanganda, vaqtga qarab (06-12=Keldi,
 *    15dan keyin=Ketdi) avtomatik aniqlaydi, kim ekanini Telegram ID orqali
 *    topadi, Claude orqali vaqtni o'qiydi.
 * 3. Erta ketish so'rovi: Rahbarga yuboriladi, u Tasdiqlash/Rad etish qiladi.
 */

const express = require('express');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

// ───────────────────────────────────────────────
// SOZLAMALAR (Render.com Environment Variables orqali kiritiladi)
// ───────────────────────────────────────────────
const BOT_TOKEN = process.env.BOT_TOKEN || '8778444126:AAEezR6OLQkXuiT05B9zlD8HINJMY6ZBTQ4';
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || '';
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
const FB = process.env.FIREBASE_URL || 'https://decopol-s-default-rtdb.firebaseio.com';
const RAHBAR_CHAT_ID = process.env.RAHBAR_CHAT_ID || '7480007083';

const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const TG_FILE_API = `https://api.telegram.org/file/bot${BOT_TOKEN}`;

// ───────────────────────────────────────────────
// Yordamchi funksiyalar
// ───────────────────────────────────────────────
async function tgRequest(method, params = {}) {
  const res = await fetch(`${TG_API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

async function fbGet(path) {
  try {
    const res = await fetch(`${FB}${path}.json`);
    return await res.json();
  } catch (e) {
    return null;
  }
}

async function fbSet(path, data) {
  try {
    await fetch(`${FB}${path}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch (e) {}
}

async function fbPatch(path, data) {
  try {
    await fetch(`${FB}${path}.json`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch (e) {}
}

async function getAllPeople() {
  let people = await fbGet('/kpi/dc_tg_people');
  if (typeof people === 'string') {
    try {
      people = JSON.parse(people);
    } catch (e) {
      people = null;
    }
  }
  return Array.isArray(people) ? people : [];
}

async function findEmployeeByChatId(chatId) {
  const people = await getAllPeople();
  return people.find((p) => p.telegramId && String(p.telegramId) === String(chatId)) || null;
}

async function findEmployeeById(empId) {
  const people = await getAllPeople();
  return people.find((p) => p.id === empId) || null;
}

async function downloadTelegramFile(fileId) {
  const fileInfoRes = await tgRequest('getFile', { file_id: fileId });
  const filePath = fileInfoRes?.result?.file_path;
  if (!filePath) return null;
  const fileRes = await fetch(`${TG_FILE_API}/${filePath}`);
  const buffer = await fileRes.buffer();
  const ext = filePath.split('.').pop().toLowerCase();
  const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
  return { base64: buffer.toString('base64'), mime };
}

async function claudeReadTime(base64Image, mimeType) {
  if (!CLAUDE_API_KEY) return 'API_XATO: Claude API kalit sozlanmagan';
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 100,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Image } },
              {
                type: 'text',
                text: "Bu rasmda (Marka ilovasi yoki soat skrinshoti) ko'rsatilgan ANIQ VAQTNI top. Faqat vaqtni 24-soatlik formatda (HH:MM) qaytar, boshqa hech narsa yozma. Agar vaqtni topa olmasang, 'NOANIQ' deb yoz.",
              },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return `API_XATO(${res.status}): ${errData?.error?.message || 'noma\'lum'}`;
    }
    const data = await res.json();
    const textBlock = (data.content || []).find((b) => b.type === 'text');
    return (textBlock?.text || '').trim();
  } catch (e) {
    return `CURL_XATO: ${e.message}`;
  }
}

function sendActionMenu(chatId) {
  return tgRequest('sendMessage', {
    chat_id: chatId,
    text: 'Quyidagilardan birini tanlang:',
    reply_markup: JSON.stringify({
      inline_keyboard: [
        [{ text: '✅ Keldim', callback_data: 'act_keldi' }],
        [{ text: '🚪 Ketdim', callback_data: 'act_ketdi' }],
        [{ text: "⏰ Erta ketish so'rovi", callback_data: 'act_erta' }],
      ],
    }),
  });
}

function todayStr() {
  // Asia/Tashkent vaqt zonasi bo'yicha bugungi sana
  const now = new Date();
  const tashkent = new Date(now.getTime() + (5 * 60 + now.getTimezoneOffset()) * 60000);
  return tashkent.toISOString().slice(0, 10);
}

function tashkentHour() {
  const now = new Date();
  const tashkent = new Date(now.getTime() + (5 * 60 + now.getTimezoneOffset()) * 60000);
  return tashkent.getHours();
}

function tashkentMinute() {
  const now = new Date();
  const tashkent = new Date(now.getTime() + (5 * 60 + now.getTimezoneOffset()) * 60000);
  return tashkent.getMinutes();
}

function tashkentDayOfMonth() {
  const now = new Date();
  const tashkent = new Date(now.getTime() + (5 * 60 + now.getTimezoneOffset()) * 60000);
  return tashkent.getDate();
}

// ───────────────────────────────────────────────
// KUNLIK HISOBOT — Showroom, Call Centre, Marketing + AI xulosa
// ───────────────────────────────────────────────
const MKT_FB = 'https://marketing-dashboard-a028d-default-rtdb.firebaseio.com';
const HISOBOT_GROUP_ID = process.env.HISOBOT_GROUP_ID || '-5487994365';

async function fbGetRaw(baseUrl, path) {
  try {
    const res = await fetch(`${baseUrl}${path}.json`);
    return await res.json();
  } catch (e) {
    return null;
  }
}

function parseMaybeDoubleEncoded(data) {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch (e) {
      return null;
    }
  }
  return data;
}

async function buildShowroomSummary() {
  const trkRaw = parseMaybeDoubleEncoded(await fbGet('/kpi/dc_trk')) || {};
  const today = tashkentDayOfMonth();
  const r = trkRaw[today] || {};
  const nv = (v) => Number(v) || 0;
  const cols = { m: ['m0', 'm1', 'm2'], d: ['d0', 'd1', 'd2'], f: ['f0', 'f1', 'f2'], k: ['k0', 'k1', 'k2'] };
  const bcols = { m: ['mb0', 'mb1', 'mb2'], d: ['db0', 'db1', 'db2'], f: ['fb0', 'fb1', 'fb2'] };
  const names = { m: 'Muhammaddiyor', d: 'Diyorbek', f: 'Jahongir' };

  let totalLid = 0;
  let totalSot = 0;
  let totalSavdo = 0;
  const perEmployee = [];

  ['m', 'd', 'f'].forEach((k) => {
    const lid = nv(r[cols[k][0]]) + nv(r[bcols[k][0]]);
    const sot = nv(r[cols[k][1]]) + nv(r[bcols[k][1]]);
    const savdo = nv(r[cols[k][2]]) + nv(r[bcols[k][2]]);
    totalLid += lid;
    totalSot += sot;
    totalSavdo += savdo;
    perEmployee.push({ name: names[k], lid, sot, savdo });
  });
  // Kompaniya (k) - faqat jamoa umumiy hisobiga
  totalLid += nv(r.k0);
  totalSot += nv(r.k1);
  totalSavdo += nv(r.k2);

  const konv = totalLid > 0 ? Math.round((totalSot / totalLid) * 1000) / 10 : 0;
  return { totalLid, totalSot, totalSavdo, konv, perEmployee };
}

async function buildCallCentreSummary() {
  const cckTrkRaw = parseMaybeDoubleEncoded(await fbGet('/kpi/dc_cck_trk')) || {};
  const today = tashkentDayOfMonth();
  const r = cckTrkRaw[today] || {};
  const operators = ['lola', 'asadbek', 'shahina', 'shirina'];
  const names = { lola: 'Lola', asadbek: 'Asadbek', shahina: 'Shahina', shirina: 'Shirina' };

  let totalVisit = 0;
  const perOperator = [];
  operators.forEach((op) => {
    const visit = Number(r[op]?.visit) || 0;
    const sot = Number(r[op]?.sot) || 0;
    totalVisit += visit;
    perOperator.push({ name: names[op], visit, sot });
  });

  // Jami lid - amoCRM orqali kelishi kerak, lekin sodda hisobot uchun visit/konv taxminiy qoldiriladi
  return { totalVisit, perOperator };
}

async function buildMarketingSummary() {
  const entriesRaw = await fbGetRaw(MKT_FB, '/marketing_entries');
  const today = todayStr();
  let totalLeads = 0;
  let totalSpend = 0;
  if (entriesRaw && typeof entriesRaw === 'object') {
    Object.values(entriesRaw).forEach((e) => {
      if (e.date === today) {
        totalLeads += Number(e.leads) || 0;
        totalSpend += Number(e.spend) || 0;
      }
    });
  }
  const cpl = totalLeads > 0 ? totalSpend / totalLeads : 0;
  return { totalLeads, totalSpend, cpl };
}

async function getClaudeSummary(context) {
  if (!CLAUDE_API_KEY) return "AI Maslahatchi: Claude API kalit sozlanmagan.";
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 250,
        system:
          "Siz Decopol kompaniyasi uchun ishlaydigan AI Biznes Maslahatchisiz. Berilgan kunlik ko'rsatkichlarni tahlil qilib, 2-3 gapda QISQA xulosa va bir amaliy tavsiya bering. Faqat o'zbek tilida, professional ohangda javob bering.",
        messages: [{ role: 'user', content: context }],
      }),
    });
    if (!res.ok) return "AI Maslahatchi: hozircha xulosa berib bo'lmadi.";
    const data = await res.json();
    const textBlock = (data.content || []).find((b) => b.type === 'text');
    return (textBlock?.text || "AI Maslahatchi: javob bo'sh keldi.").trim();
  } catch (e) {
    return "AI Maslahatchi: ulanish xatosi.";
  }
}

function fmtMoney(n) {
  return Math.round(n).toLocaleString('en-US');
}

async function sendDailyReport() {
  try {
    const sr = await buildShowroomSummary();
    const cc = await buildCallCentreSummary();
    const mkt = await buildMarketingSummary();

    let text = `📊 <b>Decopol — Kunlik Hisobot</b>\n${new Date().toLocaleDateString('uz-UZ')}\n\n`;

    text += `🏢 <b>SHOWROOM</b>\n`;
    text += `Jami Sotuv: $${fmtMoney(sr.totalSavdo)}\n`;
    text += `Jami Lid: ${sr.totalLid}\n`;
    text += `Konversiya: ${sr.konv}%\n`;
    sr.perEmployee.forEach((e) => {
      text += `• ${e.name}: ${e.sot} sotuv, $${fmtMoney(e.savdo)}\n`;
    });

    text += `\n☎️ <b>CALL CENTRE</b>\n`;
    text += `Jami Visit: ${cc.totalVisit}\n`;
    cc.perOperator.forEach((o) => {
      text += `• ${o.name}: ${o.visit} visit, $${fmtMoney(o.sot)}\n`;
    });

    text += `\n📈 <b>MARKETING</b>\n`;
    text += `Jami Lead: ${mkt.totalLeads}\n`;
    text += `Xarajat: $${fmtMoney(mkt.totalSpend)}\n`;
    text += `CPL: $${mkt.cpl.toFixed(2)}\n`;

    const aiContext = `Showroom: Savdo $${fmtMoney(sr.totalSavdo)}, Lid ${sr.totalLid}, Konversiya ${sr.konv}%.\nCall Centre: Visit ${cc.totalVisit}.\nMarketing: Lead ${mkt.totalLeads}, Xarajat $${fmtMoney(mkt.totalSpend)}, CPL $${mkt.cpl.toFixed(2)}.`;
    const aiSummary = await getClaudeSummary(aiContext);

    text += `\n🤖 <b>AI Maslahatchi xulosasi</b>\n${aiSummary}`;

    await tgRequest('sendMessage', { chat_id: HISOBOT_GROUP_ID, text, parse_mode: 'HTML' });
    console.log('Kunlik hisobot yuborildi:', new Date().toISOString());
  } catch (e) {
    console.error('sendDailyReport xatosi:', e);
  }
}

// Har minutda tekshiradi, soat 20:30 bo'lganda (faqat bir marta) hisobot yuboradi
let lastReportDate = null;
setInterval(() => {
  const hour = tashkentHour();
  const minute = tashkentMinute();
  const today = todayStr();
  if (hour === 20 && minute >= 30 && minute < 35 && lastReportDate !== today) {
    lastReportDate = today;
    sendDailyReport();
  }
}, 60000);

// ───────────────────────────────────────────────
// Bitta update (xabar/callback)ni qayta ishlash
// ───────────────────────────────────────────────
async function processUpdate(update) {
  const today = todayStr();

  // ── CALLBACK QUERY (tugma bosilganda) ──
  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId = cq.message.chat.id;
    const data = cq.data;
    await tgRequest('answerCallbackQuery', { callback_query_id: cq.id });

    if (data.startsWith('approve_') || data.startsWith('reject_')) {
      const parts = data.split('_');
      const action = parts[0];
      const empId = parts[1];
      const approved = action === 'approve';
      await fbPatch(`/kpi/dc_early_leave/${today}/${empId}`, {
        approved,
        decidedAt: new Date().toTimeString().slice(0, 5),
      });
      const emp = await findEmployeeById(empId);
      await tgRequest('editMessageText', {
        chat_id: chatId,
        message_id: cq.message.message_id,
        text: `${approved ? 'Tasdiqlandi' : 'Rad etildi'} - ${emp?.name || empId}`,
      });
      if (emp?.telegramId) {
        await tgRequest('sendMessage', {
          chat_id: emp.telegramId,
          text: approved
            ? "Erta ketish so'rovingiz Rahbar tomonidan TASDIQLANDI."
            : "Erta ketish so'rovingiz Rahbar tomonidan RAD ETILDI.",
        });
      }
      return;
    }

    const employee = await findEmployeeByChatId(chatId);
    if (!employee) {
      await tgRequest('sendMessage', {
        chat_id: chatId,
        text: `Sizning Chat ID'ingiz (${chatId}) hali tizimga kiritilmagan. Rahbarga yuboring.`,
      });
      return;
    }
    if (data === 'act_keldi' || data === 'act_ketdi') {
      const pendingType = data === 'act_keldi' ? 'keldi' : 'ketdi';
      await fbSet(`/kpi/dc_pending_action/${chatId}`, { type: pendingType, ts: Date.now() });
      await tgRequest('sendMessage', {
        chat_id: chatId,
        text: `Endi ${pendingType === 'keldi' ? 'ISHGA KELGANINGIZDA' : 'ISHDAN KETAYOTGANDA'} Marka ilovasidagi vaqt ko'rinadigan rasmni yuboring.`,
      });
    } else if (data === 'act_erta') {
      await fbSet(`/kpi/dc_pending_action/${chatId}`, { type: 'erta_sorov', ts: Date.now() });
      await tgRequest('sendMessage', {
        chat_id: chatId,
        text: 'Necha soat:daqiqada ketishni xohlaysiz? Masalan: 17:30',
      });
    }
    return;
  }

  const message = update.message;
  if (!message) return;
  const chatId = message.chat.id;
  const chatType = message.chat.type;

  // ── GURUH XABARI ──
  if (chatType === 'group' || chatType === 'supergroup') {
    if (message.photo && message.from?.id) {
      const fromId = message.from.id;
      const employee = await findEmployeeByChatId(fromId);
      if (!employee) return;

      const hour = tashkentHour();
      let actionType = null;
      if (hour >= 6 && hour < 12) actionType = 'keldi';
      else if (hour >= 15) actionType = 'ketdi';
      if (!actionType) return;

      const fileId = message.photo[message.photo.length - 1].file_id;
      const file = await downloadTelegramFile(fileId);
      if (!file) return;

      const timeText = await claudeReadTime(file.base64, file.mime);
      const match = timeText.match(/(\d{2}):(\d{2})/);
      if (!match) return;
      const detectedTime = `${match[1]}:${match[2]}`;

      const empId = employee.id;
      const existing = (await fbGet(`/kpi/dc_attendance/${today}/${empId}`)) || {};
      const updateData = { ...existing, name: employee.name, [actionType]: detectedTime, [`${actionType}PhotoFileId`]: fileId };
      await fbSet(`/kpi/dc_attendance/${today}/${empId}`, updateData);
    }
    return;
  }

  // ── SHAXSIY CHAT ──
  if (message.text && message.text.trim() === '/start') {
    await tgRequest('sendMessage', {
      chat_id: chatId,
      text: `Salom! Men Decopol Davomat botiman.\n\nSizning Chat ID: ${chatId}\n(Bu ID'ni Rahbarga yuboring, u Sozlamalarda kiritadi)`,
    });
    await sendActionMenu(chatId);
    return;
  }

  const employee = await findEmployeeByChatId(chatId);
  const pending = await fbGet(`/kpi/dc_pending_action/${chatId}`);

  if (employee && pending?.type === 'erta_sorov' && message.text) {
    const timeText = message.text.trim();
    const match = timeText.match(/^(\d{1,2}):(\d{2})$/);
    if (match) {
      const reqTime = `${String(match[1]).padStart(2, '0')}:${match[2]}`;
      await fbSet(`/kpi/dc_early_leave/${today}/${employee.id}`, {
        requestedTime: reqTime,
        approved: null,
        name: employee.name,
      });
      await tgRequest('sendMessage', {
        chat_id: RAHBAR_CHAT_ID,
        text: `${employee.name} erta ketish so'rovi: ${reqTime}`,
        reply_markup: JSON.stringify({
          inline_keyboard: [
            [
              { text: 'Tasdiqlash', callback_data: `approve_${employee.id}_${Date.now()}` },
              { text: 'Rad etish', callback_data: `reject_${employee.id}_${Date.now()}` },
            ],
          ],
        }),
      });
      await tgRequest('sendMessage', { chat_id: chatId, text: "So'rovingiz Rahbarga yuborildi. Javobni kuting." });
      await fbSet(`/kpi/dc_pending_action/${chatId}`, null);
    } else {
      await tgRequest('sendMessage', { chat_id: chatId, text: "Format noto'g'ri. Masalan: 17:30 deb yozing." });
    }
    return;
  }

  if (message.photo) {
    if (!employee) {
      await tgRequest('sendMessage', {
        chat_id: chatId,
        text: `Sizning Chat ID'ingiz (${chatId}) hali tizimga kiritilmagan. Rahbarga yuboring.`,
      });
      return;
    }
    if (!pending || (pending.type !== 'keldi' && pending.type !== 'ketdi')) {
      await tgRequest('sendMessage', {
        chat_id: chatId,
        text: "Avval pastdagi menyudan 'Keldim' yoki 'Ketdim' tugmasini bosing.",
      });
      await sendActionMenu(chatId);
      return;
    }
    const actionType = pending.type;
    const fileId = message.photo[message.photo.length - 1].file_id;
    const file = await downloadTelegramFile(fileId);
    if (!file) {
      await tgRequest('sendMessage', { chat_id: chatId, text: "Rasmni yuklab bo'lmadi, qaytadan urinib ko'ring." });
      return;
    }
    const timeText = await claudeReadTime(file.base64, file.mime);
    if (/NOANIQ/i.test(timeText) || !timeText || /XATO/i.test(timeText)) {
      await tgRequest('sendMessage', {
        chat_id: chatId,
        text: `Rasmdagi vaqtni o'qib bo'lmadi.\n\nDebug: ${timeText || "(bo'sh javob)"}`,
      });
      return;
    }
    const match = timeText.match(/(\d{2}):(\d{2})/);
    if (!match) {
      await tgRequest('sendMessage', { chat_id: chatId, text: `Vaqt formatini tushunib bo'lmadi: ${timeText}` });
      return;
    }
    const detectedTime = `${match[1]}:${match[2]}`;
    const empId = employee.id;
    const existing = (await fbGet(`/kpi/dc_attendance/${today}/${empId}`)) || {};
    const updateData = { ...existing, name: employee.name, [actionType]: detectedTime, [`${actionType}PhotoFileId`]: fileId };
    await fbSet(`/kpi/dc_attendance/${today}/${empId}`, updateData);
    await fbSet(`/kpi/dc_pending_action/${chatId}`, null);
    await tgRequest('sendMessage', {
      chat_id: chatId,
      text: `${actionType === 'keldi' ? 'Keldi' : 'Ketdi'} vaqti qabul qilindi: ${detectedTime}\n${new Date().toLocaleDateString('uz-UZ')}`,
    });
    return;
  }

  if (employee) await sendActionMenu(chatId);
}

// ───────────────────────────────────────────────
// HTTP Routes
// ───────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ ok: true, service: 'Decopol Davomat Bot', status: 'running' });
});

// Dashboard'dan vazifa biriktirilganda, yoki boshqa har qanday xabar yuborish uchun
app.post('/send-message', express.json(), async (req, res) => {
  const { chat_id, text } = req.body || {};
  if (!chat_id || !text) {
    return res.json({ ok: false, error: 'chat_id va text kerak' });
  }
  const result = await tgRequest('sendMessage', { chat_id, text, parse_mode: 'HTML' });
  res.json({ ok: result?.ok === true, data: result });
});

// Dashboard Sozlamalarida "Chat ID'larni yangilash" tugmasi uchun
app.get('/get-chats', (req, res) => {
  res.json({ ok: true, chats: lastSeenChats });
});

let lastSeenChats = [];

app.post('/webhook', async (req, res) => {
  res.sendStatus(200); // Telegram'ga darhol javob, keyin qayta ishlaymiz
  try {
    const chat = req.body?.message?.chat;
    if (chat) {
      lastSeenChats.unshift({ id: chat.id, type: chat.type, title: chat.title || chat.first_name || '-', time: new Date().toISOString() });
      lastSeenChats = lastSeenChats.slice(0, 20);
    }
    await processUpdate(req.body);
  } catch (e) {
    console.error('processUpdate error:', e);
  }
});

app.get('/debug-chats', (req, res) => {
  res.json({ ok: true, lastSeenChats });
});

// Qo'lda sinab ko'rish uchun: brauzerda ochib, hisobotni darhol yuboradi
app.get('/test-daily-report', async (req, res) => {
  await sendDailyReport();
  res.json({ ok: true, message: 'Hisobot yuborildi (yoki xatolik logda)' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Decopol Davomat bot ${PORT}-portda ishga tushdi`);
});
