const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// --- Configuration ---
const ADMIN_ACCOUNTS = [
    { username: 'mariameltras@gmail.com', password: 'mersal2026', name: 'Mariam Eltras' },
    { username: 'admin', password: 'mersal2026', name: 'Admin' }
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

// Initialize Data with specific activities and colors
if (!fs.existsSync(FILES.activities)) writeJSON(FILES.activities, [
    { id: '1', name: 'فرز الملابس', color: '#3b82f6', days: ['Sun', 'Mon'], time: '09:00-12:00' },
    { id: '2', name: 'معرض الملابس', color: '#2563eb', days: ['Tue'], time: '10:00-14:00' },
    { id: '3', name: 'صيدلية مرسال', color: '#1d4ed8', days: ['Wed', 'Thu'], time: '09:00-17:00' },
    { id: '4', name: 'دار الضيافة', color: '#1e40af', days: ['All'], time: 'Flexible' }
]);
if (!fs.existsSync(FILES.logs)) writeJSON(FILES.logs, []);

function logAction(actor, action, details) {
    const logs = readJSON(FILES.logs);
    logs.push({ id: Date.now(), timestamp: new Date().toISOString(), actor, action, details });
    writeJSON(FILES.logs, logs);
}

// --- AUTH ---
app.post('/api/login', (req, res) => {
    const { identifier, password } = req.body;
    
    // Check Admin
    const admin = ADMIN_ACCOUNTS.find(a => (a.username === identifier) && a.password === password);
    if (admin) return res.json({ role: 'admin', ...admin });

    // Check User
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
    if (users.find(u => u.email === email)) return res.status(400).json({ error: 'Email exists' });
    
    const user = { id: Date.now().toString(), name, email, phone, password, avatar: null, points: 0, createdAt: new Date().toISOString() };
    users.push(user);
    writeJSON(FILES.volunteers, users);
    const { password: p, ...safe } = user;
    res.json({ role: 'user', ...safe });
});

// --- USER PROFILE ---
app.post('/api/user/profile', (req, res) => {
    let users = readJSON(FILES.volunteers);
    const idx = users.findIndex(u => u.id === req.body.userId);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    
    // Update logic
    if (req.body.name) users[idx].name = req.body.name;
    if (req.body.avatar) users[idx].avatar = req.body.avatar;
    
    writeJSON(FILES.volunteers, users);
    const { password, ...safe } = users[idx];
    res.json(safe);
});

// --- ATTENDANCE ---
app.get('/api/activities', (req, res) => res.json(readJSON(FILES.activities)));

app.post('/api/attendance/checkin', (req, res) => {
    const att = readJSON(FILES.attendance);
    const { volunteerId, activityName } = req.body;
    const now = new Date();
    // Check if already checked in
    if (att.find(a => a.volunteerId === volunteerId && !a.checkOut)) return res.status(400).json({ error: 'Already active' });
    
    const record = {
        id: Date.now().toString(),
        volunteerId, activityName, 
        dateStr: now.toISOString().split('T')[0],
        checkIn: now.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'}),
        checkInTime: now.getTime(),
        checkOut: null, duration: 0, type: 'live', status: 'present'
    };
    att.push(record);
    writeJSON(FILES.attendance, att);
    res.json(record);
});

app.post('/api/attendance/checkout', (req, res) => {
    const att = readJSON(FILES.attendance);
    let users = readJSON(FILES.volunteers);
    const { volunteerId, feedback } = req.body;
    const record = att.find(a => a.volunteerId === volunteerId && !a.checkOut);
    if (!record) return res.status(400).json({ error: 'No session' });
    
    const now = new Date();
    record.checkOut = now.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'});
    record.duration = Math.round((now.getTime() - record.checkInTime) / 3600000 * 10) / 10;
    record.feedback = feedback;
    
    // Update Points
    const uIdx = users.findIndex(u => u.id === volunteerId);
    if (uIdx !== -1) {
        users[uIdx].points = (users[uIdx].points || 0) + Math.round(record.duration * 10);
        writeJSON(FILES.volunteers, users);
    }
    
    writeJSON(FILES.attendance, att);
    res.json(record);
});

app.post('/api/attendance/manual', (req, res) => {
    const att = readJSON(FILES.attendance);
    const { volunteerId, date, checkIn, checkOut, activityName } = req.body;
    const start = new Date(`${date}T${checkIn}`);
    const end = new Date(`${date}T${checkOut}`);
    const duration = Math.round((end - start) / 3600000 * 10) / 10;
    
    att.push({ id: Date.now().toString(), volunteerId, dateStr: date, checkIn, checkOut, duration, activityName, type: 'manual', status: 'present' });
    writeJSON(FILES.attendance, att);
    res.json({ success: true });
});

app.post('/api/attendance/apology', (req, res) => {
    const att = readJSON(FILES.attendance);
    const { volunteerId, date, reason, activityName } = req.body;
    att.push({ id: Date.now().toString(), volunteerId, dateStr: date, reason, activityName, status: 'apologized', type: 'apology' });
    writeJSON(FILES.attendance, att);
    res.json({ success: true });
});

app.get('/api/attendance/:id', (req, res) => res.json(readJSON(FILES.attendance).filter(a => a.volunteerId === req.params.id).reverse()));

// --- ADMIN ---
app.get('/api/admin/stats', (req, res) => {
    const users = readJSON(FILES.volunteers);
    const att = readJSON(FILES.attendance);
    const today = new Date().toISOString().split('T')[0];
    res.json({
        totalUsers: users.length,
        totalHours: att.filter(a => a.status === 'present').reduce((s, a) => s + (a.duration || 0), 0).toFixed(1),
        activeToday: att.filter(a => a.dateStr === today && a.status === 'present' && !a.checkOut).length,
        apologies: att.filter(a => a.status === 'apologized').length
    });
});

app.get('/api/admin/data', (req, res) => res.json({
    volunteers: readJSON(FILES.volunteers),
    attendance: readJSON(FILES.attendance),
    activities: readJSON(FILES.activities),
    logs: readJSON(FILES.logs)
}));

app.post('/api/admin/user/edit', (req, res) => {
    const { adminEmail, userId, name, email, phone, activity } = req.body;
    let users = readJSON(FILES.volunteers);
    const idx = users.findIndex(u => u.id === userId);
    if (idx !== -1) {
        users[idx] = { ...users[idx], name, email, phone, activity };
        writeJSON(FILES.volunteers, users);
        logAction(adminEmail, 'Edit User', `Updated ${name}`);
        res.json({ success: true });
    } else res.status(404).json({ error: 'Not found' });
});

app.delete('/api/admin/user', (req, res) => {
    const { adminEmail, userId } = req.body;
    let users = readJSON(FILES.volunteers).filter(u => u.id !== userId);
    let att = readJSON(FILES.attendance).filter(a => a.volunteerId !== userId);
    writeJSON(FILES.volunteers, users);
    writeJSON(FILES.attendance, att);
    logAction(adminEmail, 'Delete User', `Deleted ${userId}`);
    res.json({ success: true });
});

app.post('/api/admin/activity', (req, res) => {
    const acts = readJSON(FILES.activities);
    const { name, color, days, time, adminEmail } = req.body;
    acts.push({ id: Date.now().toString(), name, color, days, time });
    writeJSON(FILES.activities, acts);
    logAction(adminEmail, 'Add Activity', `Added ${name}`);
    res.json(acts);
});

app.get('/api/export', async (req, res) => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Report');
    ws.columns = [
        { header: 'Date', key: 'date', width: 12 },
        { header: 'Name', key: 'name', width: 20 },
        { header: 'Activity', key: 'act', width: 15 },
        { header: 'Hours', key: 'hrs', width: 8 },
        { header: 'Status', key: 'status', width: 10 }
    ];
    
    const users = readJSON(FILES.volunteers);
    readJSON(FILES.attendance).forEach(r => {
        const u = users.find(u => u.id === r.volunteerId);
        ws.addRow({ date: r.dateStr, name: u ? u.name : 'Unknown', act: r.activityName, hrs: r.duration, status: r.status });
    });
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Mersal_Data.xlsx"');
    await wb.xlsx.write(res);
    res.end();
});

app.listen(PORT, () => console.log(`Running on port ${PORT}`));
