# Decopol Davomat Bot — Render.com'ga joylashtirish

## 1-qadam: GitHub'ga yuklash

1. github.com'da yangi repository yarating (masalan "decopol-bot")
2. Shu papkadagi fayllarni (index.js, package.json) o'sha repository'ga yuklang
   - Eng oson yo'l: GitHub saytida "uploading an existing file" tugmasi orqali, papkadagi
     barcha fayllarni sudrab tashlang (drag & drop)

## 2-qadam: Render.com'da hisob ochish

1. render.com saytiga kiring, "Get Started" orqali ro'yxatdan o'ting (GitHub orqali kirish qulay)

## 3-qadam: Yangi Web Service yaratish

1. Render dashboard'da "New +" tugmasini bosing, "Web Service" tanlang
2. GitHub repository'ingizni (decopol-bot) tanlang
3. Sozlamalar:
   - **Name**: decopol-bot (yoki istalgan nom)
   - **Region**: istalgan (Frankfurt yaqinroq bo'lishi mumkin)
   - **Branch**: main
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free

## 4-qadam: Environment Variables (Muhim!)

"Advanced" yoki "Environment" bo'limida, quyidagi o'zgaruvchilarni qo'shing:

| Key | Value |
|---|---|
| `BOT_TOKEN` | 8778444126:AAEezR6OLQkXuiT05B9zlD8HINJMY6ZBTQ4 |
| `CLAUDE_API_KEY` | (sizning Claude API kalitingiz, sk-ant-... bilan boshlanadi) |
| `FIREBASE_URL` | https://decopol-s-default-rtdb.firebaseio.com |
| `RAHBAR_CHAT_ID` | 7480007083 |

## 5-qadam: Deploy qilish

1. "Create Web Service" tugmasini bosing
2. Bir necha daqiqa kutib turing — Render avtomatik build va deploy qiladi
3. Tugagandan keyin, sizga URL beriladi, masalan: `https://decopol-bot.onrender.com`

## 6-qadam: Telegram webhook'ni shu yangi URL'ga ko'rsatish

Brauzerda quyidagi manzilni ochib (BOT_TOKEN'ni almashtiring, URL'ni ham
o'zingiznikiga almashtiring):

```
https://api.telegram.org/bot8778444126:AAEezR6OLQkXuiT05B9zlD8HINJMY6ZBTQ4/setWebhook?url=https://decopol-bot.onrender.com/webhook
```

Natija `{"ok":true,"result":true,"description":"Webhook was set"}` bo'lishi kerak.

## 7-qadam: Sinab ko'rish

Botga `/start` deb yozing — endi tezroq javob kelishi kerak (Render.com Telegram
bilan ishonchli aloqaga ega).

## Eslatma — Free tier cheklovi

Render.com'ning bepul tarifida, agar bot 15 daqiqa davomida hech qanday so'rov
olmasa, "uxlab qoladi" (sleep), va keyingi so'rovga javob berishi 30-50 soniya
ko'proq vaqt olishi mumkin (birinchi marta "uyg'onganda"). Bu odatiy holat, va
xodimlar kutib, qaytadan urinib ko'rishi kifoya.

Agar bu muammo bo'lsa, kelajakda Render'ning pullik ($7/oy) tarifiga
o'tish, yoki "uptime monitoring" xizmati (masalan UptimeRobot, bepul) orqali
botni har 10 daqiqada "uyg'otib turish" mumkin.
