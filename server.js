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

// --- Configuration ---
const ADMIN_CREDENTIALS = [
    { username: 'admin', password: 'mersal2026', name: 'System Admin' },
    { username: 'mariameltras@gmail.com', password: 'mersal2026', name: 'Mariam Eltras' }
];

const DATA_DIR = path.join(__dirname, 'data');
const FILES = {
    volunteers: path.join(DATA_DIR, 'volunteers.json'),
    attendance: path.join(DATA_DIR, 'attendance.json'),
    activities: path.join(DATA_DIR, 'activities.json'),
    logs: path.join(DATA_DIR, 'audit_logs.json'),
    announcements: path.join(DATA_DIR, 'announcements.json')
};

// --- Helpers ---
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const readJSON = (file) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : [];
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

// Initialize Default Data
if (!fs.existsSync(FILES.activities)) writeJSON(FILES.activities, [
    { id: '1', name: 'فرز الملابس', color: '#3b82f6', schedule: { days: ['الأحد', 'الاثنين'], time: '09:00 - 12:00' } },
    { id: '2', name: 'معرض الملابس', color: '#8b5cf6', schedule: { days: ['الثلاثاء'], time: '10:00 - 14:00' } },
    { id: '3', name: 'صيدلية مرسال', color: '#10b981', schedule: { days: ['الأربعاء', 'الخميس'], time: '09:00 - 17:00' } },
    { id: '4', name: 'دار الضيافة', color: '#f59e0b', schedule: { days: ['يومياً'], time: 'مرن' } }
]);
if (!fs.existsSync(FILES.logs)) writeJSON(FILES.logs, []);
if (!fs.existsSync(FILES.announcements)) writeJSON(FILES.announcements, []);

function logAction(actor, action, details) {
    const logs = readJSON(FILES.logs);
    logs.push({ id: Date.now(), timestamp: new Date().toISOString(), actor, action, details });
    writeJSON(FILES.logs, logs);
}

// ===================
// AUTH ROUTE
// ===================
app.post('/api/login', (req, res) => {
    const { identifier, password } = req.body;

    // Check Admin
    const admin = ADMIN_CREDENTIALS.find(a => a.username === identifier && a.password === password);
    if (admin) return res.json({ role: 'admin', name: admin.name, email: admin.username });

    // Check User
    const users = readJSON(FILES.volunteers);
    const user = users.find(u => (u.email === identifier || u.phone === identifier) && u.password === password);
    if (user) {
        const { password, ...safe } = user;
        return res.json({ role: 'user', ...safe });
    }

    res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
});

app.post('/api/register', (req, res) => {
    const users = readJSON(FILES.volunteers);
    const { name, email, phone, password } = req.body;
    if (users.find(u => u.email === email)) return res.status(400).json({ error: 'البريد الإلكتروني مسجل مسبقاً' });
    
    const user = { id: Date.now().toString(), name, email, phone, password, avatar: null, points: 0, createdAt: new Date().toISOString() };
    users.push(user);
    writeJSON(FILES.volunteers, users);
    const { password: p, ...safe } = user;
    res.json({ role: 'user', ...safe });
});

// ===================
// DATA ROUTES
// ===================

app.get('/api/activities', (req, res) => res.json(readJSON(FILES.activities)));

// User Specific Data
app.get('/api/user/data/:id', (req, res) => {
    const logs = readJSON(FILES.attendance).filter(a => a.volunteerId === req.params.id).reverse();
    const user = readJSON(FILES.volunteers).find(u => u.id === req.params.id);
    res.json({ logs, points: user?.points || 0 });
});

// Leaderboard
app.get('/api/leaderboard', (req, res) => {
    const users = readJSON(FILES.volunteers);
    const sorted = users.sort((a, b) => (b.points || 0) - (a.points || 0)).slice(0, 10);
    res.json(sorted);
});

// Announcements
app.get('/api/announcements', (req, res) => res.json(readJSON(FILES.announcements).reverse()));

// Attendance: Check In
app.post('/api/attendance/checkin', (req, res) => {
    const att = readJSON(FILES.attendance);
    const { volunteerId, activityName } = req.body;
    const now = new Date();
    if (att.find(a => a.volunteerId === volunteerId && !a.checkOut)) return res.status(400).json({ error: 'يوجد جلسة نشطة بالفعل' });
    
    const record = {
        id: Date.now().toString(), volunteerId, activityName,
        dateStr: now.toISOString().split('T')[0],
        checkIn: now.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'}),
        checkInTime: now.getTime(),
        checkOut: null, duration: 0, status: 'present', type: 'live'
    };
    att.push(record);
    writeJSON(FILES.attendance, att);
    res.json(record);
});

// Attendance: Check Out
app.post('/api/attendance/checkout', (req, res) => {
    let att = readJSON(FILES.attendance);
    let users = readJSON(FILES.volunteers);
    const { volunteerId, feedback } = req.body;
    const record = att.find(a => a.volunteerId === volunteerId && !a.checkOut);
    if (!record) return res.status(404).json({ error: 'No session' });

    const now = new Date();
    record.checkOut = now.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'});
    record.duration = Math.round((now - record.checkInTime) / 3600000 * 100) / 100;
    record.feedback = feedback || '';
    
    // Add Points
    const uIdx = users.findIndex(u => u.id === volunteerId);
    if (uIdx !== -1) {
        users[uIdx].points = (users[uIdx].points || 0) + Math.floor(record.duration * 10);
        writeJSON(FILES.volunteers, users);
    }

    writeJSON(FILES.attendance, att);
    res.json({ ...record, newPoints: users[uIdx]?.points });
});

// Attendance: Manual Entry
app.post('/api/attendance/manual', (req, res) => {
    const att = readJSON(FILES.attendance);
    let users = readJSON(FILES.volunteers);
    const { volunteerId, date, checkIn, checkOut, activityName } = req.body;
    
    const start = new Date(`${date}T${checkIn}`);
    const end = new Date(`${date}T${checkOut}`);
    const duration = Math.round((end - start) / 3600000 * 100) / 100;

    if (duration < 0) return res.status(400).json({ error: 'نطاق الوقت غير صالح' });
    
    // Update Points
    const uIdx = users.findIndex(u => u.id === volunteerId);
    if (uIdx !== -1) {
        users[uIdx].points = (users[uIdx].points || 0) + Math.floor(duration * 10);
        writeJSON(FILES.volunteers, users);
    }

    att.push({
        id: Date.now().toString(), volunteerId, dateStr: date,
        checkIn, checkOut, duration, activityName,
        status: 'present', type: 'manual'
    });
    writeJSON(FILES.attendance, att);
    res.json({ success: true });
});

// Attendance: Edit Record
app.put('/api/attendance/:id', (req, res) => {
    let att = readJSON(FILES.attendance);
    const { id } = req.params;
    const { date, checkIn, checkOut, activityName } = req.body;
    
    const idx = att.findIndex(a => a.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });

    const start = new Date(`${date}T${checkIn}`);
    const end = new Date(`${date}T${checkOut}`);
    const duration = Math.round((end - start) / 3600000 * 100) / 100;

    att[idx] = { ...att[idx], dateStr: date, checkIn, checkOut, duration, activityName, edited: true };
    writeJSON(FILES.attendance, att);
    res.json(att[idx]);
});

// Apology
app.post('/api/attendance/apology', (req, res) => {
    const att = readJSON(FILES.attendance);
    const { volunteerId, date, activityName, reason } = req.body;
    att.push({ id: Date.now().toString(), volunteerId, dateStr: date, activityName, reason, status: 'apologized', type: 'apology' });
    writeJSON(FILES.attendance, att);
    res.json({ success: true });
});

// ===================
// ADMIN ROUTES
// ===================

app.get('/api/admin/stats', (req, res) => {
    const users = readJSON(FILES.volunteers);
    const att = readJSON(FILES.attendance);
    const today = new Date().toISOString().split('T')[0];
    
    const activityStats = {};
    att.filter(a => a.status === 'present').forEach(a => {
        if (!activityStats[a.activityName]) activityStats[a.activityName] = 0;
        activityStats[a.activityName] += a.duration;
    });

    res.json({
        totalUsers: users.length,
        totalHours: att.filter(a => a.status === 'present').reduce((s, a) => s + (a.duration || 0), 0).toFixed(1),
        activeNow: att.filter(a => a.dateStr === today && !a.checkOut).length,
        apologies: att.filter(a => a.status === 'apologized').length,
        activityStats
    });
});

app.get('/api/admin/data', (req, res) => res.json({
    volunteers: readJSON(FILES.volunteers),
    attendance: readJSON(FILES.attendance),
    activities: readJSON(FILES.activities),
    logs: readJSON(FILES.logs)
}));

// Announcements Management
app.post('/api/admin/announcement', (req, res) => {
    const anns = readJSON(FILES.announcements);
    const { text, adminEmail } = req.body;
    anns.push({ id: Date.now().toString(), text, timestamp: new Date().toISOString() });
    writeJSON(FILES.announcements, anns);
    logAction(adminEmail, 'Post Announcement', text);
    res.json(anns);
});

// Activity Management
app.post('/api/admin/activity', (req, res) => {
    const acts = readJSON(FILES.activities);
    const { name, color, schedule, adminEmail } = req.body;
    acts.push({ id: Date.now().toString(), name, color, schedule });
    writeJSON(FILES.activities, acts);
    logAction(adminEmail, 'Add Activity', name);
    res.json(acts);
});

app.put('/api/admin/activity/:id', (req, res) => {
    let acts = readJSON(FILES.activities);
    const { id } = req.params;
    const { name, color, schedule, adminEmail } = req.body;
    const idx = acts.findIndex(a => a.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    acts[idx] = { ...acts[idx], name, color, schedule };
    writeJSON(FILES.activities, acts);
    logAction(adminEmail, 'Edit Activity', name);
    res.json(acts);
});

// User Management
app.delete('/api/admin/user', (req, res) => {
    let users = readJSON(FILES.volunteers).filter(u => u.id !== req.body.userId);
    let att = readJSON(FILES.attendance).filter(a => a.volunteerId !== req.body.userId);
    writeJSON(FILES.volunteers, users);
    writeJSON(FILES.attendance, att);
    logAction(req.body.adminEmail, 'Delete User', req.body.userId);
    res.json({ success: true });
});

// Profile
app.post('/api/user/profile', (req, res) => {
    let users = readJSON(FILES.volunteers);
    const idx = users.findIndex(u => u.id === req.body.userId);
    if (idx !== -1) {
        if (req.body.name) users[idx].name = req.body.name;
        if (req.body.avatar) users[idx].avatar = req.body.avatar;
        writeJSON(FILES.volunteers, users);
        const { password, ...safe } = users[idx];
        return res.json(safe);
    }
    res.status(404).json({ error: 'Not found' });
});

// Excel Export
app.get('/api/export', async (req, res) => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Report');
    ws.columns = [
        { header: 'Date', key: 'date', width: 12 }, { header: 'Name', key: 'name', width: 20 },
        { header: 'Activity', key: 'act', width: 15 }, { header: 'Hours', key: 'hrs', width: 8 },
        { header: 'Status', key: 'status', width: 10 }, { header: 'Feedback', key: 'fb', width: 30 }
    ];
    const users = readJSON(FILES.volunteers);
    readJSON(FILES.attendance).forEach(r => {
        const u = users.find(u => u.id === r.volunteerId);
        ws.addRow({ date: r.dateStr, name: u?.name || 'Unknown', act: r.activityName, hrs: r.duration, status: r.status, fb: r.feedback || r.reason });
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Mersal_Report.xlsx"');
    await wb.xlsx.write(res);
    res.end();
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
