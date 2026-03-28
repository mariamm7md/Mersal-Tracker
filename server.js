const express = require('express');
const betterSqlite3 = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'mersal-dev-secret-change-me';
const TARGET_HOURS = 130;

// === الوسيط ===
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// === قاعدة البيانات ===
const db = betterSqlite3('./mersal.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'user' CHECK(role IN ('user','admin')),
        hours REAL DEFAULT 0,
        sessions INTEGER DEFAULT 0,
        streak INTEGER DEFAULT 0,
        last_active TEXT,
        join_date TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        duration_hours REAL NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
`);

// إنشاء حساب المدير الافتراضي إذا لم يكن موجوداً
const adminExists = db.prepare("SELECT id FROM users WHERE role='admin'").get();
if (!adminExists) {
    bcrypt.hash('admin123', 10).then(hash => {
        db.prepare("INSERT INTO users (id,name,email,password,role,join_date) VALUES (?,?,?,?,?,?)")
            .run('admin-001', 'مدير مرسال', 'admin@mersal.org', hash, 'admin', new Date().toISOString());
        console.log('تم إنشاء حساب المدير الافتراضي: admin@mersal.org / admin123');
    });
}

// === أدوات مساعدة ===
function authMiddleware(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ message: 'غير مصرح' });
    try {
        req.userId = jwt.verify(header.split(' ')[1], JWT_SECRET).userId;
        next();
    } catch {
        return res.status(401).json({ message: 'انتهت صلاحية الجلسة' });
    }
}

function adminMiddleware(req, res, next) {
    const user = db.prepare('SELECT role FROM users WHERE id=?').get(req.userId);
    if (!user || user.role !== 'admin') return res.status(403).json({ message: 'صلاحيات مدير مطلوبة' });
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

// === مسارات المصادقة ===
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        if (!name || name.length < 2) return res.status(400).json({ message: 'الاسم مطلوب (حرفين على الأقل)' });
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: 'البريد الإلكتروني غير صالح' });
        if (!password || password.length < 4) return res.status(400).json({ message: 'كلمة المرور قصيرة (4 أحرف على الأقل)' });
        if (!['user', 'admin'].includes(role)) return res.status(400).json({ message: 'نوع الحساب غير صالح' });

        if (db.prepare('SELECT id FROM users WHERE email=?').get(email.toLowerCase()))
            return res.status(400).json({ message: 'هذا البريد مسجل مسبقاً' });

        const hash = await bcrypt.hash(password, 10);
        const id = 'u-' + Date.now();
        db.prepare('INSERT INTO users (id,name,email,password,role,join_date) VALUES (?,?,?,?,?,?)')
            .run(id, name, email.toLowerCase(), hash, role, new Date().toISOString());

        res.status(201).json({ message: 'تم إنشاء الحساب بنجاح' });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ message: 'البريد وكلمة المرور مطلوبان' });

        const user = db.prepare('SELECT * FROM users WHERE email=?').get(email.toLowerCase());
        if (!user) return res.status(401).json({ message: 'البريد أو كلمة المرور غير صحيحة' });

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
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.userId);
    if (!u) return res.status(404).json({ message: 'المستخدم غير موجود' });
    res.json(userRow(u));
});

// === الترتيب ===
app.get('/api/rank', authMiddleware, (req, res) => {
    const users = db.prepare('SELECT id, hours FROM users ORDER BY hours DESC').all();
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

        const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.userId);
        if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });

        const newStreak = calcStreak(user.last_active, user.streak);
        const today = new Date().toDateString();

        db.prepare('INSERT INTO sessions (user_id,start_time,end_time,duration_hours) VALUES (?,?,?,?)')
            .run(req.userId, startTime, endTime, durationHours);
        db.prepare('UPDATE users SET hours=hours+?, sessions=sessions+1, streak=?, last_active=? WHERE id=?')
            .run(durationHours, newStreak, today, req.userId);

        const updated = db.prepare('SELECT * FROM users WHERE id=?').get(req.userId);
        res.json({ message: `تم حفظ ${durationHours.toFixed(2)} ساعة بنجاح`, user: userRow(updated) });
    } catch (err) {
        console.error('Session error:', err);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

app.get('/api/sessions', authMiddleware, (req, res) => {
    const sessions = db.prepare('SELECT * FROM sessions WHERE user_id=? ORDER BY created_at DESC').all(req.userId);
    res.json(sessions);
});

// === الإدارة ===
app.get('/api/admin/stats', authMiddleware, adminMiddleware, (req, res) => {
    const totalVol = db.prepare("SELECT COUNT(*) as c FROM users WHERE role='user'").get().c;
    const totalH = db.prepare("SELECT COALESCE(SUM(hours),0) as t FROM users WHERE role='user'").get().t;
    const avg = totalVol > 0 ? totalH / totalVol : 0;
    const today = new Date().toDateString();
    const activeToday = db.prepare("SELECT COUNT(*) as c FROM users WHERE role='user' AND last_active=?").get(today).c;
    res.json({ totalVolunteers: totalVol, totalHours: Math.round(totalH * 10) / 10, avgHours: Math.round(avg * 10) / 10, activeToday });
});

app.get('/api/admin/users', authMiddleware, adminMiddleware, (req, res) => {
    const users = db.prepare("SELECT * FROM users WHERE role='user' ORDER BY hours DESC").all();
    res.json(users.map(userRow));
});

app.post('/api/admin/users/:id/hours', authMiddleware, adminMiddleware, (req, res) => {
    const { hours } = req.body;
    if (!hours || hours <= 0) return res.status(400).json({ message: 'قيمة الساعات غير صالحة' });

    const user = db.prepare('SELECT id,name FROM users WHERE id=?').get(req.params.id);
    if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });

    db.prepare('UPDATE users SET hours=hours+? WHERE id=?').run(hours, req.params.id);
    res.json({ message: `تمت إضافة ${hours} ساعة لـ ${user.name}` });
});

app.delete('/api/admin/users/:id', authMiddleware, adminMiddleware, (req, res) => {
    const user = db.prepare('SELECT id,name FROM users WHERE id=?').get(req.params.id);
    if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });

    db.prepare('DELETE FROM sessions WHERE user_id=?').run(req.params.id);
    db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
    res.json({ message: `تم حذف ${user.name}` });
});

// === فحص الصحة ===
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// === الصفحة الرئيسية ===
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// === تشغيل ===
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Mersal server running on port ${PORT}`);
});
