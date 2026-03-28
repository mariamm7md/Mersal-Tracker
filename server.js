const express = require('express');
const { google } = require('googleapis');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 3000;

// 🆔 معرف الشيت (استبدله بمعرف الشيت الخاص بك أو اتركه كمتغير بيئة)
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1TMDiMSAtyjk4iPAsLsMoo-uf7nUeJuOwKeOtPZ3o3xw';

// ═══ Middleware ═══
app.use(helmet({ contentSecurityPolicy: false })); // للسماح بتحميل الخطوط الخارجية
app.use(compression());
app.use(express.json());
app.use(express.static(__dirname)); // يقدم ملف index.html من نفس المجلد

// ═══ Google Auth ═══
let credentials;
try {
  credentials = process.env.GOOGLE_CREDENTIALS 
    ? JSON.parse(process.env.GOOGLE_CREDENTIALS) 
    : require('./service-account.json');
} catch (e) {
  console.error('❌ Google Credentials missing!');
}

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});
const sheets = google.sheets({ version: 'v4', auth });

// ═══ Helper Functions ═══
async function getSheetData(range) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: range,
  });
  return response.data.values || [];
}

// ═══ API Endpoints ═══

// 1. جلب كافة البيانات عند تحميل التطبيق
app.get('/api/init', async (req, res) => {
  try {
    const volunteers = await getSheetData('Volunteers!A2:G'); // ID, Name, Email, Phone, Pass, Hours, Sessions
    const settings = await getSheetData('Settings!A2:B20'); // Target, Activities...
    
    const formattedVolunteers = volunteers.map(v => ({
      id: v[0], name: v[1], email: v[2], phone: v[3], password: v[4], 
      hours: parseFloat(v[5] || 0), sessions: parseInt(v[6] || 0)
    }));

    const activities = settings.map(row => row[1]).filter(a => a); // العمود B في Settings للنشاطات
    const target = settings[0] ? settings[0][0] : 130; // الخلية A2 للهدف

    res.json({ success: true, volunteers: formattedVolunteers, activities, target });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// 2. تحديث بيانات متطوع (بعد إنهاء جلسة أو تعديل بروفايل)
app.post('/api/update-volunteer', async (req, res) => {
  try {
    const { id, hours, sessions, name, email, phone } = req.body;
    const rows = await getSheetData('Volunteers!A:A');
    const rowIndex = rows.findIndex(r => r[0] === String(id)) + 1;

    if (rowIndex <= 0) return res.json({ success: false, message: 'User not found' });

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Volunteers!B${rowIndex}:G${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[name, email, phone, req.body.password, hours, sessions]]
      }
    });

    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// 3. إضافة متطوع جديد (تسجيل)
app.post('/api/register', async (req, res) => {
  try {
    const { id, name, email, phone, password } = req.body;
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Volunteers!A:G',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[id, name, email, phone, password, 0, 0]]
      }
    });
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// 4. تحديث الإعدادات (Admin)
app.post('/api/update-settings', async (req, res) => {
  try {
    const { target, activities } = req.body;
    // تحديث الهدف في A2
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Settings!A2',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[target]] }
    });
    
    // تحديث قائمة النشاطات في العمود B
    const actValues = activities.map(a => [a]);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Settings!B2:B100',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: actValues }
    });

    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// توجيه أي طلب آخر لملف الـ HTML
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Mersal Server running on port ${PORT}`);
});
