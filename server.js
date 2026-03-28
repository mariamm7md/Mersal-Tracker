const express = require('express');
const ExcelJS = require('exceljs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'mersal-secret-change-in-production';
const EXCEL_FILE = path.join(__dirname, 'mersal-data.xlsx');
const TARGET_HOURS = 130;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ====================== Excel Helper Functions ======================
async function loadWorkbook() {
    const workbook = new ExcelJS.Workbook();
    if (fs.existsSync(EXCEL_FILE)) {
        await workbook.xlsx.readFile(EXCEL_FILE);
    } else {
        // إنشاء ملف Excel جديد مع الأوراق المطلوبة
        const usersSheet = workbook.addWorksheet('Users');
        usersSheet.columns = [
            { header: 'ID', key: 'id', width: 15 },
            { header: 'Name', key: 'name', width: 25 },
            { header: 'Email', key: 'email', width: 30 },
            { header: 'Password', key: 'password', width: 40 },
            { header: 'Role', key: 'role', width: 10 },
            { header: 'Hours', key: 'hours', width: 10 },
            { header: 'Sessions', key: 'sessions', width: 10 },
            { header: 'Streak', key: 'streak', width: 10 },
            { header: 'LastActive', key: 'lastActive', width: 15 },
            { header: 'JoinDate', key: 'joinDate', width: 20 }
        ];

        const sessionsSheet = workbook.addWorksheet('Sessions');
        sessionsSheet.columns = [
            { header: 'ID', key: 'id', width: 10 },
            { header: 'UserID', key: 'userId', width: 15 },
            { header: 'StartTime', key: 'startTime', width: 25 },
            { header: 'EndTime', key: 'endTime', width: 25 },
            { header: 'DurationHours', key: 'durationHours', width: 15 }
        ];

        // إضافة حساب المدير الافتراضي
        const hash = await bcrypt.hash('admin123', 10);
        usersSheet.addRow({
            id: 'admin-001',
            name: 'مدير مرسال',
            email: 'admin@mersal.org',
            password: hash,
            role: 'admin',
            hours: 0,
            sessions: 0,
            streak: 0,
            lastActive: '',
            joinDate: new Date().toISOString()
        });

        await workbook.xlsx.writeFile(EXCEL_FILE);
        console.log('✅ تم إنشاء ملف Excel جديد مع حساب المدير (admin@mersal.org / admin123)');
    }
    return workbook;
}

async function saveWorkbook(workbook) {
    await workbook.xlsx.writeFile(EXCEL_FILE);
}

async function getUsers() {
    const wb = await loadWorkbook();
    const sheet = wb.getWorksheet('Users');
    const users = [];
    sheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
            users.push({
                id: row.getCell(1).value,
                name: row.getCell(2).value,
                email: row.getCell(3).value,
                password: row.getCell(4).value,
                role: row.getCell(5).value,
                hours: parseFloat(row.getCell(6).value || 0),
                sessions: parseInt(row.getCell(7).value || 0),
                streak: parseInt(row.getCell(8).value || 0),
                lastActive: row.getCell(9).value,
                joinDate: row.getCell(10).value
            });
        }
    });
    return users;
}

async function getUserByEmail(email) {
    const users = await getUsers();
    return users.find(u => u.email.toLowerCase() === email.toLowerCase());
}

async function getUserById(id) {
    const users = await getUsers();
    return users.find(u => u.id === id);
}

async function updateUser(user) {
    const wb = await loadWorkbook();
    const sheet = wb.getWorksheet('Users');
    let found = false;
    sheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1 && row.getCell(1).value === user.id) {
            row.getCell(6).value = user.hours;
            row.getCell(7).value = user.sessions;
            row.getCell(8).value = user.streak;
            row.getCell(9).value = user.lastActive;
            found = true;
        }
    });
    if (!found) {
        sheet.addRow([user.id, user.name, user.email, user.password, user.role, user.hours, user.sessions, user.streak, user.lastActive, user.joinDate]);
    }
    await saveWorkbook(wb);
}

// ====================== Middlewares ======================
function authMiddleware(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ message: 'غير مصرح' });
    try {
        const decoded = jwt.verify(auth.split(' ')[1], JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch {
        res.status(401).json({ message: 'انتهت صلاحية الجلسة' });
    }
}

function adminMiddleware(req, res, next) {
    // سيتم التحقق داخل الراوت
    next();
}

// ====================== Routes ======================
// Register
app.post('/api/auth/register', async (req, res) => {
    const { name, email, password, role } = req.body;
    if (!name || name.length < 2 || !email || !password || password.length < 4) {
        return res.status(400).json({ message: 'بيانات غير مكتملة' });
    }
    const existing = await getUserByEmail(email);
    if (existing) return res.status(400).json({ message: 'البريد مسجل مسبقاً' });

    const hash = await bcrypt.hash(password, 10);
    const id = 'u-' + Date.now();

    const wb = await loadWorkbook();
    const sheet = wb.getWorksheet('Users');
    sheet.addRow([id, name, email.toLowerCase(), hash, role || 'user', 0, 0, 0, '', new Date().toISOString()]);
    await saveWorkbook(wb);

    res.status(201).json({ message: 'تم إنشاء الحساب بنجاح' });
});

// Login
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await getUserByEmail(email);
    if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ message: 'البريد أو كلمة المرور غير صحيحة' });
    }
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, hours: user.hours, sessions: user.sessions, streak: user.streak, joinDate: user.joinDate } });
});

// Profile
app.get('/api/profile', authMiddleware, async (req, res) => {
    const user = await getUserById(req.userId);
    if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role, hours: user.hours, sessions: user.sessions, streak: user.streak, joinDate: user.joinDate });
});

// Add Session
app.post('/api/sessions', authMiddleware, async (req, res) => {
    const { startTime, endTime, durationHours } = req.body;
    if (!durationHours || durationHours < 0.01) return res.status(400).json({ message: 'الجلسة قصيرة جداً' });

    let user = await getUserById(req.userId);
    user.hours = (user.hours || 0) + durationHours;
    user.sessions = (user.sessions || 0) + 1;
    user.lastActive = new Date().toDateString();

    await updateUser(user);

    // حفظ الجلسة في ورقة Sessions
    const wb = await loadWorkbook();
    const sheet = wb.getWorksheet('Sessions');
    sheet.addRow([Date.now(), req.userId, startTime, endTime, durationHours]);
    await saveWorkbook(wb);

    res.json({ message: `تم حفظ ${durationHours.toFixed(2)} ساعة بنجاح`, user: { hours: user.hours, sessions: user.sessions } });
});

// Get User Sessions
app.get('/api/sessions', authMiddleware, async (req, res) => {
    const wb = await loadWorkbook();
    const sheet = wb.getWorksheet('Sessions');
    const sessions = [];
    sheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1 && row.getCell(2).value === req.userId) {
            sessions.push({
                id: row.getCell(1).value,
                start_time: row.getCell(3).value,
                end_time: row.getCell(4).value,
                duration_hours: parseFloat(row.getCell(5).value)
            });
        }
    });
    res.json(sessions.sort((a,b) => b.id - a.id));
});

// Admin - Download Excel
app.get('/api/admin/download', authMiddleware, async (req, res) => {
    const user = await getUserById(req.userId);
    if (!user || user.role !== 'admin') return res.status(403).json({ message: 'صلاحيات المدير مطلوبة' });

    res.download(EXCEL_FILE, 'mersal-data.xlsx');
});

// Admin - Add Hours to User
app.post('/api/admin/users/:id/hours', authMiddleware, async (req, res) => {
    const admin = await getUserById(req.userId);
    if (!admin || admin.role !== 'admin') return res.status(403).json({ message: 'صلاحيات المدير مطلوبة' });

    const { hours } = req.body;
    if (!hours || hours <= 0) return res.status(400).json({ message: 'قيمة غير صالحة' });

    let user = await getUserById(req.params.id);
    if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });

    user.hours += parseFloat(hours);
    await updateUser(user);

    res.json({ message: `تم إضافة ${hours} ساعة` });
});

// Health
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Serve Frontend
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Start
loadWorkbook().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log('====================================');
        console.log('   مرسال - تتبع ساعات التطوع (Excel)');
        console.log(`   Port: ${PORT}`);
        console.log(`   Data File: ${EXCEL_FILE}`);
        console.log('====================================');
    });
}).catch(err => console.error('خطأ:', err));
