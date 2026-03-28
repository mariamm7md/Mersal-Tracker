const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const app = express();
const PORT = process.env.PORT || 3000;

// إعدادات الوسيط (Middleware)
app.use(cors());
// زيادة الحجم المسموح به لاستقبال الصور الشخصية Base64
app.use(express.json({ limit: '10mb' })); 
app.use(express.static('public'));

// --- التكوين وقواعد البيانات ---
const ADMIN_PASSWORD = "mersal2026admin";
const DATA_DIR = path.join(__dirname, 'data');
const FILES = {
    volunteers: path.join(DATA_DIR, 'volunteers.json'),
    attendance: path.join(DATA_DIR, 'attendance.json'),
    activities: path.join(DATA_DIR, 'activities.json'),
    settings: path.join(DATA_DIR, 'settings.json')
};

// التأكد من وجود المجلد والملفات
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const readJSON = (file) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : [];
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

// تهيئة البيانات الافتراضية إذا كانت فارغة
if (!fs.existsSync(FILES.settings)) writeJSON(FILES.settings, { hoursTarget: 130 });
if (!fs.existsSync(FILES.activities)) writeJSON(FILES.activities, [
    { id: '1', name: 'فرز ملابس' }, 
    { id: '2', name: 'معرض ملابس' }, 
    { id: '3', name: 'تعبئة كراتين' }
]);

// ===================
// مسارات المصادقة (Auth)
// ===================

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const volunteers = readJSON(FILES.volunteers);
    const user = volunteers.find(u => u.email === email && u.password === password);
    
    if (user) {
        const attendance = readJSON(FILES.attendance);
        // حساب إجمالي الساعات وعدد الجلسات فور تسجيل الدخول
        const userLogs = attendance.filter(a => a.volunteerId === user.id);
        const totalHours = userLogs.reduce((sum, log) => sum + (log.duration || 0), 0);
        
        const { password, ...safeUser } = user;
        res.json({ ...safeUser, totalHours, totalSessions: userLogs.length });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

app.post('/api/register', (req, res) => {
    const volunteers = readJSON(FILES.volunteers);
    const { name, email, password } = req.body;

    if (volunteers.find(u => u.email === email)) {
        return res.status(400).json({ error: 'البريد الإلكتروني مسجل مسبقاً' });
    }

    const newUser = { 
        id: Date.now().toString(), 
        name, 
        email, 
        password, 
        avatar: null, 
        createdAt: new Date().toISOString() 
    };
    
    volunteers.push(newUser);
    writeJSON(FILES.volunteers, volunteers);
    res.json({ success: true });
});

// ===================
// الحضور والتحكم بالوقت
// ===================

// تسجيل الدخول (Start Timer)
app.post('/api/attendance/checkin', (req, res) => {
    const attendance = readJSON(FILES.attendance);
    const { volunteerId, activityName } = req.body;
    const now = new Date();
    
    const record = {
        id: Date.now().toString(),
        volunteerId,
        dateStr: now.toISOString().split('T')[0],
        checkIn: now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        checkInTime: now.getTime(),
        checkOut: null, 
        duration: 0, 
        activityName: activityName || 'General',
        feedback: '',
        status: 'active'
    };
    
    attendance.push(record);
    writeJSON(FILES.attendance, attendance);
    res.json(record);
});

// تسجيل الخروج (Stop Timer & Save)
app.post('/api/attendance/checkout', (req, res) => {
    const attendance = readJSON(FILES.attendance);
    const { volunteerId, feedback } = req.body;
    const now = new Date();
    
    const record = attendance.find(r => r.volunteerId === volunteerId && !r.checkOut);
    if (!record) return res.status(400).json({ error: 'لا توجد جلسة نشطة حالياً' });
    
    record.checkOut = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    // حساب الساعات (الفرق بالملي ثانية / 3600000)
    const diffHours = (now.getTime() - record.checkInTime) / 3600000;
    record.duration = parseFloat(diffHours.toFixed(2));
    record.feedback = feedback || '';
    record.status = 'completed';
    
    writeJSON(FILES.attendance, attendance);
    res.json(record);
});

// الإضافة اليدوية لساعات سابقة
app.post('/api/attendance/manual', (req, res) => {
    const attendance = readJSON(FILES.attendance);
    const { volunteerId, date, checkIn, checkOut, activityName, feedback } = req.body;
    
    // حساب الفرق الزمني يدوياً
    const start = new Date(`${date}T${checkIn}`);
    const end = new Date(`${date}T${checkOut}`);
    let duration = (end - start) / 3600000;
    
    // معالجة إذا كان العمل تخطى منتصف الليل
    if (duration < 0) duration += 24;

    const record = {
        id: Date.now().toString(),
        volunteerId,
        dateStr: date,
        checkIn,
        checkOut,
        duration: parseFloat(duration.toFixed(2)),
        type: 'manual',
        activityName: activityName || 'General',
        feedback: feedback || ''
    };
    
    attendance.push(record);
    writeJSON(FILES.attendance, attendance);
    res.json({ success: true, record });
});

// ===================
// الملف الشخصي والإدارة
// ===================

app.post('/api/user/update', (req, res) => {
    let volunteers = readJSON(FILES.volunteers);
    const { userId, name, avatar } = req.body;
    const index = volunteers.findIndex(v => v.id === userId);
    
    if (index !== -1) {
        if (name) volunteers[index].name = name;
        if (avatar) volunteers[index].avatar = avatar; // تخزين Base64
        writeJSON(FILES.volunteers, volunteers);
        res.json({ success: true, user: volunteers[index] });
    } else res.status(404).json({ error: 'المستخدم غير موجود' });
});

app.get('/api/admin/stats', (req, res) => {
    const volunteers = readJSON(FILES.volunteers);
    const attendance = readJSON(FILES.attendance);
    const settings = readJSON(FILES.settings);
    
    res.json({
        totalVolunteers: volunteers.length,
        totalHours: attendance.reduce((s, r) => s + (r.duration || 0), 0).toFixed(1),
        activeSessions: attendance.filter(r => !r.checkOut).length,
        hoursTarget: settings.hoursTarget
    });
});

// تصدير التقارير للإكسل
app.get('/api/export', async (req, res) => {
    const volunteers = readJSON(FILES.volunteers);
    const attendance = readJSON(FILES.attendance);
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Volunteer Report');

    worksheet.columns = [
        { header: 'التاريخ', key: 'date', width: 15 },
        { header: 'الاسم', key: 'name', width: 25 },
        { header: 'النشاط', key: 'activity', width: 20 },
        { header: 'وقت الدخول', key: 'in', width: 12 },
        { header: 'وقت الخروج', key: 'out', width: 12 },
        { header: 'عدد الساعات', key: 'hours', width: 12 },
        { header: 'ملاحظات', key: 'note', width: 30 }
    ];

    // تنسيق العنوان
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };

    attendance.forEach(log => {
        const user = volunteers.find(v => v.id === log.volunteerId) || { name: 'Unknown' };
        worksheet.addRow({
            date: log.dateStr,
            name: user.name,
            activity: log.activityName,
            in: log.checkIn,
            out: log.checkOut || 'Pending',
            hours: log.duration,
            note: log.feedback
        });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Mersal_Report_2026.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
});

app.listen(PORT, () => console.log(`🚀 Mersal Server Live on port ${PORT}`));
