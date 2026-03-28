const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middlewares ---
app.use(cors());
// Increased limit to 15MB to handle Base64 Profile Pictures
app.use(express.json({ limit: '15mb' }));
app.use(express.static('public'));

// --- Configuration & Database Files ---
const ADMIN_PIN = "1234"; // Same as frontend
const DATA_DIR = path.join(__dirname, 'data');
const FILES = {
    volunteers: path.join(DATA_DIR, 'volunteers.json'),
    attendance: path.join(DATA_DIR, 'attendance.json'),
    settings: path.join(DATA_DIR, 'settings.json')
};

// Initialize Data Directory and Files
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const readJSON = (file) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : [];
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

// Initial settings if they don't exist
if (!fs.existsSync(FILES.settings)) writeJSON(FILES.settings, { hoursTarget: 130 });

// ===============================
// 1. AUTHENTICATION (PRO LOGIC)
// ===============================

app.post('/api/login', (req, res) => {
    const { identifier, password, name } = req.body;
    const volunteers = readJSON(FILES.volunteers);
    const attendance = readJSON(FILES.attendance);

    // Step A: Find all profiles matching this email or phone AND password
    const matches = volunteers.filter(u => 
        (u.email === identifier || u.phone === identifier) && u.password === password
    );

    if (matches.length === 0) {
        return res.status(401).json({ error: "Invalid Credentials" });
    }

    // Step B: Handle Shared Accounts (Multiple names for one email)
    if (matches.length > 1 && !name) {
        // Tell frontend to show a name selector
        return res.json({ 
            needName: true, 
            profiles: matches.map(m => m.name) 
        });
    }

    // Step C: Identify the specific user
    const user = name 
        ? matches.find(m => m.name === name) 
        : matches[0];

    if (!user) return res.status(404).json({ error: "Profile not found" });

    // Step D: Calculate live stats for the user
    const userLogs = attendance.filter(a => a.volunteerId === user.id);
    const totalHours = userLogs.reduce((sum, log) => sum + (log.duration || 0), 0);

    const { password: _, ...safeUser } = user;
    res.json({ 
        ...safeUser, 
        totalHours: parseFloat(totalHours.toFixed(1)), 
        totalSessions: userLogs.length 
    });
});

app.post('/api/register', (req, res) => {
    const { name, email, phone, password } = req.body;
    const volunteers = readJSON(FILES.volunteers);

    // Prevent duplicate Name + Email/Phone combo
    const existing = volunteers.find(u => 
        u.name === name && (u.email === email || u.phone === phone)
    );

    if (existing) {
        return res.status(400).json({ error: "This profile name already exists for this contact." });
    }

    const newUser = {
        id: "V-" + Date.now(),
        name,
        email: email || null,
        phone: phone || null,
        password,
        avatar: null,
        createdAt: new Date().toISOString()
    };

    volunteers.push(newUser);
    writeJSON(FILES.volunteers, volunteers);
    res.json({ success: true });
});

// ===============================
// 2. ATTENDANCE & TRACKING
// ===============================

app.post('/api/attendance/checkin', (req, res) => {
    const attendance = readJSON(FILES.attendance);
    const { volunteerId, activityName } = req.body;
    const now = new Date();

    const record = {
        id: "LOG-" + Date.now(),
        volunteerId,
        dateStr: now.toISOString().split('T')[0],
        checkIn: now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        startTime: now.getTime(),
        checkOut: null,
        duration: 0,
        activityName: activityName || 'General Volunteering',
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
    if (!record) return res.status(400).json({ error: "No active session found" });

    record.checkOut = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const diffMs = now.getTime() - record.startTime;
    record.duration = parseFloat((diffMs / 3600000).toFixed(2)); // Hours
    record.feedback = feedback || '';

    writeJSON(FILES.attendance, attendance);
    res.json(record);
});

// ===============================
// 3. PROFILE & ADMIN MANAGEMENT
// ===============================

app.post('/api/user/update', (req, res) => {
    let volunteers = readJSON(FILES.volunteers);
    const { userId, avatar, name } = req.body;
    const index = volunteers.findIndex(v => v.id === userId);

    if (index !== -1) {
        if (avatar) volunteers[index].avatar = avatar;
        if (name) volunteers[index].name = name;
        writeJSON(FILES.volunteers, volunteers);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: "User not found" });
    }
});

app.get('/api/admin/full-data', (req, res) => {
    const volunteers = readJSON(FILES.volunteers);
    const attendance = readJSON(FILES.attendance);
    
    // Map total hours to each volunteer for admin view
    const volunteersWithStats = volunteers.map(v => {
        const userLogs = attendance.filter(a => a.volunteerId === v.id);
        const totalHours = userLogs.reduce((s, l) => s + (l.duration || 0), 0);
        return { ...v, totalHours };
    });

    res.json({
        volunteers: volunteersWithStats,
        attendance: attendance
    });
});

// ===============================
// 4. EXCEL EXPORT
// ===============================

app.get('/api/export', async (req, res) => {
    const volunteers = readJSON(FILES.volunteers);
    const attendance = readJSON(FILES.attendance);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Volunteer Hours Report');

    sheet.columns = [
        { header: 'Date', key: 'date', width: 15 },
        { header: 'Volunteer Name', key: 'name', width: 25 },
        { header: 'Activity', key: 'activity', width: 25 },
        { header: 'Clock In', key: 'in', width: 12 },
        { header: 'Clock Out', key: 'out', width: 12 },
        { header: 'Total Hours', key: 'hours', width: 12 },
        { header: 'Notes', key: 'notes', width: 35 }
    ];

    // Styling Header
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };

    attendance.forEach(log => {
        const user = volunteers.find(v => v.id === log.volunteerId) || { name: 'Deleted User' };
        sheet.addRow({
            date: log.dateStr,
            name: user.name,
            activity: log.activityName,
            in: log.checkIn,
            out: log.checkOut || 'Active',
            hours: log.duration,
            notes: log.feedback
        });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Mersal_Report_2026.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
});

// Start the engine
app.listen(PORT, () => {
    console.log(`
    🚀 Mersal Pro Server Running!
    ---------------------------
    Port: ${PORT}
    Admin PIN: ${ADMIN_PIN}
    Data Storage: ${DATA_DIR}
    ---------------------------
    `);
});
