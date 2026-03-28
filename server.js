const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
// زيادة الحجم للتعامل مع الصور الشخصية Base64
app.use(express.json({ limit: '20mb' }));
app.use(express.static('public'));

const DATA_DIR = path.join(__dirname, 'data');
const FILES = {
    vols: path.join(DATA_DIR, 'volunteers.json'),
    logs: path.join(DATA_DIR, 'attendance.json')
};

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const readJSON = (f) => fs.existsSync(f) ? JSON.parse(fs.readFileSync(f)) : [];
const saveJSON = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2));

// قائمة المسؤولين (Admins)
const ADMIN_EMAILS = ["admin@mersal.org", "mariameltras@gmail.com"];

// --- 1. تسجيل الدخول والمصادقة الذكية ---
app.post('/api/login', (req, res) => {
    const { identifier, password, name } = req.body;
    const vols = readJSON(FILES.vols);
    const logs = readJSON(FILES.logs);

    // البحث بالمطابقة للإيميل أو الهاتف وكلمة المرور
    const matches = vols.filter(u => 
        (u.email === identifier || u.phone === identifier) && u.password === password
    );

    if (matches.length === 0) {
        return res.status(401).json({ error: "بيانات خطأ" });
    }

    // إذا وجد أكثر من بروفايل لنفس الإيميل ولم يتم اختيار الاسم بعد
    if (matches.length > 1 && !name) {
        return res.json({ multi: true, profiles: matches.map(m => m.name) });
    }

    const user = name ? matches.find(m => m.name === name) : matches[0];
    
    // تحديد الصلاحية تلقائياً بناءً على قائمة الـ Admin
    user.role = ADMIN_EMAILS.includes(user.email) ? 'admin' : 'volunteer';

    // حساب إحصائيات الساعات للمستخدم (سواء أدمن أو متطوع)
    const userLogs = logs.filter(l => l.vId === user.id);
    const totalH = userLogs.reduce((s, l) => s + (l.hours || 0), 0);

    const { password: _, ...safeUser } = user;
    res.json({ 
        ...safeUser, 
        totalH: parseFloat(totalH.toFixed(2)), 
        sessions: userLogs.length 
    });
});

// --- 2. تسجيل حساب جديد ---
app.post('/api/register', (req, res) => {
    const vols = readJSON(FILES.vols);
    const { name, email, phone, password } = req.body;
    
    if (vols.find(u => u.name === name && u.email === email)) {
        return res.status(400).json({ error: "هذا الاسم مسجل بالفعل لهذا الإيميل" });
    }

    const newUser = { 
        id: "V" + Date.now(), 
        name, email, phone, password,
        // تسجيل الصلاحية بناءً على قائمة الـ Admin
        role: ADMIN_EMAILS.includes(email) ? 'admin' : 'volunteer',
        createdAt: new Date().toISOString()
    };
    
    vols.push(newUser);
    saveJSON(FILES.vols, vols);
    res.json({ success: true });
});

// --- 3. نظام الحضور والوقت (يعمل للكل) ---
app.post('/api/checkin', (req, res) => {
    const logs = readJSON(FILES.logs);
    const newLog = { 
        id: "L"+Date.now(), 
        vId: req.body.vId, 
        start: Date.now(), 
        end: null, 
        hours: 0, 
        activity: req.body.activity,
        dateStr: new Date().toLocaleDateString('ar-EG')
    };
    logs.push(newLog);
    saveJSON(FILES.logs, logs);
    res.json(newLog);
});

app.post('/api/checkout', (req, res) => {
    const logs = readJSON(FILES.logs);
    const log = logs.find(l => l.vId === req.body.vId && !l.end);
    if (!log) return res.status(400).json({ error: "لا توجد جلسة نشطة" });
    
    log.end = Date.now();
    log.hours = parseFloat(((log.end - log.start) / 3600000).toFixed(2));
    saveJSON(FILES.logs, logs);
    res.json(log);
});

// --- 4. لوحة الإدارة (الأدمن فقط) ---
app.get('/api/admin/stats', (req, res) => {
    const vols = readJSON(FILES.vols);
    const logs = readJSON(FILES.logs);
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

// --- 5. استخراج تقرير الإكسل المتكامل ---
app.get('/api/export', async (req, res) => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('تقرير متطوعي مرسال');
    sheet.columns = [
        { header: 'الاسم', key: 'name', width: 20 },
        { header: 'البريد/الهاتف', key: 'contact', width: 20 },
        { header: 'النشاط', key: 'act', width: 20 },
        { header: 'الساعات', key: 'h', width: 10 },
        { header: 'التاريخ', key: 'd', width: 15 }
    ];
    
    const logs = readJSON(FILES.logs);
    const vols = readJSON(FILES.vols);
    
    logs.filter(l => l.end !== null).forEach(l => {
        const v = vols.find(u => u.id === l.vId);
        sheet.addRow({ 
            name: v?.name || 'محذوف', 
            contact: v ? (v.email || v.phone) : '-',
            act: l.activity, 
            h: l.hours, 
            d: l.dateStr 
        });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Mersal_Report.xlsx');
    await workbook.xlsx.write(res);
    res.end();
});

app.listen(PORT, () => console.log(`🚀 Mersal Pro System is Live on Port ${PORT}`));
