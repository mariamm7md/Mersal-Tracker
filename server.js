const express = require('express');
const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'mersal-dev-secret-change-in-production';
const TARGET_HOURS = 130;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ========================================
// === قاعدة البيانات (sql.js) ===
// ========================================
let db;
const DB_PATH = process.env.SQLITE_PATH || path.join(__dirname, 'mersal.db');

function saveDB() {
    try {
        const data = db.export();
        const buffer = Buffer.from(data);
        // التأكد من وجود مجلد المسار
        const dir = path.dirname(DB_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(DB_PATH, buffer);
    } catch (err) {
        console.error('فشل حفظ قاعدة البيانات:', err.message);
    }
}

function dbRun(sql, params) {
    const stmt = db.prepare(sql);
    if (params && params.length) stmt.bind(params);
    stmt.step();
    stmt.free();
    saveDB();
}

function dbQuery(sql, params) {
    const stmt = db.prepare(sql);
    if (params && params.length) stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
}

function dbGet(sql, params) {
    const stmt = db.prepare(sql);
    if (params && params.length) stmt.bind(params);
    let row = null;
    if (stmt.step()) row = stmt.getAsObject();
    stmt.free();
    return row;
}

async function initDatabase() {
    console.log('جاري تحميل قاعدة البيانات...');
    const SQL = await initSqlJs();

    if (fs.existsSync(DB_PATH)) {
        const buffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(buffer);
        console.log('تم تحميل قاعدة البيانات الموجودة');
    } else {
        db = new SQL.Database();
        console.log('تم إنشاء قاعدة بيانات جديدة');
    }

    db.run(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        hours REAL DEFAULT 0,
        sessions INTEGER DEFAULT 0,
        streak INTEGER DEFAULT 0,
        last_active TEXT,
        join_date TEXT,
        created_at TEXT DEFAULT (datetime('now'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        duration_hours REAL NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
    )`);

    const adminExists = dbGet("SELECT id FROM users WHERE role='admin'");
    if (!adminExists) {
        const hash = await bcrypt.hash('admin123', 10);
        dbRun("INSERT INTO users (id,name,email,password,role,join_date) VALUES (?,?,?,?,?,?)",
            ['admin-001', 'مدير مرسال', 'admin@mersal.org', hash, 'admin', new Date().toISOString()]);
        console.log('تم إنشاء حساب المدير: admin@mersal.org / admin123');
    }

    saveDB();
    console.log('قاعدة البيانات جاهزة');
}

// ========================================
// === أدوات مساعدة ===
// ========================================
function authMiddleware(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer '))
        return res.status(401).json({ message: 'غير مصرح' });
    try {
        req.userId = jwt.verify(header.split(' ')[1], JWT_SECRET).userId;
        next();
    } catch {
        return res.status(401).json({ message: 'انتهت صلاحية الجلسة' });
    }
}

function adminMiddleware(req, res, next) {
    const user = dbGet('SELECT role FROM users WHERE id=?', [req.userId]);
    if (!user || user.role !== 'admin')
        return res.status(403).json({ message: 'صلاحيات مدير مطلوبة' });
    next();
}

function calcStreak(lastActive, currentStreak) {
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    if (lastActive === today) return currentStreak;
    if (lastActive === yesterday) return currentStreak + 1;
    return 1;
}

function userRow(u) {
    return {
        id: u.id, name: u.name, email: u.email, role: u.role,
        hours: u.hours, sessions: u.sessions, streak: u.streak,
        lastActive: u.last_active, joinDate: u.join_date
    };
}

// ========================================
// === مسارات المصادقة ===
// ========================================
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        if (!name || name.length < 2)
            return res.status(400).json({ message: 'الاسم مطلوب (حرفين على الأقل)' });
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
            return res.status(400).json({ message: 'البريد الإلكتروني غير صالح' });
        if (!password || password.length < 4)
            return res.status(400).json({ message: 'كلمة المرور قصيرة (4 أحرف على الأقل)' });
        if (!['user', 'admin'].includes(role))
            return res.status(400).json({ message: 'نوع الحساب غير صالح' });

        if (dbGet('SELECT id FROM users WHERE email=?', [email.toLowerCase()]))
            return res.status(400).json({ message: 'هذا البريد مسجل مسبقاً' });

        const hash = await bcrypt.hash(password, 10);
        const id = 'u-' + Date.now();
        dbRun('INSERT INTO users (id,name,email,password,role,join_date) VALUES (?,?,?,?,?,?)',
            [id, name, email.toLowerCase(), hash, role, new Date().toISOString()]);

        res.status(201).json({ message: 'تم إنشاء الحساب بنجاح' });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password)
            return res.status(400).json({ message: 'البريد وكلمة المرور مطلوبان' });

        const user = dbGet('SELECT * FROM users WHERE email=?', [email.toLowerCase()]);
        if (!user)
            return res.status(401).json({ message: 'البريد أو كلمة المرور غير صحيحة' });

        if (!(await bcrypt.compare(password, user.password)))
            return res.status(401).json({ message: 'البريد أو كلمة المرور غير صحيحة' });

        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: userRow(user) });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// === الملف الشخصي ===
app.get('/api/profile', authMiddleware, (req, res) => {
    const u = dbGet('SELECT * FROM users WHERE id=?', [req.userId]);
    if (!u) return res.status(404).json({ message: 'المستخدم غير موجود' });
    res.json(userRow(u));
});

// === الترتيب ===
app.get('/api/rank', authMiddleware, (req, res) => {
    const users = dbQuery('SELECT id, hours FROM users ORDER BY hours DESC');
    res.json({ rank: users.findIndex(u => u.id === req.userId) + 1 });
});

// === الجلسات ===
app.post('/api/sessions', authMiddleware, (req, res) => {
    try {
        const { startTime, endTime, durationHours } = req.body;
        if (!startTime || !endTime || !durationHours)
            return res.status(400).json({ message: 'بيانات الجلسة غير مكتملة' });
        if (durationHours < 0.0028)
            return res.status(400).json({ message: 'الجلسة قصيرة جداً ولم تُحسب' });

        const user = dbGet('SELECT * FROM users WHERE id=?', [req.userId]);
        if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });

        const newStreak = calcStreak(user.last_active, user.streak);
        const today = new Date().toDateString();

        dbRun('INSERT INTO sessions (user_id,start_time,end_time,duration_hours) VALUES (?,?,?,?)',
            [req.userId, startTime, endTime, durationHours]);
        dbRun('UPDATE users SET hours=hours+?, sessions=sessions+1, streak=?, last_active=? WHERE id=?',
            [durationHours, newStreak, today, req.userId]);

        const updated = dbGet('SELECT * FROM users WHERE id=?', [req.userId]);
        res.json({ message: 'تم حفظ ' + durationHours.toFixed(2) + ' ساعة بنجاح', user: userRow(updated) });
    } catch (err) {
        console.error('Session error:', err);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

app.get('/api/sessions', authMiddleware, (req, res) => {
    const sessions = dbQuery('SELECT * FROM sessions WHERE user_id=? ORDER BY created_at DESC', [req.userId]);
    res.json(sessions);
});

// === الإدارة ===
app.get('/api/admin/stats', authMiddleware, adminMiddleware, (req, res) => {
    const totalVol = dbGet("SELECT COUNT(*) as c FROM users WHERE role='user'").c;
    const totalH = dbGet("SELECT COALESCE(SUM(hours),0) as t FROM users WHERE role='user'").t;
    const avg = totalVol > 0 ? totalH / totalVol : 0;
    const today = new Date().toDateString();
    const activeToday = dbGet("SELECT COUNT(*) as c FROM users WHERE role='user' AND last_active=?", [today]).c;
    res.json({
        totalVolunteers: totalVol,
        totalHours: Math.round(totalH * 10) / 10,
        avgHours: Math.round(avg * 10) / 10,
        activeToday
    });
});

app.get('/api/admin/users', authMiddleware, adminMiddleware, (req, res) => {
    const users = dbQuery("SELECT * FROM users WHERE role='user' ORDER BY hours DESC");
    res.json(users.map(userRow));
});

app.post('/api/admin/users/:id/hours', authMiddleware, adminMiddleware, (req, res) => {
    const { hours } = req.body;
    if (!hours || hours <= 0) return res.status(400).json({ message: 'قيمة الساعات غير صالحة' });
    const user = dbGet('SELECT id,name FROM users WHERE id=?', [req.params.id]);
    if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });
    dbRun('UPDATE users SET hours=hours+? WHERE id=?', [hours, req.params.id]);
    res.json({ message: 'تمت إضافة ' + hours + ' ساعة لـ ' + user.name });
});

app.delete('/api/admin/users/:id', authMiddleware, adminMiddleware, (req, res) => {
    const user = dbGet('SELECT id,name FROM users WHERE id=?', [req.params.id]);
    if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });
    dbRun('DELETE FROM sessions WHERE user_id=?', [req.params.id]);
    dbRun('DELETE FROM users WHERE id=?', [req.params.id]);
    res.json({ message: 'تم حذف ' + user.name });
});

// === فحص الصحة ===
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// === الصفحة الرئيسية ===
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// === تشغيل ===
initDatabase().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log('=================================');
        console.log('  Mersal Tracker running');
        console.log('  Port: ' + PORT);
        console.log('  DB: ' + DB_PATH);
        console.log('=================================');
    });
}).catch(err => {
    console.error('فشل تشغيل الخادم:', err);
    process.exit(1);
});
