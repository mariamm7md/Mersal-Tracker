const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// --- Configuration ---
const ADMIN_PASSWORD = "mersal2026admin"; 
const DATA_DIR = path.join(__dirname, 'data');
const FILES = {
    volunteers: path.join(DATA_DIR, 'volunteers.json'),
    attendance: path.join(DATA_DIR, 'attendance.json'),
    activities: path.join(DATA_DIR, 'activities.json')
};

// --- Helpers ---
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const readJSON = (file) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : [];
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

// Init Default Data
if (!fs.existsSync(FILES.activities)) {
    writeJSON(FILES.activities, [
        { id: 'medical', nameAr: 'الخدمات الطبية', nameEn: 'Medical Services', color: 'blue' },
        { id: 'education', nameAr: 'التعليم والتدريب', nameEn: 'Education', color: 'green' },
        { id: 'social', nameAr: 'الخدمات الاجتماعية', nameEn: 'Social Services', color: 'purple' }
    ]);
}

// --- API Routes ---

// 1. Login & Registration
app.post('/api/login', (req, res) => {
    const { phone } = req.body;
    const volunteers = readJSON(FILES.volunteers);
    const user = volunteers.find(u => u.phone === phone);
    res.json(user || null);
});

app.post('/api/register', (req, res) => {
    const volunteers = readJSON(FILES.volunteers);
    const { name, phone, activity } = req.body;
    
    let user = volunteers.find(u => u.phone === phone);
    if (user) return res.json(user);

    user = { id: Date.now().toString(), name, phone, activity, createdAt: new Date().toISOString() };
    volunteers.push(user);
    writeJSON(FILES.volunteers, volunteers);
    res.json(user);
});

// 2. Live Timer
app.post('/api/attendance/checkin', (req, res) => {
    const attendance = readJSON(FILES.attendance);
    const { volunteerId } = req.body;
    const now = new Date();
    
    const record = {
        id: Date.now().toString(),
        volunteerId,
        date: now.toISOString(),
        dateStr: now.toISOString().split('T')[0],
        checkIn: now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        checkInTime: now.getTime(),
        checkOut: null,
        checkOutTime: null,
        duration: 0,
        type: 'live'
    };
    
    attendance.push(record);
    writeJSON(FILES.attendance, attendance);
    res.json(record);
});

app.post('/api/attendance/checkout', (req, res) => {
    const attendance = readJSON(FILES.attendance);
    const { volunteerId } = req.body;
    const now = new Date();
    
    const record = attendance.find(r => r.volunteerId === volunteerId && !r.checkOut);
    if (!record) return res.status(400).json({ error: 'No active session' });
    
    record.checkOut = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    record.checkOutTime = now.getTime();
    record.duration = Math.round((record.checkOutTime - record.checkInTime) / 3600000 * 10) / 10;
    
    writeJSON(FILES.attendance, attendance);
    res.json(record);
});

// 3. Manual Entry
app.post('/api/attendance/manual', (req, res) => {
    const attendance = readJSON(FILES.attendance);
    const { volunteerId, date, checkIn, checkOut } = req.body;
    
    const start = new Date(`${date}T${checkIn}`);
    const end = new Date(`${date}T${checkOut}`);
    const duration = Math.round((end - start) / 3600000 * 10) / 10;

    const record = {
        id: Date.now().toString(),
        volunteerId,
        date: new Date(date).toISOString(),
        dateStr: date,
        checkIn,
        checkOut,
        duration: duration > 0 ? duration : 0,
        type: 'manual'
    };

    attendance.push(record);
    writeJSON(FILES.attendance, attendance);
    res.json(record);
});

// 4. Data Retrieval
app.get('/api/attendance/:id', (req, res) => {
    const attendance = readJSON(FILES.attendance);
    const userLogs = attendance.filter(r => r.volunteerId === req.params.id).reverse();
    res.json(userLogs);
});

// 5. Admin Routes
app.post('/api/admin/login', (req, res) => {
    res.json({ success: req.body.password === ADMIN_PASSWORD });
});

app.get('/api/admin/stats', (req, res) => {
    const volunteers = readJSON(FILES.volunteers);
    const attendance = readJSON(FILES.attendance);
    const today = new Date().toISOString().split('T')[0];
    
    const totalHours = attendance.reduce((s, r) => s + (r.duration || 0), 0);
    const activeToday = attendance.filter(r => r.dateStr === today).length;

    res.json({
        totalVolunteers: volunteers.length,
        totalHours: totalHours.toFixed(1),
        totalSessions: attendance.length,
        activeToday
    });
});

app.get('/api/admin/all', (req, res) => {
    res.json({
        volunteers: readJSON(FILES.volunteers),
        attendance: readJSON(FILES.attendance)
    });
});

// 6. Export Excel with Colors (Masterpiece Report)
app.get('/api/export', async (req, res) => {
    const volunteers = readJSON(FILES.volunteers);
    const attendance = readJSON(FILES.attendance);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Mersal Report');

    // Define Columns
    worksheet.columns = [
        { header: 'Date', key: 'date', width: 15 },
        { header: 'Volunteer Name', key: 'name', width: 25 },
        { header: 'Phone', key: 'phone', width: 15 },
        { header: 'Activity', key: 'activity', width: 20 },
        { header: 'Check In', key: 'in', width: 12 },
        { header: 'Check Out', key: 'out', width: 12 },
        { header: 'Hours', key: 'hours', width: 10 },
        { header: 'Type', key: 'type', width: 10 }
    ];

    // Style Header Row
    worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0056b3' } // Mersal Blue
    };
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(1).height = 25;

    // Add Data
    attendance.forEach(log => {
        const user = volunteers.find(v => v.id === log.volunteerId) || {};
        worksheet.addRow({
            date: log.dateStr,
            name: user.name || 'Unknown',
            phone: user.phone || '-',
            activity: user.activity || '-',
            in: log.checkIn,
            out: log.checkOut || '-',
            hours: log.duration || 0,
            type: log.type
        });
    });

    // Style Data Rows (Alternating Colors)
    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
            row.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: rowNumber % 2 === 0 ? 'FFF0F8FF' : 'FFFFFFFF' } // AliceBlue / White
            };
            row.alignment = { vertical: 'middle', horizontal: 'center' };
            
            // Color the Type cell
            const typeCell = row.getCell(8);
            if(typeCell.value === 'live') {
                typeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } }; // Green tint
                typeCell.font = { color: { argb: 'FF065F46' } };
            } else {
                typeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }; // Yellow tint
                typeCell.font = { color: { argb: 'FF92400E' } };
            }
        }
    });

    // Set Content-Disposition
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Mersal_Full_Report.xlsx"');

    await workbook.xlsx.write(res);
    res.end();
});

app.listen(PORT, () => console.log(`Masterpiece Server running on port ${PORT}`));