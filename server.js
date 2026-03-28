const express = require('express');
const { google } = require('googleapis');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1TMDiMSAtyjk4iPAsLsMoo-uf7nUeJuOwKeOtPZ3o3xw';

// إعداد المصادقة
let auth, sheets;
try {
    const creds = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    auth = new google.auth.GoogleAuth({
        credentials: creds,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    sheets = google.sheets({ version: 'v4', auth });
} catch (e) {
    console.error("❌ خطأ في إعدادات Google Credentials:", e.message);
}

// دالة لجلب البيانات مع تجنب التعليق
async function fetchSheet(range) {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });
    return res.data.values || [];
}

// 1. جلب كل البيانات عند تحميل الصفحة
app.get('/api/init', async (req, res) => {
    try {
        const volunteers = await fetchSheet('Volunteers!A2:G');
        const settings = await fetchSheet('Settings!A2:B20');
        const data = volunteers.map(row => ({
            id: row[0], name: row[1], email: row[2], phone: row[3], password: row[4], hours: parseFloat(row[5] || 0), sessions: parseInt(row[6] || 0)
        }));
        res.json({ success: true, volunteers: data, activities: settings.map(r => r[1]).filter(Boolean), target: settings[0][0] || 130 });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// 2. تسجيل متطوع جديد
app.post('/api/register', async (req, res) => {
    try {
        const { id, name, email, phone, password } = req.body;
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID, range: 'Volunteers!A:G',
            valueInputOption: 'USER_ENTERED', requestBody: { values: [[id, name, email, phone, password, 0, 0]] }
        });
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

// 3. تحديث بيانات (للمتطوع أو الأدمن)
app.post('/api/update-volunteer', async (req, res) => {
    try {
        const { id, name, email, phone, password, hours, sessions } = req.body;
        const rows = await fetchSheet('Volunteers!A:A');
        const rowIndex = rows.findIndex(r => r[0] == id) + 1;
        if (rowIndex <= 0) return res.json({ success: false });

        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID, range: `Volunteers!B${rowIndex}:G${rowIndex}`,
            valueInputOption: 'USER_ENTERED', requestBody: { values: [[name, email, phone, password, hours, sessions]] }
        });
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

// 4. حذف متطوع (خاص بالأدمن)
app.post('/api/delete-volunteer', async (req, res) => {
    try {
        const { id } = req.body;
        const rows = await fetchSheet('Volunteers!A:A');
        const rowIndex = rows.findIndex(r => r[0] == id);
        if (rowIndex < 0) return res.json({ success: false });

        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            requestBody: { requests: [{ deleteDimension: { range: { sheetId: 0, dimension: 'ROWS', startIndex: rowIndex + 1, endIndex: rowIndex + 2 } } }] }
        });
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Server on ${PORT}`));
