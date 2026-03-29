// ================================================
//      MERSAL Volunteer Server - server.js
// ================================================

const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();
const PORT = 3000;

// --- Middleware ---
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Data Storage (JSON files) ---
const DB_FILE = path.join(__dirname, 'data.json');

// Ensure data file exists
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({
        volunteers: [],
        attendance: []
    }, null, 2));
}

// --- Helper Functions ---
function readDB() { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
function writeDB(data) { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2)); }

// Hashing passwords (simple for demo, can upgrade to bcrypt)
function simpleHash(pass) { return Buffer.from(pass).toString('base64'); }

// --- API Routes ---

// Register new volunteer
app.post('/api/register', (req, res) => {
    const { name, email, phone, password } = req.body;
    if (!name || !password || (!email && !phone)) return res.status(400).json({ error: "Missing required fields." });

    const db = readDB();
    const exists = db.volunteers.find(v => (v.email && v.email === email) || (v.phone && v.phone === phone));
    if (exists) return res.status(400).json({ error: "User already exists." });

    const newUser = {
        id: Date.now(),
        name, email, phone,
        password: simpleHash(password),
        totalHours: 0,
        totalSessions: 0,
        avatar: ""
    };
    db.volunteers.push(newUser);
    writeDB(db);
    res.status(200).json({ success: true, user: newUser });
});

// Login
app.post('/api/login', (req, res) => {
    const { identifier, password, name } = req.body; // identifier = email or phone
    if (!identifier || !password) return res.status(400).json({ error: "Missing login info." });

    const db = readDB();
    const matches = db.volunteers.filter(v => (v.email && v.email === identifier) || (v.phone && v.phone === identifier));
    if (!matches.length) return res.status(401).json({ error: "User not found." });

    if (!name && matches.length > 1) return res.status(200).json({ needName: true, profiles: matches.map(v=>v.name) });

    const user = name ? matches.find(v => v.name === name) : matches[0];
    if (!user) return res.status(401).json({ error: "Profile not found." });

    if (user.password !== simpleHash(password)) return res.status(401).json({ error: "Wrong password." });

    res.status(200).json(user);
});

// Update avatar
app.post('/api/avatar/:id', (req, res) => {
    const { id } = req.params;
    const { avatar } = req.body; // base64 string
    const db = readDB();
    const user = db.volunteers.find(v => v.id == id);
    if (!user) return res.status(404).json({ error: "User not found." });
    user.avatar = avatar;
    writeDB(db);
    res.json({ success: true });
});

// Save attendance session
app.post('/api/attendance/:id', (req, res) => {
    const { id } = req.params;
    const { activity, duration } = req.body; // duration in hours
    const db = readDB();
    const user = db.volunteers.find(v => v.id == id);
    if (!user) return res.status(404).json({ error: "User not found." });

    const record = {
        volunteerId: user.id,
        name: user.name,
        activity,
        duration: parseFloat(duration),
        timestamp: Date.now()
    };
    db.attendance.push(record);
    user.totalHours += parseFloat(duration);
    user.totalSessions += 1;
    writeDB(db);
    res.json({ success: true });
});

// Admin panel data
app.get('/api/admin/full-data', (req, res) => {
    const db = readDB();
    res.json(db);
});

// Export data as Excel
app.get('/api/export', (req, res) => {
    const db = readDB();
    let csv = 'Name,Email,Phone,Total Hours,Total Sessions\n';
    db.volunteers.forEach(v => {
        csv += `"${v.name}","${v.email || ''}","${v.phone || ''}",${v.totalHours.toFixed(1)},${v.totalSessions}\n`;
    });
    res.setHeader('Content-disposition', 'attachment; filename=volunteers.csv');
    res.set('Content-Type', 'text/csv');
    res.status(200).send(csv);
});

// --- Start Server ---
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
