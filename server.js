const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const app = express();
const PORT = process.env.PORT || 3000;

// --- الإعدادات والتحميل ---
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static('public'));

const DATA_DIR = path.join(__dirname, 'data');
const FILES = {
    vols: path.join(DATA_DIR, 'volunteers.json'),
    logs: path.join(DATA_DIR, 'attendance.json')
};

// التأكد من وجود المجلد والملفات
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const readJSON = (f) => fs.existsSync(f) ? JSON.parse(fs.readFileSync(f)) : [];
const saveJSON = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2));

// قائمة المسؤولين (Admins) المحددة من قبلك
const ADMIN_EMAILS = ["admin@mersal.org", "mariameltras@gmail.com"];

// ===============================
// 1. نظام تسجيل الدخول والتحقق
// ===============================

app.post('/api/login', (req, res) => {
    const { identifier, password, name } = req.body;
    const vols = readJSON(FILES.vols);
    const logs = readJSON(FILES.logs);

    // البحث عن مستخدمين بمطابقة الإيميل أو الهاتف مع كلمة المرور
    const matches = vols.filter(u => 
        (u.email === identifier || u.phone === identifier) && u.password === password
    );

    if (matches.length === 0) {
        return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
    }

    // إذا وجد أكثر من شخص بنفس الإيميل (حساب مشترك) ولم يحدد الاسم بعد
    if (matches.length > 1 && !name) {
        return res.json({ multi: true, profiles: matches.map(m => m.name) });
    }

    // اختيار الحساب الصحيح
    let user = name ? matches.find(m => m.name === name) : matches[0];

    // تحديث رتبة المستخدم بناءً على قائمة الـ Admin
    if (ADMIN_EMAILS.includes(user.email)) {
        user.role = 'admin';
    } else {
        user.role = 'volunteer';
    }

    // حساب إحصائيات الساعات الحالية للمستخدم
    const userLogs = logs.filter(l => l.vId === user.id);
    const totalH = userLogs.reduce((sum, log) => sum + (log.hours || 0), 0);

    // إرسال البيانات (بدون كلمة المرور للأمان)
    const { password: _, ...safeUser } = user;
    res.json({ 
        ...safeUser, 
        totalH: parseFloat(totalH.toFixed(2)), 
        sessions: userLogs.length 
    });
});

// ===============================
// 2. تسجيل حساب جديد
// ===============================

app.post('/api/register', (req, res) => {
    const { name, email, phone, password } = req.body;
    const vols = readJSON(FILES.vols);

    // منع تكرار الاسم مع نفس الإيميل
    const existing = vols.find(u => u.name === name && u.email === email);
    if (existing) {
        return res.status(400).json({ error: "هذا الاسم مسجل بالفعل لهذا البريد الإلكتروني" });
    }

    const newUser = {
        id: "V-" + Date.now(),
        name,
        email: email || null,
        phone: phone || null,
        password,
        role: ADMIN_EMAILS.includes(email) ? 'admin' : 'volunteer',
        createdAt: new Date().toISOString()
    };

    vols.push(newUser);
    saveJSON(FILES.vols, vols);
    res.json({ success: true });
});

// ===============================
// 3. نظام الحضور والوقت (التايمر)
// ===============================

app.post('/api/checkin', (req, res) => {
    const logs = readJSON(FILES.logs);
    const { vId, activity } = req.body;

    const newLog = {
        id: "L-" + Date.now(),
        vId,
        activity: activity || "نشاط عام",
        start: Date.now(),
        end: null,
        hours: 0,
        dateStr: new Date().toLocaleDateString('ar-EG')
    };

    logs.push(newLog);
    saveJSON(FILES.logs, logs);
    res.json(newLog);
});

app.post('/api/checkout', (req, res) => {
    const logs = readJSON(FILES.logs);
    const { vId } = req.body;

    // البحث عن آخر جلسة لم تنتهِ لهذا المستخدم
    const logIndex = logs.findIndex(l => l.vId === vId && l.end === null);
    
    if (logIndex === -1) return res.status(400).json({ error: "لا توجد جلسة نشطة" });

    const log = logs[logIndex];
    log.end = Date.now();
    // حساب الفرق بالساعات (ملي ثانية / 3,600,000)
    const durationMs = log.end - log.start;
    log.hours = parseFloat((durationMs / 3600000).toFixed(2));

    saveJSON(FILES.logs, logs);
    res.json(log);
});

// ===============================
// 4. إحصائيات الإدارة والـ Excel
// ===============================

app.get('/api/admin/stats', (req, res) => {
    const vols = readJSON(FILES.vols);
    const logs = readJSON(FILES.logs);

    const stats = {
        totalV: vols.length,
        totalH: logs.reduce((s, l) => s + (l.hours || 0), 0).toFixed(1),
        active: logs.filter(l => l.end === null).length,
        vols: vols.map(v => {
            const userLogs = logs.filter(l => l.vId === v.id);
            return {
                id: v.id,
                name: v.name,
                email: v.email,
                phone: v.phone,
                role: v.role,
                h: userLogs.reduce((s, l) => s + (l.hours || 0), 0)
            };
        })
    };

    res.json(stats);
});

app.get('/api/export', async (req, res) => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('تقرير متطوعي مرسال');
    
    sheet.columns = [
        { header: 'الاسم', key: 'name', width: 25 },
        { header: 'البريد/الهاتف', key: 'contact', width: 25 },
        { header: 'النشاط', key: 'activity', width: 20 },
        { header: 'التاريخ', key: 'date', width: 15 },
        { header: 'الساعات', key: 'hours', width: 10 }
    ];

    const logs = readJSON(FILES.logs);
    const vols = readJSON(FILES.vols);

    logs.filter(l => l.end !== null).forEach(log => {
        const user = vols.find(v => v.id === log.vId);
        sheet.addRow({
            name: user ? user.name : "مستخدم محذوف",
            contact: user ? (user.email || user.phone) : "-",
            activity: log.activity,
            date: log.dateStr,
            hours: log.hours
        });
    });

    // تنسيق العنوان
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = { type: 'pattern', pattern:'solid', fgColor:{argb:'FFD3D3D3'} };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Mersal_Volunteers_2026.xlsx');
    
    await workbook.xlsx.write(res);
    res.end();
});

// --- تشغيل السيرفر ---
app.listen(PORT, () => {
    console.log(`
    =========================================
    ✅ Mersal System is Live on Port ${PORT}
    🛡️ Admins: admin@mersal.org, mariameltras@gmail.com
    📁 Data is stored in: ${DATA_DIR}
    =========================================
    `);
});
