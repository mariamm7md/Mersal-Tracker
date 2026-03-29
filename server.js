const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' })); // لدعم رفع الصور
app.use(express.static('public'));

// --- Configuration ---
const ADMIN_ACCOUNTS = [
    { username: 'admin', email: 'admin', password: 'mersal2026' },
    { username: 'mariameltras@gmail.com', email: 'mariameltras@gmail.com', password: 'mersal2026' }
];

const DATA_DIR = path.join(__dirname, 'data');
const FILES = {
    volunteers: path.join(DATA_DIR, 'volunteers.json'),
    attendance: path.join(DATA_DIR, 'attendance.json'),
    activities: path.join(DATA_DIR, 'activities.json'),
    logs: path.join(DATA_DIR, 'audit_logs.json')
};

// --- Helpers ---
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const readJSON = (file) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : [];
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

// Initialize Default Activities with Colors and Schedule
if (!fs.existsSync(FILES.activities)) writeJSON(FILES.activities, [
    { id: '1', name: 'فرز الملابس', color: '#3b82f6', schedule: { days: ['Sun', 'Mon', 'Wed'], time: '09:00-12:00' } },
    { id: '2', name: 'معرض الملابس', color: '#8b5cf6', schedule: { days: ['Tue', 'Thu'], time: '10:00-14:00' } },
    { id: '3', name: 'صيدلية مرسال', color: '#10b981', schedule: { days: ['Sat', 'Mon'], time: '09:00-17:00' } },
    { id: '4', name: 'دار الضيافة', color: '#f59e0b', schedule: { days: ['All'], time: 'Flexible' } }
]);
if (!fs.existsSync(FILES.logs)) writeJSON(FILES.logs, []);

function logAction(adminEmail, action, details) {
    const logs = readJSON(FILES.logs);
    logs.push({ id: Date.now().toString(), timestamp: new Date().toISOString(), adminEmail, action, details });
    writeJSON(FILES.logs, logs);
}

// ===================
// AUTH ROUTE (Unified)
// ===================
app.post('/api/login', (req, res) => {
    const { identifier, password } = req.body;

    // 1. Check Admin
    const admin = ADMIN_ACCOUNTS.find(acc => 
        (acc.username === identifier || acc.email === identifier) && acc.password === password
    );
    if (admin) return res.json({ role: 'admin', name: 'Admin', email: admin.email });

    // 2. Check User
    const volunteers = readJSON(FILES.volunteers);
    const user = volunteers.find(u => 
        (u.email === identifier || u.phone === identifier) && u.password === password
    );
    if (user) {
        const { password, ...safeUser } = user;
        return res.json({ role: 'user', ...safeUser });
    }

    res.status(401).json({ error: 'Invalid credentials' });
});

// ===================
// USER ROUTES
// ===================

app.post('/api/register', (req, res) => {
    const volunteers = readJSON(FILES.volunteers);
    const { name, email, phone, password } = req.body;

    if (volunteers.find(u => u.email === email || (phone && u.phone === phone))) {
        return res.status(400).json({ error: 'Email or Phone already exists' });
    }

    const user = { 
        id: Date.now().toString(), 
        name, email, phone, password, 
        avatar: null, points: 0, badges: [], 
        createdAt: new Date().toISOString() 
    };
    volunteers.push(user);
    writeJSON(FILES.volunteers, volunteers);
    
    const { password: pwd, ...safeUser } = user;
    res.json({ role: 'user', ...safeUser });
});

// Profile Update (Name & Avatar)
app.post('/api/user/profile', (req, res) => {
    let volunteers = readJSON(FILES.volunteers);
    const { userId, name, avatar } = req.body;
    const index = volunteers.findIndex(v => v.id === userId);
    
    if (index !== -1) {
        if (name) volunteers[index].name = name;
        if (avatar) volunteers[index].avatar = avatar;
        writeJSON(FILES.volunteers, volunteers);
        const { password, ...safeUser } = volunteers[index];
        return res.json(safeUser);
    }
    res.status(404).json({ error: 'User not found' });
});

app.get('/api/activities', (req, res) => res.json(readJSON(FILES.activities)));

// Check In
app.post('/api/attendance/checkin', (req, res) => {
    const attendance = readJSON(FILES.attendance);
    const { volunteerId, activityName } = req.body;
    const now = new Date();
    
    const record = {
        id: Date.now().toString(),
        volunteerId, activityName: activityName || 'General',
        dateStr: now.toISOString().split('T')[0],
        checkIn: now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        checkInTime: now.getTime(),
        checkOut: null, duration: 0, type: 'live', feedback: '', status: 'present'
    };
    
    attendance.push(record);
    writeJSON(FILES.attendance, attendance);
    res.json({ success: true, record });
});

// Check Out
app.post('/api/attendance/checkout', (req, res) => {
    const attendance = readJSON(FILES.attendance);
    let volunteers = readJSON(FILES.volunteers);
    const { volunteerId, feedback } = req.body;
    const now = new Date();
    const record = attendance.find(r => r.volunteerId === volunteerId && !r.checkOut);
    
    if (!record) return res.status(400).json({ error: 'No active session' });
    
    record.checkOut = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    record.duration = Math.round((now.getTime() - record.checkInTime) / 3600000 * 10) / 10;
    record.feedback = feedback || '';
    
    // Add Points (10 points per hour)
    const vIndex = volunteers.findIndex(v => v.id === volunteerId);
    if (vIndex !== -1) {
        const points = Math.round(record.duration * 10);
        volunteers[vIndex].points = (volunteers[vIndex].points || 0) + points;
        // Add Badge logic
        if (volunteers[vIndex].points >= 100 && !volunteers[vIndex].badges.includes('Bronze')) volunteers[vIndex].badges.push('Bronze');
        if (volunteers[vIndex].points >= 500 && !volunteers[vIndex].badges.includes('Silver')) volunteers[vIndex].badges.push('Silver');
        writeJSON(FILES.volunteers, volunteers);
    }

    writeJSON(FILES.attendance, attendance);
    res.json(record);
});

// Manual Entry
app.post('/api/attendance/manual', (req, res) => {
    const attendance = readJSON(FILES.attendance);
    const { volunteerId, date, checkIn, checkOut, activityName, feedback } = req.body;
    
    const start = new Date(`${date}T${checkIn}`);
    const end = new Date(`${date}T${checkOut}`);
    const duration = Math.round((end - start) / 3600000 * 10) / 10;

    attendance.push({
        id: Date.now().toString(),
        volunteerId, dateStr: date, checkIn, checkOut, duration,
        type: 'manual', activityName: activityName || 'General', feedback: feedback || '', status: 'present'
    });

    writeJSON(FILES.attendance, attendance);
    res.json({ success: true });
});

// Apology Entry
app.post('/api/attendance/apology', (req, res) => {
    const attendance = readJSON(FILES.attendance);
    const { volunteerId, date, reason } = req.body;

    attendance.push({
        id: Date.now().toString(),
        volunteerId, dateStr: date,
        checkIn: null, checkOut: null, duration: 0,
        type: 'apology', activityName: 'N/A', feedback: reason, status: 'apologized'
    });

    writeJSON(FILES.attendance, attendance);
    res.json({ success: true });
});

app.get('/api/attendance/:id', (req, res) => {
    const att = readJSON(FILES.attendance).filter(r => r.volunteerId === req.params.id).reverse();
    res.json(att);
});

// ===================
// ADMIN ROUTES
// ===================

app.get('/api/admin/stats', (req, res) => {
    const volunteers = readJSON(FILES.volunteers);
    const attendance = readJSON(FILES.attendance);
    const today = new Date().toISOString().split('T')[0];
    res.json({
        totalVolunteers: volunteers.length,
        totalHours: attendance.filter(a => a.status === 'present').reduce((s, r) => s + (r.duration || 0), 0).toFixed(1),
        activeToday: attendance.filter(r => r.dateStr === today && r.status === 'present' && !r.checkOut).length,
        apologiesCount: attendance.filter(a => a.status === 'apologized').length
    });
});

app.get('/api/admin/data', (req, res) => {
    res.json({
        volunteers: readJSON(FILES.volunteers),
        attendance: readJSON(FILES.attendance),
        activities: readJSON(FILES.activities),
        logs: readJSON(FILES.logs)
    });
});

// Admin Add Activity
app.post('/api/admin/activity', (req, res) => {
    const { adminEmail, name, color, schedule } = req.body;
    const activities = readJSON(FILES.activities);
    activities.push({ id: Date.now().toString(), name, color: color || '#64748b', schedule });
    writeJSON(FILES.activities, activities);
    logAction(adminEmail, "Add Activity", `Added ${name}`);
    res.json(activities);
});

// Admin Edit/Delete User & Export kept similar...
// (Abbreviated for brevity, assume previous logic exists)
app.post('/api/admin/user/edit', (req, res) => {
    const { adminEmail, userId, name, email, phone, activity } = req.body;
    let volunteers = readJSON(FILES.volunteers);
    const index = volunteers.findIndex(v => v.id === userId);
    if (index !== -1) {
        volunteers[index] = { ...volunteers[index], name, email, phone, activity };
        writeJSON(FILES.volunteers, volunteers);
        logAction(adminEmail, "Edit User", `Updated ${name}`);
        res.json({ success: true });
    } else res.status(404).json({ error: 'Not found' });
});

app.delete('/api/admin/user', (req, res) => {
    const { adminEmail, userId } = req.body;
    let volunteers = readJSON(FILES.volunteers).filter(v => v.id !== userId);
    let attendance = readJSON(FILES.attendance).filter(a => a.volunteerId !== userId);
    writeJSON(FILES.volunteers, volunteers);
    writeJSON(FILES.attendance, attendance);
    logAction(adminEmail, "Delete User", `Deleted ID ${userId}`);
    res.json({ success: true });
});

app.get('/api/export', async (req, res) => {
    const volunteers = readJSON(FILES.volunteers);
    const attendance = readJSON(FILES.attendance);
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Mersal Report');
    worksheet.columns = [
        { header: 'Date', key: 'date', width: 12 }, { header: 'Name', key: 'name', width: 20 },
        { header: 'Activity', key: 'activity', width: 20 }, { header: 'Status', key: 'status', width: 10 },
        { header: 'In', key: 'in', width: 8 }, { header: 'Out', key: 'out', width: 8 }, 
        { header: 'Hours', key: 'hours', width: 8 }, { header: 'Feedback', key: 'feedback', width: 30 }
    ];
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563eb' } };
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    
    attendance.forEach(log => {
        const user = volunteers.find(v => v.id === log.volunteerId) || {};
        worksheet.addRow({ 
            date: log.dateStr, name: user.name, activity: log.activityName, status: log.status,
            in: log.checkIn || '-', out: log.checkOut || '-', hours: log.duration || 0, feedback: log.feedback 
        });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Mersal_Report.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
