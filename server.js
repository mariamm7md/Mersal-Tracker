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

// ====================== Database Setup ======================
let db;
const DB_PATH = process.env.SQLITE_PATH || path.join(__dirname, 'mersal.db');

function saveDB() {
    try {
        const data = db.export();
        const dir = path.dirname(DB_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(DB_PATH, Buffer.from(data));
    } catch (err) {
        console.error('فشل حفظ قاعدة البيانات:', err.message);
    }
}

function dbRun(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    stmt.step();
    stmt.free();
    saveDB();
}

function dbQuery(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
}

function dbGet(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const row = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    return row;
}

async function initDatabase() {
    const SQL = await initSqlJs();
    
    if (fs.existsSync(DB_PATH)) {
        db = new SQL.Database(fs.readFileSync(DB_PATH));
        console.log('تم تحميل قاعدة البيانات الموجودة');
    } else {
        db = new SQL.Database();
        console.log('تم إنشاء قاعدة بيانات جديدة');
    }

    // Create tables
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

    // Create default admin
    if (!dbGet("SELECT id FROM users WHERE role='admin'")) {
        const hash = await bcrypt.hash('admin123', 10);
        dbRun(`INSERT INTO users (id, name, email, password, role, join_date) 
               VALUES (?, ?, ?, ?, ?, ?)`,
            ['admin-001', 'مدير مرسال', 'admin@mersal.org', hash, 'admin', new Date().toISOString()]);
        console.log('✅ تم إنشاء حساب المدير: admin@mersal.org / admin123');
    }

    saveDB();
    console.log('✅ قاعدة البيانات جاهزة');
}

// ====================== Middlewares ======================
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'غير مصرح' });
    }
    try {
        const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch {
        return res.status(401).json({ message: 'انتهت صلاحية الجلسة' });
    }
}

function adminMiddleware(req, res, next) {
    const user = dbGet('SELECT role FROM users WHERE id = ?', [req.userId]);
    if (!user || user.role !== 'admin') {
        return res.status(403).json({ message: 'صلاحيات المدير مطلوبة' });
    }
    next();
}

// ====================== Routes ======================
// Auth
app.post('/api/auth/register', async (req, res) => { /* your original register logic */ });
app.post('/api/auth/login', async (req, res) => { /* your original login logic */ });

// Profile & Rank
app.get('/api/profile', authMiddleware, (req, res) => { /* ... */ });
app.get('/api/rank', authMiddleware, (req, res) => { /* ... */ });

// Sessions
app.post('/api/sessions', authMiddleware, (req, res) => { /* ... */ });
app.get('/api/sessions', authMiddleware, (req, res) => { /* ... */ });

// Admin
app.get('/api/admin/stats', authMiddleware, adminMiddleware, (req, res) => { /* ... */ });
app.get('/api/admin/users', authMiddleware, adminMiddleware, (req, res) => { /* ... */ });
app.post('/api/admin/users/:id/hours', authMiddleware, adminMiddleware, (req, res) => { /* ... */ });
app.delete('/api/admin/users/:id', authMiddleware, adminMiddleware, (req, res) => { /* ... */ });

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Serve frontend
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Start server
initDatabase().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log('====================================');
        console.log('   مرسال - تتبع ساعات التطوع');
        console.log(`   Server running on port: ${PORT}`);
        console.log(`   Database: ${DB_PATH}`);
        console.log('====================================');
    });
}).catch(err => {
    console.error('❌ فشل تشغيل الخادم:', err);
    process.exit(1);
});
