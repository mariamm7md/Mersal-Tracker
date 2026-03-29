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
// Admin can login with "admin" or "mariameltras@gmail.com"
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

if (!fs.existsSync(FILES.activities)) writeJSON(FILES.activities, [
    { id: '1', name: 'Medical Services' }, { id: '2', name: 'Education' }, { id: '3', name: 'Social Services' }
]);
if (!fs.existsSync(FILES.logs)) writeJSON(FILES.logs, []);

function logAction(adminEmail, action, details) {
    const logs = readJSON(FILES.logs);
    logs.push({ id: Date.now().toString(), timestamp: new Date().toISOString(), adminEmail, action, details });
    writeJSON(FILES.logs, logs);
}

// ===================
// SMART LOGIN ROUTE
// ===================
app.post('/api/login', (req, res) => {
    const { identifier, password } = req.body; // identifier can be email or phone

    // 1. Check if Admin
    const admin = ADMIN_ACCOUNTS.find(acc => 
        (acc.username === identifier || acc.email === identifier) && acc.password === password
    );
    if (admin) {
        return res.json({ role: 'admin', name: 'Admin', email: admin.email });
    }

    // 2. Check if User (Volunteer)
    const volunteers = readJSON(FILES.volunteers);
    const user = volunteers.find(u => 
        (u.email === identifier || u.phone === identifier) && u.password === password
    );
    
    if (user) {
        const { password, ...safeUser } = user;
        return res.json({ role: 'user', ...safeUser });
    }

    // 3. Not found
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
        avatar: null, activity: '', 
        createdAt: new Date().toISOString() 
    };
    volunteers.push(user);
    writeJSON(FILES.volunteers, volunteers);
    
    const { password: pwd, ...safeUser } = user;
    res.json({ role: 'user', ...safeUser });
});

app.get('/api/activities', (req, res) => res.json(readJSON(FILES.activities)));

app.post('/api/attendance/checkin', (req, res) => {
    const attendance = readJSON(FILES.attendance);
    const { volunteerId, activityName } = req.body;
    const now = new Date();
    attendance.push({
        id: Date.now().toString(),
        volunteerId, activityName: activityName || 'General',
        dateStr: now.toISOString().split('T')[0],
        checkIn: now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        checkInTime: now.getTime(),
        checkOut: null, duration: 0, type: 'live', feedback: ''
    });
    writeJSON(FILES.attendance, attendance);
    res.json({ success: true });
});

app.post('/api/attendance/checkout', (req, res) => {
    const attendance = readJSON(FILES.attendance);
    const { volunteerId, feedback } = req.body;
    const now = new Date();
    const record = attendance.find(r => r.volunteerId === volunteerId && !r.checkOut);
    if (!record) return res.status(400).json({ error: 'No active session' });
    
    record.checkOut = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    record.duration = Math.round((now.getTime() - record.checkInTime) / 3600000 * 10) / 10;
    record.feedback = feedback || '';
    writeJSON(FILES.attendance, attendance);
    res.json(record);
});

app.get('/api/attendance/:id', (req, res) => {
    res.json(readJSON(FILES.attendance).filter(r => r.volunteerId === req.params.id).reverse());
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
        totalHours: attendance.reduce((s, r) => s + (r.duration || 0), 0).toFixed(1),
        activeToday: attendance.filter(r => r.dateStr === today && !r.checkOut).length
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

// Admin: Edit User
app.post('/api/admin/user/edit', (req, res) => {
    const { adminEmail, userId, name, email, phone, activity } = req.body;
    let volunteers = readJSON(FILES.volunteers);
    const index = volunteers.findIndex(v => v.id === userId);
    if (index !== -1) {
        volunteers[index].name = name;
        volunteers[index].email = email;
        volunteers[index].phone = phone;
        volunteers[index].activity = activity;
        writeJSON(FILES.volunteers, volunteers);
        logAction(adminEmail, "Edit User", `Updated ${name}`);
        res.json({ success: true });
    } else res.status(404).json({ error: 'Not found' });
});

// Admin: Delete User
app.delete('/api/admin/user', (req, res) => {
    const { adminEmail, userId } = req.body;
    let volunteers = readJSON(FILES.volunteers);
    let attendance = readJSON(FILES.attendance);
    const user = volunteers.find(v => v.id === userId);
    volunteers = volunteers.filter(v => v.id !== userId);
    attendance = attendance.filter(a => a.volunteerId !== userId);
    writeJSON(FILES.volunteers, volunteers);
    writeJSON(FILES.attendance, attendance);
    logAction(adminEmail, "Delete User", `Deleted ${user ? user.name : userId}`);
    res.json({ success: true });
});

// Admin: Add Activity
app.post('/api/admin/activity', (req, res) => {
    const { adminEmail, name } = req.body;
    const activities = readJSON(FILES.activities);
    activities.push({ id: Date.now().toString(), name });
    writeJSON(FILES.activities, activities);
    logAction(adminEmail, "Add Activity", `Added ${name}`);
    res.json(activities);
});

// Admin: Delete Activity
app.delete('/api/admin/activity', (req, res) => {
    const { adminEmail, id } = req.body;
    let activities = readJSON(FILES.activities);
    activities = activities.filter(a => a.id !== id);
    writeJSON(FILES.activities, activities);
    logAction(adminEmail, "Delete Activity", `Removed activity ID ${id}`);
    res.json(activities);
});

// Admin: Manual Log
app.post('/api/admin/attendance/manual', (req, res) => {
    const { adminEmail, volunteerId, date, checkIn, checkOut, activityName, feedback } = req.body;
    const attendance = readJSON(FILES.attendance);
    
    const start = new Date(`${date}T${checkIn}`);
    const end = new Date(`${date}T${checkOut}`);
    const duration = Math.round((end - start) / 3600000 * 10) / 10;

    attendance.push({
        id: Date.now().toString(),
        volunteerId, dateStr: date, checkIn, checkOut, duration,
        type: 'manual_admin', activityName: activityName || 'General', feedback: feedback || ''
    });

    writeJSON(FILES.attendance, attendance);
    logAction(adminEmail, "Manual Attendance", `Logged ${duration}h for user ${volunteerId}`);
    res.json({ success: true });
});

app.get('/api/export', async (req, res) => {
    const volunteers = readJSON(FILES.volunteers);
    const attendance = readJSON(FILES.attendance);
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Mersal Report');
    worksheet.columns = [
        { header: 'Date', key: 'date', width: 12 }, { header: 'Name', key: 'name', width: 20 },
        { header: 'Activity', key: 'activityName', width: 20 }, { header: 'In', key: 'in', width: 8 },
        { header: 'Out', key: 'out', width: 8 }, { header: 'Hours', key: 'hours', width: 8 }, { header: 'Feedback', key: 'feedback', width: 30 }
    ];
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563eb' } };
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    
    attendance.forEach(log => {
        const user = volunteers.find(v => v.id === log.volunteerId) || {};
        worksheet.addRow({ 
            date: log.dateStr, name: user.name, activityName: log.activityName, in: log.checkIn, 
            out: log.checkOut || '-', hours: log.duration, feedback: log.feedback 
        });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Mersal_Report.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
