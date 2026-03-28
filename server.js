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

app.use(cors());
app.use(express.json());

// ====================== Excel Functions ======================
async function loadWorkbook() {
    const workbook = new ExcelJS.Workbook();
    if (fs.existsSync(EXCEL_FILE)) {
        await workbook.xlsx.readFile(EXCEL_FILE);
    } else {
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
        console.log('✅ تم إنشاء ملف Excel جديد');
        console.log('   admin@mersal.org / admin123');
    }
    return workbook;
}

async function saveWorkbook(workbook) {
    await workbook.xlsx.writeFile(EXCEL_FILE);
}

// ====================== API Routes (مختصرة للاختبار) ======================
// ... (يمكنك لاحقاً إضافة باقي الروابط الكاملة)

// ====================== Static + SPA Fallback (الجزء الأهم) ======================
app.use(express.static(__dirname));

app.get('*', (req, res) => {
    const indexPath = path.join(__dirname, 'index.html');
    console.log('Attempting to serve:', indexPath);   // للتصحيح
    res.sendFile(indexPath, (err) => {
        if (err) {
            console.error('Error sending index.html:', err.message);
            res.status(500).send('خطأ في الخادم - الملف غير موجود');
        }
    });
});

// ====================== Start ======================
loadWorkbook().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log('====================================');
        console.log('   مرسال - تتبع ساعات التطوع');
        console.log(`   المنفذ: ${PORT}`);
        console.log(`   ملف البيانات: ${EXCEL_FILE}`);
        console.log('====================================');
    });
}).catch(err => console.error('خطأ:', err));
