const express = require('express');
const ExcelJS = require('exceljs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'mersal-secret';
const FILE = path.join(__dirname, 'mersal-data.xlsx');

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ================= SAFE EXCEL =================
async function loadWB() {
    const wb = new ExcelJS.Workbook();

    if (fs.existsSync(FILE)) {
        await wb.xlsx.readFile(FILE);
    } else {
        const users = wb.addWorksheet('Users');
        users.columns = [
            { header: 'id', key: 'id' },
            { header: 'name', key: 'name' },
            { header: 'email', key: 'email' },
            { header: 'password', key: 'password' },
            { header: 'role', key: 'role' },
            { header: 'hours', key: 'hours' },
            { header: 'sessions', key: 'sessions' }
        ];

        const sessions = wb.addWorksheet('Sessions');
        sessions.columns = [
            { header: 'id', key: 'id' },
            { header: 'userId', key: 'userId' },
            { header: 'duration', key: 'duration' }
        ];

        const hash = await bcrypt.hash('admin123', 10);

        users.addRow({
            id: 'admin-1',
            name: 'Admin',
            email: 'admin@mersal.org',
            password: hash,
            role: 'admin',
            hours: 0,
            sessions: 0
        });

        await wb.xlsx.writeFile(FILE);
    }

    return wb;
}

async function saveWB(wb) {
    await wb.xlsx.writeFile(FILE);
}

// 🔥 FIX: safe rows
function getAllRows(sheet) {
    const rows = [];
    sheet.eachRow((row, rowNumber) => {
        if (rowNumber !== 1) rows.push(row);
    });
    return rows;
}

// ================= AUTH =================
function auth(req, res, next) {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ message: 'Unauthorized' });

        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ message: 'Invalid token' });
    }
}

// ================= REGISTER =================
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password, role } = req.body;

        const wb = await loadWB();
        const sheet = wb.getWorksheet('Users');
        const rows = getAllRows(sheet);

        if (rows.find(r => r.getCell(3).value === email))
            return res.status(400).json({ message: 'Email exists' });

        const hash = await bcrypt.hash(password, 10);

        sheet.addRow({
            id: 'u-' + Date.now(),
            name,
            email,
            password: hash,
            role,
            hours: 0,
            sessions: 0
        });

        await saveWB(wb);

        res.json({ message: 'Registered' });

    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Server error' });
    }
});

// ================= LOGIN =================
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const wb = await loadWB();
        const sheet = wb.getWorksheet('Users');
        const rows = getAllRows(sheet);

        const user = rows.find(r => r.getCell(3).value === email);

        if (!user) return res.status(400).json({ message: 'Invalid email' });

        const match = await bcrypt.compare(password, user.getCell(4).value);

        if (!match) return res.status(400).json({ message: 'Wrong password' });

        const payload = {
            id: user.getCell(1).value,
            role: user.getCell(5).value
        };

        const token = jwt.sign(payload, JWT_SECRET);

        res.json({
            token,
            user: {
                id: payload.id,
                name: user.getCell(2).value,
                email,
                role: payload.role,
                hours: user.getCell(6).value || 0,
                sessions: user.getCell(7).value || 0
            }
        });

    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Server error' });
    }
});

// ================= PROFILE =================
app.get('/api/profile', auth, async (req, res) => {
    try {
        const wb = await loadWB();
        const sheet = wb.getWorksheet('Users');
        const rows = getAllRows(sheet);

        const user = rows.find(r => r.getCell(1).value === req.user.id);

        if (!user) return res.status(404).json({ message: 'Not found' });

        res.json({
            id: user.getCell(1).value,
            name: user.getCell(2).value,
            email: user.getCell(3).value,
            role: user.getCell(5).value,
            hours: user.getCell(6).value || 0,
            sessions: user.getCell(7).value || 0
        });

    } catch (e) {
        res.status(500).json({ message: 'Server error' });
    }
});

// ================= SESSION =================
app.post('/api/session', auth, async (req, res) => {
    try {
        const { duration } = req.body;

        const wb = await loadWB();
        const users = wb.getWorksheet('Users');
        const sessions = wb.getWorksheet('Sessions');

        const rows = getAllRows(users);
        const user = rows.find(r => r.getCell(1).value === req.user.id);

        if (!user) return res.status(404).json({ message: 'User not found' });

        user.getCell(6).value = (user.getCell(6).value || 0) + duration;
        user.getCell(7).value = (user.getCell(7).value || 0) + 1;

        sessions.addRow({
            id: 's-' + Date.now(),
            userId: req.user.id,
            duration
        });

        await saveWB(wb);

        res.json({ message: 'Saved' });

    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Session error' });
    }
});

// ================= ADMIN =================
app.get('/api/admin/download', auth, (req, res) => {
    if (req.user.role !== 'admin')
        return res.status(403).json({ message: 'Forbidden' });

    res.download(FILE);
});

// ================= START =================
loadWB().then(() => {
    app.listen(PORT, () => console.log('Server running'));
});
