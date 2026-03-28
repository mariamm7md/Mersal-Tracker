const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// مهم جدًا: يربط الفرونت
app.use(express.static(path.join(__dirname, 'public')));

// ================== DATA ==================
const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

const FILES = {
    users: path.join(DATA_DIR, 'users.json'),
    attendance: path.join(DATA_DIR, 'attendance.json')
};

function read(file) {
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file));
}

function write(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ================== AUTH ==================
app.post('/api/register', (req, res) => {
    const users = read(FILES.users);
    const { name, email, password } = req.body;

    if (users.find(u => u.email === email)) {
        return res.json({ error: 'Email exists' });
    }

    const user = {
        id: Date.now().toString(),
        name,
        email,
        password
    };

    users.push(user);
    write(FILES.users, users);

    res.json(user);
});

app.post('/api/login', (req, res) => {
    const users = read(FILES.users);
    const { email, password } = req.body;

    const user = users.find(u => u.email === email && u.password === password);

    res.json(user || null);
});

// ================== ATTENDANCE ==================
app.post('/api/checkin', (req, res) => {
    const logs = read(FILES.attendance);
    const { userId } = req.body;

    const record = {
        id: Date.now().toString(),
        userId,
        checkIn: new Date(),
        checkOut: null
    };

    logs.push(record);
    write(FILES.attendance, logs);

    res.json(record);
});

app.post('/api/checkout', (req, res) => {
    const logs = read(FILES.attendance);
    const { userId } = req.body;

    const active = logs.find(l => l.userId === userId && !l.checkOut);

    if (!active) return res.json({ error: 'No session' });

    active.checkOut = new Date();

    write(FILES.attendance, logs);

    res.json(active);
});

// ================== START ==================
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
