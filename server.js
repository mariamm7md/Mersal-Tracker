const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// ================= CONFIG =================
const ADMIN_PASSWORD = "mersal2026admin";

const DATA_DIR = path.join(__dirname, 'data');
const FILES = {
    volunteers: path.join(DATA_DIR, 'volunteers.json'),
    attendance: path.join(DATA_DIR, 'attendance.json'),
    activities: path.join(DATA_DIR, 'activities.json'),
    settings: path.join(DATA_DIR, 'settings.json')
};

// ================= INIT =================
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const safeRead = (file) => {
    try {
        if (!fs.existsSync(file)) return [];
        const data = fs.readFileSync(file, 'utf-8');
        return data ? JSON.parse(data) : [];
    } catch (e) {
        console.error("Read error:", e);
        return [];
    }
};

const safeWrite = (file, data) => {
    try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Write error:", e);
    }
};

// default data
if (!fs.existsSync(FILES.settings)) safeWrite(FILES.settings, { hoursTarget: 130 });

if (!fs.existsSync(FILES.activities)) safeWrite(FILES.activities, [
    { id: '1', name: 'Medical Services' },
    { id: '2', name: 'Education' },
    { id: '3', name: 'Social Services' }
]);

// ================= AUTH =================
app.post('/api/login', (req, res) => {
    try {
        const { email, password } = req.body;
        const users = safeRead(FILES.volunteers);

        const user = users.find(u => u.email === email && u.password === password);

        if (!user) return res.json(null);

        const { password: _, ...safeUser } = user;
        res.json(safeUser);

    } catch (err) {
        res.status(500).json({ error: "Login failed" });
    }
});

app.post('/api/register', (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password)
            return res.status(400).json({ error: "Missing fields" });

        const users = safeRead(FILES.volunteers);

        if (users.find(u => u.email === email))
            return res.status(400).json({ error: "Email exists" });

        const newUser = {
            id: Date.now().toString(),
            name,
            email,
            password,
            avatar: null,
            createdAt: new Date().toISOString()
        };

        users.push(newUser);
        safeWrite(FILES.volunteers, users);

        const { password: _, ...safeUser } = newUser;
        res.json(safeUser);

    } catch (err) {
        res.status(500).json({ error: "Register failed" });
    }
});

// ================= USER =================
app.post('/api/user/update', (req, res) => {
    try {
        let users = safeRead(FILES.volunteers);
        const { userId, name, email } = req.body;

        const i = users.findIndex(u => u.id === userId);
        if (i === -1) return res.status(404).json({ error: "Not found" });

        if (name) users[i].name = name;
        if (email) users[i].email = email;

        safeWrite(FILES.volunteers, users);

        const { password, ...safeUser } = users[i];
        res.json(safeUser);

    } catch {
        res.status(500).json({ error: "Update failed" });
    }
});

app.post('/api/user/avatar', (req, res) => {
    let users = safeRead(FILES.volunteers);
    const { userId, avatar } = req.body;

    const i = users.findIndex(u => u.id === userId);
    if (i === -1) return res.status(404).json({ error: "Not found" });

    users[i].avatar = avatar;
    safeWrite(FILES.volunteers, users);

    res.json({ success: true });
});

// ================= ATTENDANCE =================
app.post('/api/attendance/checkin', (req, res) => {
    try {
        const { volunteerId, activityName } = req.body;
        let attendance = safeRead(FILES.attendance);

        const active = attendance.find(a => a.volunteerId === volunteerId && !a.checkOut);
        if (active) return res.status(400).json({ error: "Already checked in" });

        const now = new Date();

        const record = {
            id: Date.now().toString(),
            volunteerId,
            dateStr: now.toISOString().split('T')[0],
            checkIn: now.toLocaleTimeString(),
            checkInTime: now.getTime(),
            checkOut: null,
            duration: 0,
            activityName,
            feedback: ""
        };

        attendance.push(record);
        safeWrite(FILES.attendance, attendance);

        res.json(record);

    } catch {
        res.status(500).json({ error: "Checkin failed" });
    }
});

app.post('/api/attendance/checkout', (req, res) => {
    try {
        let attendance = safeRead(FILES.attendance);
        const { volunteerId, feedback } = req.body;

        const rec = attendance.find(a => a.volunteerId === volunteerId && !a.checkOut);
        if (!rec) return res.status(400).json({ error: "No active session" });

        const now = new Date();

        rec.checkOut = now.toLocaleTimeString();
        rec.duration = ((now - rec.checkInTime) / 3600000).toFixed(2);
        rec.feedback = feedback || "";

        safeWrite(FILES.attendance, attendance);

        res.json(rec);

    } catch {
        res.status(500).json({ error: "Checkout failed" });
    }
});

app.get('/api/attendance/:id', (req, res) => {
    const data = safeRead(FILES.attendance);
    res.json(data.filter(d => d.volunteerId === req.params.id));
});

// ================= ADMIN =================
app.post('/api/admin/login', (req, res) => {
    res.json({ success: req.body.password === ADMIN_PASSWORD });
});

app.get('/api/admin/stats', (req, res) => {
    const users = safeRead(FILES.volunteers);
    const attendance = safeRead(FILES.attendance);

    res.json({
        totalVolunteers: users.length,
        totalHours: attendance.reduce((s, a) => s + Number(a.duration || 0), 0).toFixed(1)
    });
});

// ================= EXPORT =================
app.get('/api/export', async (req, res) => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Report');

    sheet.columns = [
        { header: 'Name', key: 'name', width: 20 },
        { header: 'Date', key: 'date', width: 15 },
        { header: 'Hours', key: 'hours', width: 10 }
    ];

    const users = safeRead(FILES.volunteers);
    const attendance = safeRead(FILES.attendance);

    attendance.forEach(a => {
        const u = users.find(x => x.id === a.volunteerId) || {};
        sheet.addRow({
            name: u.name,
            date: a.dateStr,
            hours: a.duration
        });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats');
    await workbook.xlsx.write(res);
    res.end();
});

// ================= SERVER =================
app.listen(PORT, () => {
    console.log("✅ Server running on port " + PORT);
});
