const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '20mb' })); // زيادة الحد لصور الرمزية (Base64)
app.use(express.static('public'));

// --- الإعدادات والمجلدات ---
const ADMIN_PASSWORD = "mersal2026admin";
const DATA_DIR = path.join(__dirname, 'data');
const FILES = {
    volunteers: path.join(DATA_DIR, 'volunteers.json'),
    attendance: path.join(DATA_DIR, 'attendance.json'),
    activities: path.join(DATA_DIR, 'activities.json'),
    settings: path.join(DATA_DIR, 'settings.json')
};

// --- وظائف مساعدة للتعامل مع الملفات ---
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const readJSON = (file) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : [];
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

// إعداد القيم الافتراضية
if (!fs.existsSync(FILES.settings)) writeJSON(FILES.settings, { hoursTarget: 130 });
if (!fs.existsSync(FILES.activities)) {
    writeJSON(FILES.activities, [
        { id: '1', name: 'Medical Services' }, 
        { id: '2', name: 'Education' }, 
        { id: '3', name: 'Warehouse Logistics' }
    ]);
}

// =============================
// نظام المصادقة (دخول بريد أو هاتف)
// =============================

app.post('/api/login', (req, res) => {
    const { email, password } = req.body; // الحقل 'email' قد يحتوي على البريد أو الهاتف
    const volunteers = readJSON(FILES.volunteers);
    
    // البحث بالمطابقة مع البريد الإلكتروني أو رقم الهاتف
    const user = volunteers.find(u => 
        (u.email === email || u.phone === email) && u.password === password
    );

    if (user) {
        const { password, ...safeUser } = user;
        res.json(safeUser);
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

app.post('/api/register', (req, res) => {
    const volunteers = readJSON(FILES.volunteers);
    const { name, email, phone, password } = req.body;

    // التحقق من تكرار البيانات
    if (volunteers.find(u => u.email === email || u.phone === phone)) {
        return res.status(400).json({ error: 'User with this email or phone already exists' });
    }

    const user = { 
        id: Date.now().toString(), 
        name, 
        email,
        phone,
        password, 
        avatar: null, 
        createdAt: new Date().toISOString() 
    };
    
    volunteers.push(user);
    writeJSON(FILES.volunteers, volunteers);
    
    const { password: pwd, ...safeUser } = user;
    res.json(safeUser);
});

// =============================
// إدارة الملف الشخصي (Profile)
// =============================

app.post('/api/user/update', (req, res) => {
    let volunteers = readJSON(FILES.volunteers);
    const { userId, name, email, phone } = req.body;
    const index = volunteers.findIndex(v => v.id === userId);
    
    if (index !== -1) {
        if (name) volunteers[index].name = name;
        if (email) volunteers[index].email = email;
        if (phone) volunteers[index].phone = phone;
        
        writeJSON(FILES.volunteers, volunteers);
        const { password, ...safeUser } = volunteers[index];
        res.json(safeUser);
    } else res.status(404).json({ error: 'User not found' });
});

app.post('/api/user/avatar', (req, res) => {
    let volunteers = readJSON(FILES.volunteers);
    const { userId, avatar } = req.body;
    const index = volunteers.findIndex(v => v.id === userId);
    if (index !== -1) {
        volunteers[index].avatar = avatar;
        writeJSON(FILES.volunteers, volunteers);
        res.json({ success: true });
    } else res.status(404).json({ error: 'User not found' });
});

// =============================
// نظام تسجيل الحضور (Attendance)
// =============================

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
        type: 'live',
        activityName: activityName || 'General',
        feedback: ''
    };
    
    attendance.push(record);
    writeJSON(FILES.attendance, attendance);
    res.json(record);
});

app.post('/api/attendance/checkout', (req, res) => {
    const attendance = readJSON(FILES.attendance);
    const { volunteerId, feedback } = req.body;
    const now = new Date();
    const record = attendance.find(r => r.volunteerId === volunteerId && !r.checkOut);
    
    if (!record) return res.status(400).json({ error: 'No active session found' });
    
    record.checkOut = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    // حساب المدة بالساعات
    record.duration = Math.max(0.1, Math.round((now.getTime() - record.checkInTime) / 3600000 * 10) / 10);
    record.feedback = feedback || '';
    
    writeJSON(FILES.attendance, attendance);
    res.json(record);
});

app.get('/api/attendance/:userId', (req, res) => {
    const attendance = readJSON(FILES.attendance);
    const userRecords = attendance.filter(r => r.volunteerId === req.params.userId).reverse();
    res.json(userRecords);
});

// =============================
// مسارات الإدارة (Admin Panel)
// =============================

app.post('/api/admin/settings', (req, res) => {
    const { hoursTarget } = req.body;
    const settings = { hoursTarget: parseInt(hoursTarget) || 130 };
    writeJSON(FILES.settings, settings);
    res.json(settings);
});

app.get('/api/admin/stats', (req, res) => {
    const volunteers = readJSON(FILES.volunteers);
    const attendance = readJSON(FILES.attendance);
    const settings = readJSON(FILES.settings);
    const today = new Date().toISOString().split('T')[0];
    
    res.json({
        totalVolunteers: volunteers.length,
        totalHours: attendance.reduce((s, r) => s + (parseFloat(r.duration) || 0), 0).toFixed(1),
        activeToday: attendance.filter(r => r.dateStr === today).length,
        hoursTarget: settings.hoursTarget
    });
});

// تصدير البيانات إلى إكسل مع دعم رقم الهاتف
app.get('/api/export', async (req, res) => {
    const volunteers = readJSON(FILES.volunteers);
    const attendance = readJSON(FILES.attendance);
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Mersal Volunteers Report');

    worksheet.columns = [
        { header: 'Date', key: 'date', width: 12 },
        { header: 'Volunteer Name', key: 'name', width: 25 },
        { header: 'Phone', key: 'phone', width: 15 },
        { header: 'Activity', key: 'activity', width: 20 },
        { header: 'Check In', key: 'in', width: 10 },
        { header: 'Check Out', key: 'out', width: 10 },
        { header: 'Total Hours', key: 'hours', width: 12 },
        { header: 'Feedback', key: 'feedback', width: 30 }
    ];

    // تنسيق العنوان
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };

    attendance.forEach(log => {
        const user = volunteers.find(v => v.id === log.volunteerId) || {};
        worksheet.addRow({
            date: log.dateStr,
            name: user.name || 'Unknown',
            phone: user.phone || 'N/A',
            activity: log.activityName,
            in: log.checkIn,
            out: log.checkOut || 'In Progress',
            hours: log.duration || 0,
            feedback: log.feedback
        });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Mersal_Report_2026.xlsx"');
    
    await workbook.xlsx.write(res);
    res.end();
});

app.listen(PORT, () => console.log(`🚀 Server ready on port ${PORT}`));
