/* =============================================
   زرع البيانات التجريبية
   تشغيل: node seed.js
   ============================================= */

const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function writeJSON(file, data) {
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2), 'utf8');
}

// ===== المتطوعين =====
const volunteers = [
  { id: 1, user: 'user1', name: 'أحمد محمد عبدالله', password: bcrypt.hashSync('123456', 10), department: 'الخدمات الاجتماعية', phone: '0501234567', role: 'متطوع', createdAt: '2024-01-15' },
  { id: 2, user: 'user2', name: 'فاطمة علي حسن', password: bcrypt.hashSync('123456', 10), department: 'التعليم والتدريب', phone: '0507654321', role: 'متطوعة', createdAt: '2024-02-20' },
  { id: 3, user: 'user3', name: 'خالد حسن أحمد', password: bcrypt.hashSync('123456', 10), department: 'الصحة والإسعاف', phone: '0509876543', role: 'متطوع', createdAt: '2024-03-10' },
  { id: 4, user: 'user4', name: 'نورة سعد الدين', password: bcrypt.hashSync('123456', 10), department: 'الخدمات الاجتماعية', phone: '0503456789', role: 'متطوعة', createdAt: '2024-04-05' },
  { id: 5, user: 'user5', name: 'محمد فيصل العتيبي', password: bcrypt.hashSync('123456', 10), department: 'اللوجستيات', phone: '0502345678', role: 'متطوع', createdAt: '2024-05-12' },
  { id: 6, user: 'user6', name: 'سارة عبدالرحمن القحطاني', password: bcrypt.hashSync('123456', 10), department: 'الإعلام والتواصل', phone: '0508765432', role: 'متطوعة', createdAt: '2024-06-01' },
  { id: 7, user: 'user7', name: 'عبدالله ناصر المالكي', password: bcrypt.hashSync('123456', 10), department: 'التعليم والتدريب', phone: '0505678901', role: 'متطوع', createdAt: '2024-06-15' },
  { id: 8, user: 'user8', name: 'ريم خالد الشمري', password: bcrypt.hashSync('123456', 10), department: 'الصحة والإسعاف', phone: '0504321098', role: 'متطوعة', createdAt: '2024-07-20' },
];

// ===== المدير =====
const admins = [
  { id: 1, user: 'admin', name: 'المدير العام', password: bcrypt.hashSync('admin123', 10) }
];

// ===== الإعدادات =====
const settings = {
  workStart: '08:00',
  workEnd: '16:00',
  lateThreshold: 15
};

// ===== بيانات حضور تجريبية (آخر 14 يوم) =====
const attendance = [];
const now = new Date();

for (let d = 13; d >= 0; d--) {
  const date = new Date(now);
  date.setDate(date.getDate() - d);
  if (date.getDay() === 5) continue; // الجمعة

  const dateStr = date.toISOString().split('T')[0];
  const numPresent = 3 + Math.floor(Math.random() * (volunteers.length - 2));
  const shuffled = [...volunteers].sort(() => Math.random() - 0.5).slice(0, numPresent);

  shuffled.forEach(vol => {
    const baseHour = 7 + Math.floor(Math.random() * 2);
    const baseMin = Math.floor(Math.random() * 60);
    const clockIn = `${String(baseHour).padStart(2, '0')}:${String(baseMin).padStart(2, '0')}`;

    const workHours = 5 + Math.floor(Math.random() * 5);
    const outHour = Math.min(baseHour + workHours, 23);
    const outMin = Math.floor(Math.random() * 60);
    const clockOut = `${String(outHour).padStart(2, '0')}:${String(outMin).padStart(2, '0')}`;

    const durationMin = (outHour * 60 + outMin) - (baseHour * 60 + baseMin);
    const clockInMin = baseHour * 60 + baseMin;
    const workStartMin = 8 * 60 + 15; // 08:15

    let status = 'normal';
    if (clockInMin > workStartMin) status = 'late';
    const clockOutMin = outHour * 60 + outMin;
    if (clockOutMin < (15 * 60 + 45) && status !== 'late') status = 'early';

    attendance.push({
      id: Date.now() + Math.random() * 10000,
      volunteerId: vol.id,
      volunteerName: vol.name,
      department: vol.department,
      date: dateStr,
      clockIn,
      clockOut,
      duration: durationMin,
      status
    });
  });
}

// ===== أنشطة تجريبية =====
const activities = [
  { id: 1, type: 'تسجيل دخول', description: 'المدير سجل الدخول', timestamp: new Date(now - 3600000).toISOString() },
  { id: 2, type: 'تسجيل حضور', description: 'أحمد محمد عبدالله سجل الحضور في 08:05', timestamp: new Date(now - 3000000).toISOString() },
  { id: 3, type: 'تسجيل حضور', description: 'فاطمة علي حسن سجل الحضور في 08:12', timestamp: new Date(now - 2400000).toISOString() },
  { id: 4, type: 'تعديل إعدادات', description: 'تم تحديث إعدادات ساعات العمل', timestamp: new Date(now - 86400000).toISOString() },
  { id: 5, type: 'إضافة متطوع', description: 'تم إضافة ريم خالد الشمري كمتطوعة جديدة', timestamp: new Date(now - 172800000).toISOString() },
];

// ===== الكتابة =====
writeJSON('volunteers.json', volunteers);
writeJSON('admins.json', admins);
writeJSON('settings.json', settings);
writeJSON('attendance.json', attendance);
writeJSON('activities.json', activities);
writeJSON('active_sessions.json', {});

console.log(`
╔══════════════════════════════════════════╗
║   تم زرع البيانات التجريبية بنجاح      ║
╠══════════════════════════════════════════╣
║  المتطوعين:    ${volunteers.length}                         ║
║  سجلات الحضور: ${attendance.length}                        ║
║  الأنشطة:      ${activities.length}                          ║
╠══════════════════════════════════════════╣
║  بيانات الدخول:                          ║
║  متطوع: user1 / 123456                   ║
║  مدير:  admin  / admin123                 ║
╚══════════════════════════════════════════╝
`);
