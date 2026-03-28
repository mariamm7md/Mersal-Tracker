const express = require('express');
const ExcelJS = require('exceljs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'mersal-secret-2024';
const DB_PATH = path.join(__dirname, 'mersal-database.xlsx');

app.use(express.json());
app.use(express.static(__dirname));

// دالة لتهيئة أو تحميل ملف القاعدة (Excel)
async function getDB() {
    const wb = new ExcelJS.Workbook();
    if (fs.existsSync(DB_PATH)) {
        await wb.xlsx.readFile(DB_PATH);
    } else {
        const users = wb.addWorksheet('Users');
        users.columns = [
            { header: 'id', key: 'id' },
            { header: 'name', key: 'name' },
            { header: 'email', key: 'email' },
            { header: 'phone', key: 'phone' },
            { header: 'password', key: 'password' },
            { header: 'role', key: 'role' },
            { header: 'hours', key: 'hours' },
            { header: 'sessions', key: 'sessions' }
        ];
        // إضافة مدير افتراضي
        const adminHash = await bcrypt.hash('admin123', 10);
        users.addRow(['admin-1', 'المدير العام', 'admin@mersal.org', '0123456789', adminHash, 'admin', 0, 0]);
        await wb.xlsx.writeFile(DB_PATH);
    }
    return wb;
}

// التحقق من الهوية (Middleware)
function authenticate(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'دخول غير مصرح' });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch { res.status(401).json({ message: 'انتهت الجلسة' }); }
}

// --- المسارات (Routes) ---

// 1. تسجيل مستخدم جديد
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, phone, password, role } = req.body;
        const wb = await getDB();
        const sheet = wb.getWorksheet('Users');
        
        // التأكد من عدم تكرار البريد أو الهاتف
        let exists = false;
        sheet.eachRow(row => {
            if (row.getCell(3).value === email || row.getCell(4).value === phone) exists = true;
        });
        if (exists) return res.status(400).json({ message: 'البريد أو الهاتف مسجل بالفعل' });

        const hash = await bcrypt.hash(password, 10);
        sheet.addRow([Date.now(), name, email, phone, hash, role, 0, 0]);
        await wb.xlsx.writeFile(DB_PATH);
        res.json({ message: 'تم التسجيل بنجاح' });
    } catch (e) { res.status(500).json({ message: 'خطأ في السيرفر' }); }
});

// 2. تسجيل الدخول (بالبريد أو الهاتف)
app.post('/api/auth/login', async (req, res) => {
    const { loginId, password } = req.body;
    const wb = await getDB();
    const sheet = wb.getWorksheet('Users');
    let userRow = null;

    sheet.eachRow((row, rowNum) => {
        if (rowNum === 1) return;
        if (row.getCell(3).value == loginId || row.getCell(4).value == loginId) userRow = row;
    });

    if (!userRow) return res.status(400).json({ message: 'المستخدم غير موجود' });

    const match = await bcrypt.compare(password, userRow.getCell(5).value);
    if (!match) return res.status(400).json({ message: 'كلمة مرور خاطئة' });

    const token = jwt.sign({ id: userRow.getCell(1).value, role: userRow.getCell(6).value }, JWT_SECRET);
    res.json({
        token,
        user: {
            name: userRow.getCell(2).value,
            role: userRow.getCell(6).value,
            hours: userRow.getCell(7).value || 0,
            sessions: userRow.getCell(8).value || 0
        }
    });
});

// 3. تحديث الساعات عند إنهاء الجلسة
app.post('/api/session/save', authenticate, async (req, res) => {
    const { durationHours } = req.body;
    const wb = await getDB();
    const sheet = wb.getWorksheet('Users');
    
    sheet.eachRow(row => {
        if (row.getCell(1).value == req.user.id) {
            row.getCell(7).value = (Number(row.getCell(7).value) || 0) + durationHours;
            row.getCell(8).value = (Number(row.getCell(8).value) || 0) + 1;
        }
    });
    await wb.xlsx.writeFile(DB_PATH);
    res.json({ success: true });
});

// 4. تحميل ملف البيانات (للأدمن فقط)
app.get('/api/admin/download', authenticate, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).send('غير مسموح');
    res.download(DB_PATH);
});

app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
