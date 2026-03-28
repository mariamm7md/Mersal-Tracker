const express = require('express');
const { google } = require('googleapis');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1TMDiMSAtyjk4iPAsLsMoo-uf7nUeJuOwKeOtPZ3o3xw';

let sheets;

// ================= INIT GOOGLE =================
async function initGoogle() {
    if (!process.env.GOOGLE_CREDENTIALS) {
        throw new Error("Missing GOOGLE_CREDENTIALS");
    }

    const creds = JSON.parse(process.env.GOOGLE_CREDENTIALS);

    const auth = new google.auth.GoogleAuth({
        credentials: creds,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    sheets = google.sheets({ version: 'v4', auth });
}

initGoogle().catch(err => {
    console.error("❌ Google Init Error:", err.message);
    process.exit(1);
});

// ================= HELPERS =================
async function fetchSheet(range) {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range
    });
    return res.data.values || [];
}

async function getSheetId(sheetName) {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const sheet = meta.data.sheets.find(s => s.properties.title === sheetName);
    return sheet.properties.sheetId;
}

// ================= APIs =================

// INIT
app.get('/api/init', async (req, res) => {
    try {
        const volunteers = await fetchSheet('Volunteers!A2:G');
        const settings = await fetchSheet('Settings!A2:B20');

        const data = volunteers.map(row => ({
            id: row[0],
            name: row[1],
            email: row[2],
            phone: row[3],
            password: row[4], // موجود داخلي فقط
            hours: Number(row[5]) || 0,
            sessions: Number(row[6]) || 0
        }));

        res.json({
            success: true,
            volunteers: data, // هنستخدمه للـ login فقط
            activities: settings.map(r => r[1]).filter(Boolean),
            target: settings?.[0]?.[0] || 130
        });

    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// REGISTER
app.post('/api/register', async (req, res) => {
    try {
        const { id, name, email, phone, password } = req.body;

        if (!id || !name || !email || !password) {
            return res.status(400).json({ success: false, error: "Missing fields" });
        }

        const hashed = await bcrypt.hash(password, 10);

        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Volunteers!A:G',
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [[id, name, email, phone, hashed, 0, 0]]
            }
        });

        res.json({ success: true });

    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// UPDATE
app.post('/api/update-volunteer', async (req, res) => {
    try {
        const { id, name, email, phone, password, hours, sessions } = req.body;

        const rows = await fetchSheet('Volunteers!A:A');
        const index = rows.findIndex(r => r[0] == id);

        if (index === -1) return res.json({ success: false });

        const rowIndex = index + 2;

        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `Volunteers!B${rowIndex}:G${rowIndex}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [[name, email, phone, password, hours, sessions]]
            }
        });

        res.json({ success: true });

    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false });
    }
});

// DELETE
app.post('/api/delete-volunteer', async (req, res) => {
    try {
        const { id } = req.body;

        const rows = await fetchSheet('Volunteers!A:A');
        const index = rows.findIndex(r => r[0] == id);

        if (index === -1) return res.json({ success: false });

        const sheetId = await getSheetId("Volunteers");

        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            requestBody: {
                requests: [{
                    deleteDimension: {
                        range: {
                            sheetId,
                            dimension: 'ROWS',
                            startIndex: index + 1,
                            endIndex: index + 2
                        }
                    }
                }]
            }
        });

        res.json({ success: true });

    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false });
    }
});

// ================= FRONT =================
app.get('*', (req, res) =>
    res.sendFile(path.join(__dirname, 'public', 'index.html'))
);

app.listen(PORT, () => console.log(`🚀 Server running on ${PORT}`));
