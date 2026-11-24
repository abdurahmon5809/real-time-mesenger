# Telegram Web Pro — Real-time Messenger

React + Vite frontend, Express + Socket.IO backend, MongoDB database. Node.js 20+ va MongoDB 5.0+ tavsiya etiladi.

## 1. Muhim: bazani zaxiralash

Yangilangan server birinchi ishga tushganda eski xabar ID'lari, `clientMessageId`, reaction egalari va Base64 avatarlarni migratsiya qiladi. Avval MongoDB bazasining zaxira nusxasini oling.

```bash
mongodump --uri="mongodb://127.0.0.1:27017/telegram_web_pro" --out="./backup-before-messenger-update"
```

Yoki MongoDB Compass orqali `telegram_web_pro` bazasini backup qiling. Migratsiyani avval production bo‘lmagan nusxada sinash tavsiya etiladi.

## 2. Server sozlamalari

`server/.env.example` faylidan nusxa olib `server/.env` yarating:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/telegram_web_pro
PORT=3001
CLIENT_ORIGIN=http://localhost:5173
```

## 3. Backendni ishga tushirish

```bash
cd server
npm install
npm run migrate
npm start
```

`npm run migrate` eski ma’lumotlarni ko‘chiradi va kerakli indekslarni yaratadi. Server odatiy ishga tushganda ham migratsiyani indekslardan oldin tekshiradi; migratsiya takroran ishlatilishga mo‘ljallangan.

## 4. Frontendni ishga tushirish

Yangi terminalda:

```bash
cd client
npm install
npm run dev
```

Brauzerda Vite ko‘rsatgan manzilni oching (odatda `http://localhost:5173`). `VITE_API_URL` belgilanmasa, frontend `http://localhost:3001` backend manzilidan foydalanadi.

## 5. Regression testlar

Backend:

```bash
cd server
npm test
```

Frontend yordamchi mantiq testlari:

```bash
cd client
npm test
```

## 6. Tuzatilgan 11 yo‘nalish

1. **Reconnect:** Socket event handlerlari asinxron sessiya tiklash boshlanishidan oldin ro‘yxatdan o‘tadi. Frontend `session_restored` kelmaguncha himoyalangan chatga kirmaydi; reconnect vaqtida foydalanuvchi tanlagan oxirgi chat ustuvor saqlanadi.
2. **Draft va qayta yuborish:** Har bir chatning matni alohida saqlanadi. Server muvaffaqiyatli ack bermaguncha matn tozalanmaydi. Kechikkan ack yangi matn/faylni o‘chirmaydi. Ack yo‘qolib qolsa, aynan o‘sha draft uchun `clientMessageId` qayta ishlatiladi, shu sabab serverdagi dublikat xabar oldi olinadi.
3. **Legacy indeks migratsiyasi:** Eski sparse compound unique indeks olib tashlanadi. Xabar ID va `(senderId, clientMessageId)` takrorlari indekslar yaratilishidan oldin normallashtiriladi. Yangi compound unique indeks faqat `senderId` ObjectId va `clientMessageId` string bo‘lgan hujjatlarga qo‘llanadi.
4. **Sessiya muddati:** Server idle socketlar sessiyasini ham davriy tekshiradi. Muddati tugagan sessiyaga tegishli barcha socketlar uziladi; `userId/sessionId` disconnect cleanup tugaguncha socketda saqlanadi va online/socket ID holati tozalanadi.
5. **Akkauntni o‘chirish:** Server muvaffaqiyatli javobidan keyin tokenlar, chatlar, xabarlar, modallar va media viewer holati tozalanadi. Chat composer draft/retry holati ham boshqa akkauntga o‘tmaydi.
6. **Reaction egaligi:** Eski reaction username qiymatlari faqat aniq mos user ID topilganda ID ga o‘tkaziladi. Aniqlanmagan qiymatlar audit uchun `legacyReactionsUnresolved` ichida saqlanadi; yangi reactionlar faqat user ID bilan boshqariladi.
7. **Kechikkan javoblar:** `join_room`, `room_joined`, history va eski xabar so‘rovlari request ID, room ID va room generation bilan tekshiriladi. Eski chat javobi yangi chat holatini almashtira olmaydi.
8. **Guruh read cursor:** `mark_read` faqat shu guruhga tegishli mavjud `upToMessageId` chegarasidan foydalanadi. Cursor `(createdAt, _id)` bo‘yicha atomik ravishda faqat oldinga yuradi; serverning hozirgi vaqti read chegarasi sifatida ishlatilmaydi.
9. **Avatar migratsiyasi:** Eski Base64 avatar tekshiriladi, faylga yoziladi va faqat DB URL muvaffaqiyatli saqlangandan keyin almashtiriladi. DB saqlash xatosida eski Base64 qiymati qoladi va vaqtinchalik fayl o‘chiriladi. Oddiy profil saqlash mavjud avatarni bo‘shatmaydi.
10. **10 000 belgi limiti:** Yangi va tahrirlangan xabar serverda kesilmaydi, limitdan oshsa tushunarli xato qaytadi. Frontend belgi hisoblagichini ko‘rsatadi va xato bo‘lsa matnni tahrirlash uchun saqlaydi.
11. **Modullashtirish:** Frontend sessiya (`useSessionState`, `useSessionActions`), chat navigatsiyasi (`useChatNavigation`), xabarlar (`useMessageActions`), media (`useMediaViewer`) va socket (`useChatSocket`) hooklariga ajratildi. Backend socket eventlari `auth.js`, `profile.js`, `message.js`, `group.js` va `chat-list.js` modullariga ajratildi.

Mavjud chat UI komponentlari va Telegram uslubidagi CSS saqlandi. Xabarlar avtomatik pastga tushishi va eski xabarlarni yuklashdagi scroll pozitsiyasini saqlash funksiyalari ham saqlangan.

## 7. Tekshiruv natijalari va cheklovlar

- Backend regression testlari: **15/15 o‘tdi**.
- Frontend regression testlari: **4/4 o‘tdi**.
- Frontend 20 ta JS/JSX manba fayli Babel parser bilan tekshirildi; import yo‘llarida yetishmayotgan fayl topilmadi.
- Backend JS fayllari `node --check` bilan tekshirildi.
- To‘liq Vite production build bu tekshiruv muhitida bajarilmadi: yuborilgan arxivdagi `node_modules` ichida Linux uchun Rollup native binary yo‘q edi. ZIP ichiga `node_modules` qo‘shilmadi; Windows kompyuteringizda `npm install` bajarilgach `npm run build` bilan alohida tekshiring.
- MongoDB bilan haqiqiy integratsion migratsiya sinovi bu muhitda bajarilmadi. Shu sabab `npm run migrate`dan oldin zaxira nusxa olish shart.
