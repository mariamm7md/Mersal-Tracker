// server.js
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Data paths
const DATA_DIR = path.join(__dirname, 'data');
const VOLUNTEERS_FILE = path.join(DATA_DIR, 'volunteers.json');
const ATTENDANCE_FILE = path.join(DATA_DIR, 'attendance.json');
const ACTIVITIES_FILE = path.join(DATA_DIR, 'activities.json');

// Admin password
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'mersal2024admin';

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Helper functions
function readJSON(filePath, defaultValue = []) {
    try {
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data);
        }
        return defaultValue;
    } catch (error) {
        console.error(`Error reading ${filePath}:`, error);
        return defaultValue;
    }
}

function writeJSON(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error(`Error writing ${filePath}:`, error);
        return false;
    }
}

// Initialize default activities
function initActivities() {
    if (!fs.existsSync(ACTIVITIES_FILE)) {
        const defaultActivities = [
            { id: 'medical', nameAr: 'الخدمات الطبية', nameEn: 'Medical Services', color: 'medical' },
            { id: 'education', nameAr: 'التعليم والتدريب', nameEn: 'Education & Training', color: 'education' },
            { id: 'social', nameAr: 'الخدمات الاجتماعية', nameEn: 'Social Services', color: 'social' },
            { id: 'events', nameAr: 'الفعاليات والأنشطة', nameEn: 'Events & Activities', color: 'events' }
        ];
        writeJSON(ACTIVITIES_FILE, defaultActivities);
    }
}

initActivities();

// ===============================
// API ROUTES
// ===============================

// Volunteers
app.get('/api/volunteers', (req, res) => {
    const volunteers = readJSON(VOLUNTEERS_FILE);
    res.json(volunteers);
});

app.get('/api/volunteers/:id', (req, res) => {
    const volunteers = readJSON(VOLUNTEERS_FILE);
    const volunteer = volunteers.find(v => v.id === req.params.id);
    
    if (!volunteer) {
        return res.status(404).json({ error: 'Volunteer not found' });
    }
    
    res.json(volunteer);
});

app.post('/api/volunteers', (req, res) => {
    const volunteers = readJSON(VOLUNTEERS_FILE);
    const { name, phone, activity } = req.body;
    
    // Check if phone already exists
    const existing = volunteers.find(v => v.phone === phone);
    if (existing) {
        return res.status(400).json({ error: 'Phone number already registered' });
    }
    
    const newVolunteer = {
        id: Date.now().toString(),
        name,
        phone,
        activity,
        createdAt: new Date().toISOString()
    };
    
    volunteers.push(newVolunteer);
    writeJSON(VOLUNTEERS_FILE, volunteers);
    
    res.status(201).json(newVolunteer);
});

app.put('/api/volunteers/:id', (req, res) => {
    const volunteers = readJSON(VOLUNTEERS_FILE);
    const index = volunteers.findIndex(v => v.id === req.params.id);
    
    if (index === -1) {
        return res.status(404).json({ error: 'Volunteer not found' });
    }
    
    volunteers[index] = { ...volunteers[index], ...req.body };
    writeJSON(VOLUNTEERS_FILE, volunteers);
    
    res.json(volunteers[index]);
});

app.delete('/api/volunteers/:id', (req, res) => {
    const volunteers = readJSON(VOLUNTEERS_FILE);
    const filtered = volunteers.filter(v => v.id !== req.params.id);
    
    writeJSON(VOLUNTEERS_FILE, filtered);
    res.json({ message: 'Volunteer deleted' });
});

// Attendance
app.get('/api/attendance', (req, res) => {
    const attendance = readJSON(ATTENDANCE_FILE);
    res.json(attendance);
});

app.get('/api/attendance/volunteer/:volunteerId', (req, res) => {
    const attendance = readJSON(ATTENDANCE_FILE);
    const records = attendance.filter(r => r.volunteerId === req.params.volunteerId);
    res.json(records);
});

app.post('/api/attendance/checkin', (req, res) => {
    const attendance = readJSON(ATTENDANCE_FILE);
    const { volunteerId } = req.body;
    
    if (!volunteerId) {
        return res.status(400).json({ error: 'Volunteer ID required' });
    }
    
    // Check if already checked in today
    const today = new Date().toDateString();
    const existingRecord = attendance.find(r => 
        r.volunteerId === volunteerId && 
        new Date(r.date).toDateString() === today &&
        !r.checkOut
    );
    
    if (existingRecord) {
        return res.status(400).json({ error: 'Already checked in' });
    }
    
    const now = new Date();
    const record = {
        id: Date.now().toString(),
        volunteerId,
        date: now.toISOString(),
        checkIn: now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        checkInTime: now.toISOString(),
        checkOut: null,
        duration: 0
    };
    
    attendance.push(record);
    writeJSON(ATTENDANCE_FILE, attendance);
    
    res.status(201).json(record);
});

app.post('/api/attendance/checkout', (req, res) => {
    const attendance = readJSON(ATTENDANCE_FILE);
    const { volunteerId } = req.body;
    
    if (!volunteerId) {
        return res.status(400).json({ error: 'Volunteer ID required' });
    }
    
    const today = new Date().toDateString();
    const recordIndex = attendance.findIndex(r => 
        r.volunteerId === volunteerId && 
        new Date(r.date).toDateString() === today &&
        !r.checkOut
    );
    
    if (recordIndex === -1) {
        return res.status(400).json({ error: 'No active check-in found' });
    }
    
    const now = new Date();
    const record = attendance[recordIndex];
    record.checkOut = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    record.duration = Math.round((now - new Date(record.checkInTime)) / 3600000 * 10) / 10;
    
    writeJSON(ATTENDANCE_FILE, attendance);
    
    res.json(record);
});

// Activities
app.get('/api/activities', (req, res) => {
    const activities = readJSON(ACTIVITIES_FILE);
    res.json(activities);
});

app.post('/api/activities', (req, res) => {
    const activities = readJSON(ACTIVITIES_FILE);
    const { nameAr, nameEn } = req.body;
    
    const newActivity = {
        id: nameEn.toLowerCase().replace(/\s+/g, '_'),
        nameAr,
        nameEn,
        color: 'other'
    };
    
    activities.push(newActivity);
    writeJSON(ACTIVITIES_FILE, activities);
    
    res.status(201).json(newActivity);
});

app.delete('/api/activities/:id', (req, res) => {
    const activities = readJSON(ACTIVITIES_FILE);
    const filtered = activities.filter(a => a.id !== req.params.id);
    
    writeJSON(ACTIVITIES_FILE, filtered);
    res.json({ message: 'Activity deleted' });
});

// Admin authentication
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    
    if (password === ADMIN_PASSWORD) {
        res.json({ success: true, message: 'Login successful' });
    } else {
        res.status(401).json({ success: false, message: 'Invalid password' });
    }
});

// Stats
app.get('/api/stats', (req, res) => {
    const volunteers = readJSON(VOLUNTEERS_FILE);
    const attendance = readJSON(ATTENDANCE_FILE);
    
    const totalHours = attendance.reduce((sum, r) => sum + (r.duration || 0), 0);
    const totalDays = attendance.length;
    
    const today = new Date().toDateString();
    const activeToday = attendance.filter(r => 
        new Date(r.date).toDateString() === today
    ).length;
    
    res.json({
        totalVolunteers: volunteers.length,
        totalHours: Math.round(totalHours * 10) / 10,
        totalDays,
        activeToday
    });
});

// Export to Excel
app.get('/api/export/excel', (req, res) => {
    const volunteers = readJSON(VOLUNTEERS_FILE);
    const attendance = readJSON(ATTENDANCE_FILE);
    const activities = readJSON(ACTIVITIES_FILE);
    
    // Volunteers summary
    const volunteerData = volunteers.map(v => {
        const records = attendance.filter(r => r.volunteerId === v.id);
        const totalHours = records.reduce((sum, r) => sum + (r.duration || 0), 0);
        const totalDays = records.length;
        const activity = activities.find(a => a.id === v.activity);
        
        return {
            'Name': v.name,
            'Phone': v.phone,
            'Activity': activity ? activity.nameEn : v.activity,
            'Total Hours': totalHours.toFixed(1),
            'Days Attended': totalDays,
            'Registration Date': new Date(v.createdAt).toLocaleDateString()
        };
    });
    
    // Attendance records
    const attendanceData = attendance.map(r => {
        const volunteer = volunteers.find(v => v.id === r.volunteerId);
        return {
            'Volunteer Name': volunteer ? volunteer.name : 'Unknown',
            'Phone': volunteer ? volunteer.phone : '-',
            'Date': new Date(r.date).toLocaleDateString(),
            'Check In': r.checkIn,
            'Check Out': r.checkOut || '-',
            'Duration (Hours)': (r.duration || 0).toFixed(1)
        };
    });
    
    const wb = XLSX.utils.book_new();
    
    const ws1 = XLSX.utils.json_to_sheet(volunteerData);
    XLSX.utils.book_append_sheet(wb, ws1, 'Volunteers Summary');
    
    const ws2 = XLSX.utils.json_to_sheet(attendanceData);
    XLSX.utils.book_append_sheet(wb, ws2, 'Attendance Records');
    
    const fileName = `Mersal_Export_${new Date().toISOString().split('T')[0]}.xlsx`;
    const filePath = path.join(DATA_DIR, fileName);
    
    XLSX.writeFile(wb, filePath);
    
    res.download(filePath, fileName, (err) => {
        if (err) console.error(err);
        fs.unlinkSync(filePath); // Clean up after download
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Mersal Server running on port ${PORT}`);
    console.log(`Admin Password: ${ADMIN_PASSWORD}`);
});

module.exports = app;