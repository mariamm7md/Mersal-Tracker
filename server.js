const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static('public'));

const DATA_DIR = path.join(__dirname, 'data');
const FILES = {
    vols: path.join(DATA_DIR, 'volunteers.json'),
    logs: path.join(DATA_DIR, 'attendance.json')
};

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
const read = (f) => fs.existsSync(f) ? JSON.parse(fs.readFileSync(f)) : [];
const save = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2));

// قائمة الإيميلات التي لها صلاحيات أدمن تلقائياً
const ADMIN_EMAILS = ["admin@mersal.org", "mariameltras@gmail.com"];

// --- API LOGIN ---
app.post('/api/login', (req, res) => {
    const { identifier, password, name } = req.body;
    const vols = read(FILES.vols);
    
    const matches = vols.filter(u => (u.email === identifier || u.phone === identifier) && u.password === password);

    if (matches.length === 0) return res.status(401).json({ error: "بيانات خطأ" });
    if (matches.length > 1 && !name) return res.json({ multi: true, profiles: matches.map(m => m.name) });

    let user = name ? matches.find(m => m.name === name) : matches[0];
    
    // التحقق من الصلاحية: إذا كان الإيميل في القائمة، اجعل الـ role هو admin
    if (ADMIN_EMAILS.includes(user.email)) {
        user.role = 'admin';
    } else {
        user.role = 'volunteer';
    }

    const logs = read(FILES.logs).filter(l => l.vId === user.id);
    user.totalH = logs.reduce((s, l) => s + (l.hours || 0), 0);
    user.sessions = logs.length;
    
    res.json(user);
});

// --- API REGISTER ---
app.post('/api/register', (req, res) => {
    const vols = read(FILES.vols);
    const { name, email, phone, password } = req.body;
    
    if (vols.find(u => u.name === name && u.email === email)) {
        return res.status(400).json({ error: "هذا الاسم مسجل بالفعل لهذا الإيميل" });
    }

    const newUser = { 
        id: "V" + Date.now(), 
        name, email, phone, password,
        role: ADMIN_EMAILS.includes(email) ? 'admin' : 'volunteer'
    };
    
    vols.push(newUser);
    save(FILES.vols, vols);
    res.json({ success: true });
});

// --- ATTENDANCE ---
app.post('/api/checkin', (req, res) => {
    const logs = read(FILES.logs);
    const newLog = { 
        id: "L"+Date.now(), 
        vId: req.body.vId, 
        start: Date.now(), 
        end: null, hours: 0, 
        activity: req.body.activity 
    };
    logs.push(newLog);
    save(FILES.logs, logs);
    res.json(newLog);
});

app.post('/api/checkout', (req, res) => {
    const logs = read(FILES.logs);
    const log = logs.find(l => l.vId === req.body.vId && !l.end);
    if (!log) return res.status(400).send();
    log.end = Date.now();
    log.hours = parseFloat(((log.end - log.start) / 3600000).toFixed(2));
    save(FILES.logs, logs);
    res.json(log);
});

// --- ADMIN STATS ---
app.get('/api/admin/stats', (req, res) => {
    const vols = read(FILES.vols);
    const logs = read(FILES.logs);
    res.json({
        totalV: vols.length,
        totalH: logs.reduce((s,l) => s + l.hours, 0).toFixed(1),
        active: logs.filter(l => !l.end).length,
        vols: vols.map(v => ({
            ...v,
            h: logs.filter(l => l.vId === v.id).reduce((s,l)=>s+l.hours, 0)
        }))
    });
});

// --- EXCEL EXPORT ---
app.get('/api/export', async (req, res) => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Report');
    sheet.columns = [
        { header: 'الاسم', key: 'name', width: 20 },
        { header: 'النشاط', key: 'act', width: 20 },
        { header: 'الساعات', key: 'h', width: 10 },
        { header: 'التاريخ', key: 'd', width: 15 }
    ];
    const logs = read(FILES.logs);
    const vols = read(FILES.vols);
    logs.forEach(l => {
        const v = vols.find(u => u.id === l.vId);
        if(l.end) sheet.addRow({ name: v?.name, act: l.activity, h: l.hours, d: new Date(l.start).toLocaleDateString('ar-EG') });
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Mersal_Report.xlsx');
    await workbook.xlsx.write(res);
    res.end();
});

app.listen(3000, () => console.log("Mersal Pro Server Live"));
