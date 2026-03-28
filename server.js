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

// ================= EXCEL =================
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
            { header: 'sessions', key: 'sessions' },
            { header: 'joinDate', key: 'joinDate' }
        ];

        const sessions = wb.addWorksheet('Sessions');
        sessions.columns = [
            { header: 'id', key: 'id' },
            { header: 'userId', key: 'userId' },
            { header: 'start', key: 'start' },
            { header: 'end', key: 'end' },
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
            sessions: 0,
            joinDate: new Date().toISOString()
        });

        await wb.xlsx.writeFile(FILE);
        console.log('Excel created with admin account');
    }

    return wb;
}

async function saveWB(wb) {
    await wb.xlsx.writeFile(FILE);
}

// ================= AUTH =================
function auth(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Unauthorized' });

    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ message: 'Invalid token' });
    }
}

// ================= REGISTER =================
app.post('/api/auth/register', async (req, res) => {
    const { name, email, password, role } = req.body;

    const wb = await loadWB();
    const sheet = wb.getWorksheet('Users');

    const rows = sheet.getRows(2, sheet.rowCount) || [];

    if (rows.find(r => r.getCell('email').value === email))
        return res.status(400).json({ message: 'Email exists' });

    const hash = await bcrypt.hash(password, 10);

    sheet.addRow({
        id: 'u-' + Date.now(),
        name,
        email,
        password: hash,
        role,
        hours: 0,
        sessions: 0,
        joinDate: new Date().toISOString()
    });

    await saveWB(wb);

    res.json({ message: 'Registered' });
});

// ================= LOGIN =================
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;

    const wb = await loadWB();
    const sheet = wb.getWorksheet('Users');
    const rows = sheet.getRows(2, sheet.rowCount) || [];

    const user = rows.find(r => r.getCell('email').value === email);

    if (!user) return res.status(400).json({ message: 'Invalid email' });

    const match = await bcrypt.compare(password, user.getCell('password').value);

    if (!match) return res.status(400).json({ message: 'Wrong password' });

    const payload = {
        id: user.getCell('id').value,
        role: user.getCell('role').value
    };

    const token = jwt.sign(payload, JWT_SECRET);

    res.json({
        token,
        user: {
            id: payload.id,
            name: user.getCell('name').value,
            email,
            role: payload.role,
            hours: user.getCell('hours').value,
            sessions: user.getCell('sessions').value
        }
    });
});

// ================= PROFILE =================
app.get('/api/profile', auth, async (req, res) => {
    const wb = await loadWB();
    const sheet = wb.getWorksheet('Users');
    const rows = sheet.getRows(2, sheet.rowCount) || [];

    const user = rows.find(r => r.getCell('id').value === req.user.id);

    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({
        id: user.getCell('id').value,
        name: user.getCell('name').value,
        email: user.getCell('email').value,
        role: user.getCell('role').value,
        hours: user.getCell('hours').value,
        sessions: user.getCell('sessions').value
    });
});

// ================= SAVE SESSION =================
app.post('/api/session', auth, async (req, res) => {
    const { duration } = req.body;

    const wb = await loadWB();
    const users = wb.getWorksheet('Users');
    const sessions = wb.getWorksheet('Sessions');

    const rows = users.getRows(2, users.rowCount) || [];

    const user = rows.find(r => r.getCell('id').value === req.user.id);

    if (!user) return res.status(404).json({ message: 'User not found' });

    const newHours = (user.getCell('hours').value || 0) + duration;
    const newSessions = (user.getCell('sessions').value || 0) + 1;

    user.getCell('hours').value = newHours;
    user.getCell('sessions').value = newSessions;

    sessions.addRow({
        id: 's-' + Date.now(),
        userId: req.user.id,
        start: new Date(Date.now() - duration * 3600000).toISOString(),
        end: new Date().toISOString(),
        duration
    });

    await saveWB(wb);

    res.json({ message: 'Session saved' });
});

// ================= ADMIN DOWNLOAD =================
app.get('/api/admin/download', auth, async (req, res) => {
    if (req.user.role !== 'admin')
        return res.status(403).json({ message: 'Forbidden' });

    res.download(FILE);
});

// ================= START =================
loadWB().then(() => {
    app.listen(PORT, () => {
        console.log('Server running on port ' + PORT);
    });
});
