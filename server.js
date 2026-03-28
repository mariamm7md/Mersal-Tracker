const express = require('express');
const app = express();
const path = require('path');

app.use(express.json());
// لتقديم ملفات الصور والتنسيقات (CSS/JS)
app.use(express.static('public')); 

// بيانات وهمية (يُفضل لاحقاً وضعها في ملف JSON أو قاعدة بيانات)
let volunteers = [
    { id: "1", name: "أحمد", email: "a@test.com", phone: "0123", password: "123", hours: 10, sessions: 2 }
];
let targetHours = 130;

// ================= ROUTES (المسارات) =================

// 1. مسار جلب البيانات الأولية
app.get('/api/init', (req, res) => {
    res.json({
        success: true,
        volunteers: volunteers,
        target: targetHours
    });
});

// 2. مسار تسجيل الدخول
app.post('/api/verify-login', (req, res) => {
    const { id, password } = req.body;
    const user = volunteers.find(u => u.id === id && u.password === password);
    
    if (user) {
        res.json({ success: true });
    } else {
        res.json({ success: false, message: "بيانات خاطئة" });
    }
});

// 3. مسار تسجيل متطوع جديد
app.post('/api/register', (req, res) => {
    const newUser = req.body;
    volunteers.push(newUser);
    res.json({ success: true });
});

// 4. مسار تحديث البيانات (حفظ الساعات)
app.post('/api/update-volunteer', (req, res) => {
    const updatedUser = req.body;
    const index = volunteers.findIndex(u => u.id === updatedUser.id);
    if (index !== -1) {
        volunteers[index] = updatedUser;
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

// تشغيل الصفحة الرئيسية
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
