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
    { username: 'admin', password: 'mersal2026', name: 'System Admin' }
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

// --- Data Seeding (For Demo/Initial Start) ---
function seedDatabase() {
    if (!fs.existsSync(FILES.volunteers)) {
        console.log("Seeding initial data...");
        const demoUsers = [
            { id: '101', name: 'Ahmed Ali', email: 'ahmed@mersal.com', phone: '0501112222', password: '123456', points: 120, createdAt: new Date().toISOString() },
            { id: '102', name: 'Sara Khan', email: 'sara@mersal.com', phone: '0503334444', password: '123456', points: 85, createdAt: new Date().toISOString() },
            { id: '103', name: 'Omar Hafez', email: 'omar@mersal.com', phone: '0505556666', password: '123456', points: 45, createdAt: new Date().toISOString() }
        ];
        writeJSON(FILES.volunteers, demoUsers);

        const demoAttendance = [
            { id: '201', volunteerId: '101', activityName: 'فرز الملابس', dateStr: '2023-10-10', checkIn: '09:00', checkOut: '12:00', duration: 3, status: 'present' },
            { id: '202', volunteerId: '101', activityName: 'صيدلية مرسال', dateStr: '2023-10-12', checkIn: '10:00', checkOut: '14:00', duration: 4, status: 'present' },
            { id: '203', volunteerId: '102', activityName: 'معرض الملابس', dateStr: '2023-10-11', checkIn: '11:00', checkOut: '15:00', duration: 4, status: 'present' }
        ];
        writeJSON(FILES.attendance, demoAttendance);
    }
    
    // Default Activities
    if (!fs.existsSync(FILES.activities)) writeJSON(FILES.activities, [
        { id: '1', name: 'فرز الملابس', nameEn: 'Clothes Sorting', color: '#3b82f6', schedule: { days: ['الأحد', 'الاثنين'], time: '09:00 - 12:00' } },
        { id: '2', name: 'معرض الملابس', nameEn: 'Clothes Exhibition', color: '#8b5cf6', schedule: { days: ['الثلاثاء'], time: '10:00 - 14:00' } },
        { id: '3', name: 'صيدلية مرسال', nameEn: 'Mersal Pharmacy', color: '#10b981', schedule: { days: ['الأربعاء', 'الخميس'], time: '09:00 - 17:00' } },
        { id: '4', name: 'دار الضيافة', nameEn: 'Guest House', color: '#f59e0b', schedule: { days: ['يومياً'], time: 'مرن' } }
    ]);
}
seedDatabase();

function logAction(actor, action, details) {
    const logs = readJSON(FILES.logs);
    logs.push({ id: Date.now(), timestamp: new Date().toISOString(), actor, action, details });
    writeJSON(FILES.logs, logs);
}

// =================== AUTH ROUTE
app.post('/api/login', (req, res) => {
    const { identifier, password } = req.body;
    const admin = ADMIN_CREDENTIALS.find(a => a.username === identifier && a.password === password);
    if (admin) return res.json({ role: 'admin', name: admin.name, email: admin.username });

    const users = readJSON(FILES.volunteers);
    const user = users.find(u => (u.email === identifier || u.phone === identifier) && u.password === password);
    if (user) {
        const { password, ...safe } = user;
        return res.json({ role: 'user', ...safe });
    }
    res.status(401).json({ error: 'Invalid credentials' });
});

app.post('/api/register', (req, res) => {
    const users = readJSON(FILES.volunteers);
    const { name, email, phone, password } = req.body;
    if (users.find(u => u.email === email)) return res.status(400).json({ error: 'Email already exists' });
    
    const user = { id: Date.now().toString(), name, email, phone, password, avatar: null, points: 0, createdAt: new Date().toISOString() };
    users.push(user);
    writeJSON(FILES.volunteers, users);
    const { password: p, ...safe } = user;
    res.json({ role: 'user', ...safe });
});

// =================== USER ROUTES
app.get('/api/user/stats/:id', (req, res) => {
    const users = readJSON(FILES.volunteers);
    const att = readJSON(FILES.attendance);
    const uid = req.params.id;
    
    const myLogs = att.filter(a => a.volunteerId === uid && a.status === 'present');
    const hours = myLogs.reduce((s, l) => s + (l.duration || 0), 0);
    const points = users.find(u => u.id === uid)?.points || 0;
    
    const sorted = users.sort((a, b) => (b.points || 0) - (a.points || 0));
    const rank = sorted.findIndex(u => u.id === uid) + 1;

    const chartData = {};
    myLogs.forEach(l => {
        if(!chartData[l.activityName]) chartData[l.activityName] = 0;
        chartData[l.activityName] += l.duration;
    });

    res.json({ hours: hours.toFixed(1), points, rank, chartData });
});

app.get('/api/user/data/:id', (req, res) => {
    const logs = readJSON(FILES.attendance).filter(a => a.volunteerId === req.params.id).reverse();
    const user = readJSON(FILES.volunteers).find(u => u.id === req.params.id);
    res.json({ logs, points: user?.points || 0 });
});

app.post('/api/user/profile', (req, res) => {
    let users = readJSON(FILES.volunteers);
    const { userId, name, email, phone, password, avatar } = req.body;
    const idx = users.findIndex(u => u.id === userId);
    
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    if (users.find(u => u.email === email && u.id !== userId)) return res.status(400).json({ error: 'Email used' });

    users[idx].name = name;
    users[idx].email = email;
    users[idx].phone = phone;
    if (password) users[idx].password = password;
    if (avatar !== undefined) users[idx].avatar = avatar;

    writeJSON(FILES.volunteers, users);
    const { password: p, ...safe } = users[idx];
    res.json(safe);
});

app.delete('/api/user/delete', (req, res) => {
    let users = readJSON(FILES.volunteers);
    let att = readJSON(FILES.attendance);
    const { userId } = req.body;
    
    users = users.filter(u => u.id !== userId);
    att = att.filter(a => a.volunteerId !== userId);
    
    writeJSON(FILES.volunteers, users);
    writeJSON(FILES.attendance, att);
    res.json({ success: true });
});

// Attendance Logic
app.post('/api/attendance/checkin', (req, res) => {
    const att = readJSON(FILES.attendance);
    const { volunteerId, activityName, feedback } = req.body;
    if (att.find(a => a.volunteerId === volunteerId && !a.checkOut)) return res.status(400).json({ error: 'Active session exists' });
    
    const now = new Date();
    att.push({
        id: Date.now().toString(), volunteerId, activityName, feedback,
        dateStr: now.toISOString().split('T')[0],
        checkIn: now.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'}),
        checkInTime: now.getTime(),
        checkOut: null, duration: 0, status: 'present'
    });
    writeJSON(FILES.attendance, att);
    res.json({ success: true });
});

app.post('/api/attendance/checkout', (req, res) => {
    let att = readJSON(FILES.attendance);
    let users = readJSON(FILES.volunteers);
    const { volunteerId, feedback } = req.body;
    const record = att.find(a => a.volunteerId === volunteerId && !a.checkOut);
    if (!record) return res.status(404).json({ error: 'No session' });

    const now = new Date();
    record.checkOut = now.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'});
    record.duration = Math.round((now - record.checkInTime) / 3600000 * 100) / 100;
    if(feedback) record.feedback = feedback;
    
    const uIdx = users.findIndex(u => u.id === volunteerId);
    if (uIdx !== -1) {
        users[uIdx].points = (users[uIdx].points || 0) + Math.floor(record.duration * 10);
        writeJSON(FILES.volunteers, users);
    }

    writeJSON(FILES.attendance, att);
    res.json({ success: true, duration: record.duration });
});

app.post('/api/attendance/manual', (req, res) => {
    let users = readJSON(FILES.volunteers);
    const att = readJSON(FILES.attendance);
    const { volunteerId, date, checkIn, checkOut, activityName, feedback } = req.body;
    
    const start = new Date(`${date}T${checkIn}`);
    const end = new Date(`${date}T${checkOut}`);
    const duration = Math.round((end - start) / 3600000 * 100) / 100;
    if (duration < 0) return res.status(400).json({ error: 'Invalid time' });

    const uIdx = users.findIndex(u => u.id === volunteerId);
    if (uIdx !== -1) {
        users[uIdx].points = (users[uIdx].points || 0) + Math.floor(duration * 10);
        writeJSON(FILES.volunteers, users);
    }

    att.push({
        id: Date.now().toString(), volunteerId, dateStr: date,
        checkIn, checkOut, duration, activityName, feedback,
        status: 'present', type: 'manual'
    });
    writeJSON(FILES.attendance, att);
    res.json({ success: true });
});

// =================== ADMIN ROUTES
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
        activityStats,
        leaderboard: users.sort((a,b) => b.points - a.points).slice(0, 5)
    });
});

app.get('/api/admin/data', (req, res) => res.json({
    volunteers: readJSON(FILES.volunteers),
    attendance: readJSON(FILES.attendance),
    activities: readJSON(FILES.activities),
    logs: readJSON(FILES.logs)
}));

app.get('/api/activities', (req, res) => res.json(readJSON(FILES.activities)));

app.post('/api/admin/activity', (req, res) => {
    const acts = readJSON(FILES.activities);
    const { name, nameEn, color, schedule, adminEmail } = req.body;
    acts.push({ id: Date.now().toString(), name, nameEn, color, schedule });
    writeJSON(FILES.activities, acts);
    logAction(adminEmail, 'Add Activity', name);
    res.json(acts);
});

app.post('/api/admin/activity/edit/:id', (req, res) => {
    let acts = readJSON(FILES.activities);
    const { id } = req.params;
    const { name, nameEn, color, schedule, adminEmail } = req.body;
    const idx = acts.findIndex(a => a.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    acts[idx] = { ...acts[idx], name, nameEn, color, schedule };
    writeJSON(FILES.activities, acts);
    logAction(adminEmail, 'Edit Activity', name);
    res.json(acts);
});

app.delete('/api/admin/activity/:id', (req, res) => {
    let acts = readJSON(FILES.activities).filter(a => a.id !== req.params.id);
    writeJSON(FILES.activities, acts);
    res.json(acts);
});

app.delete('/api/admin/user', (req, res) => {
    let users = readJSON(FILES.volunteers).filter(u => u.id !== req.body.userId);
    let att = readJSON(FILES.attendance).filter(a => a.volunteerId !== req.body.userId);
    writeJSON(FILES.volunteers, users);
    writeJSON(FILES.attendance, att);
    res.json({ success: true });
});

// Export
app.get('/api/export', async (req, res) => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Report');
    ws.columns = [
        { header: 'Date', key: 'date', width: 12 }, { header: 'Name', key: 'name', width: 20 },
        { header: 'Activity', key: 'act', width: 15 }, { header: 'Hours', key: 'hrs', width: 8 },
        { header: 'Feedback', key: 'fb', width: 30 }
    ];
    const users = readJSON(FILES.volunteers);
    readJSON(FILES.attendance).forEach(r => {
        const u = users.find(u => u.id === r.volunteerId);
        ws.addRow({ date: r.dateStr, name: u?.name || 'Unknown', act: r.activityName, hrs: r.duration, fb: r.feedback || '' });
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Mersal_Report.xlsx"');
    await wb.xlsx.write(res);
    res.end();
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
