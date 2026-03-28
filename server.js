const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static('public'));

const DATA_DIR = path.join(__dirname, 'data');
const FILES = {
    volunteers: path.join(DATA_DIR, 'volunteers.json'),
    attendance: path.join(DATA_DIR, 'attendance.json')
};

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const readJSON = (f) => fs.existsSync(f) ? JSON.parse(fs.readFileSync(f)) : [];
const writeJSON = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2));

// --- 1. LOGIN & REGISTER ---
app.post('/api/login', (req, res) => {
    const { identifier, password, name } = req.body;
    const vols = readJSON(FILES.volunteers);
    const logs = readJSON(FILES.attendance);

    const matches = vols.filter(u => (u.email === identifier || u.phone === identifier) && u.password === password);
    if (matches.length === 0) return res.status(401).json({ error: "بيانات خطأ" });
    if (matches.length > 1 && !name) return res.json({ needName: true, profiles: matches.map(m => m.name) });

    const user = name ? matches.find(m => m.name === name) : matches[0];
    const userLogs = logs.filter(a => a.volunteerId === user.id);
    const totalHours = userLogs.reduce((sum, log) => sum + (log.duration || 0), 0);

    res.json({ ...user, totalHours: parseFloat(totalHours.toFixed(1)), totalSessions: userLogs.length });
});

app.post('/api/register', (req, res) => {
    const { name, email, phone, password } = req.body;
    const vols = readJSON(FILES.volunteers);
    if (vols.find(u => u.name === name && (u.email === email || u.phone === phone))) {
        return res.status(400).json({ error: "الاسم مسجل مسبقاً بهذا البريد" });
    }
    const newUser = { id: "V-" + Date.now(), name, email, phone, password, createdAt: new Date() };
    vols.push(newUser);
    writeJSON(FILES.volunteers, vols);
    res.json({ success: true });
});

// --- 2. ATTENDANCE (THE FIXED LOGIC) ---
app.post('/api/checkin', (req, res) => {
    const logs = readJSON(FILES.attendance);
    const newLog = {
        id: "L-" + Date.now(),
        volunteerId: req.body.volunteerId,
        activity: req.body.activity,
        startTime: Date.now(),
        dateStr: new Date().toLocaleDateString('ar-EG'),
        checkIn: new Date().toLocaleTimeString('ar-EG'),
        duration: 0,
        status: 'active'
    };
    logs.push(newLog);
    writeJSON(FILES.attendance, logs);
    res.json(newLog);
});

app.post('/api/checkout', (req, res) => {
    const logs = readJSON(FILES.attendance);
    const log = logs.find(l => l.volunteerId === req.body.vId && l.status === 'active');
    if (!log) return res.status(400).send("No active session");

    log.status = 'completed';
    log.duration = parseFloat(((Date.now() - log.startTime) / 3600000).toFixed(2));
    log.notes = req.body.notes || "";
    writeJSON(FILES.attendance, logs);
    res.json(log);
});

// --- 3. ADMIN & EXCEL (FIXED DOWNLOAD) ---
app.get('/api/admin/data', (req, res) => {
    const vols = readJSON(FILES.volunteers);
    const logs = readJSON(FILES.attendance);
    res.json({
        vols: vols.map(v => ({ ...v, h: logs.filter(l => l.volunteerId === v.id).reduce((s,l)=>s+l.duration,0) })),
        activeCount: logs.filter(l => l.status === 'active').length
    });
});

app.get('/api/export', async (req, res) => {
    try {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('ساعات المتطوعين');
        sheet.columns = [
            { header: 'التاريخ', key: 'date', width: 15 },
            { header: 'الاسم', key: 'name', width: 25 },
            { header: 'النشاط', key: 'act', width: 20 },
            { header: 'الساعات', key: 'h', width: 10 }
        ];

        const logs = readJSON(FILES.attendance).filter(l => l.status === 'completed');
        const vols = readJSON(FILES.volunteers);

        logs.forEach(l => {
            const v = vols.find(u => u.id === l.volunteerId);
            sheet.addRow({ date: l.dateStr, name: v ? v.name : 'Unknown', act: l.activity, h: l.duration });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=Mersal_Report.xlsx');
        await workbook.xlsx.write(res);
        res.end();
    } catch (e) { res.status(500).send(e.message); }
});

app.listen(PORT, () => console.log(`Mersal Server Live on http://localhost:${PORT}`));
