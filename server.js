/* =============================================
   Mersal Time Keeper - الخادم الكامل
   ============================================= */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const app = express();

// ===== الإعدادات =====
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'mersal_secret_key_2024_change_in_production';
const DATA_DIR = path.join(__dirname, 'data');

// ===== إنشاء مجلد البيانات =====
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ===== Middleware =====
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ===== أدوات مساعدة لقراءة/كتابة البيانات =====
function readJSON(file, fallback = []) {
  try {
    const filePath = path.join(DATA_DIR, file);
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`خطأ في قراءة ${file}:`, err.message);
    return fallback;
  }
}

function writeJSON(file, data) {
  try {
    const filePath = path.join(DATA_DIR, file);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error(`خطأ في كتابة ${file}:`, err.message);
    return false;
  }
}

// ===== التحقق من التوكن =====
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'لم يتم تقديم توكن المصادقة' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'توكن غير صالح أو منتهي الصلاحية' });
  }
}

// ===== التحقق من صلاحيات المدير =====
function adminMiddleware(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ success: false, message: 'صلاحيات المدير مطلوبة' });
  }
  next();
}

// ===== تسجيل نشاط =====
function logActivity(type, description) {
  const activities = readJSON('activities.json', []);
  activities.push({
    id: Date.now() + Math.random(),
    type,
    description,
    timestamp: new Date().toISOString()
  });
  // الاحتفاظ بآخر 1000 نشاط فقط
  if (activities.length > 1000) activities.splice(0, activities.length - 1000);
  writeJSON('activities.json', activities);
}

// ===== أدوات مساعدة =====
function formatDuration(minutes) {
  if (!minutes || minutes <= 0) return '00:00';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h} س ${String(m).padStart(2, '0')} د`;
  return `${String(m).padStart(2, '0')} د`;
}

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

function determineStatus(clockInStr, clockOutStr, settings) {
  const lateThreshold = settings.lateThreshold || 15;
  const [wh, wm] = (settings.workStart || '08:00').split(':').map(Number);
  const [eh, em] = (settings.workEnd || '16:00').split(':').map(Number);
  const workStartMin = wh * 60 + wm;
  const workEndMin = eh * 60 + em;

  const [cih, cim] = clockInStr.split(':').map(Number);
  const clockInMin = cih * 60 + cim;

  let status = 'normal';
  if (clockInMin > workStartMin + lateThreshold) status = 'late';

  if (clockOutStr) {
    const [coh, com] = clockOutStr.split(':').map(Number);
    const clockOutMin = coh * 60 + com;
    if (clockOutMin < workEndMin - lateThreshold && status !== 'late') status = 'early';
  }

  return status;
}


/* =============================================
   مسارات المصادقة
   ============================================= */

// تسجيل دخول المتطوع
app.post('/api/login', (req, res) => {
  try {
    const { user, password } = req.body;

    if (!user || !password) {
      return res.status(400).json({ success: false, message: 'اسم المستخدم وكلمة المرور مطلوبان' });
    }

    const volunteers = readJSON('volunteers.json', []);
    const found = volunteers.find(v => v.user === user);

    if (!found) {
      return res.status(401).json({ success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }

    const isMatch = bcrypt.compareSync(password, found.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }

    const token = jwt.sign(
      { id: found.id, user: found.user, name: found.name, isAdmin: false },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    logActivity('تسجيل دخول', `المتطوع ${found.name} سجل الدخول`);

    res.json({
      success: true,
      message: 'تم تسجيل الدخول بنجاح',
      token,
      user: { id: found.id, name: found.name, user: found.user, department: found.department }
    });
  } catch (err) {
    console.error('خطأ في تسجيل الدخول:', err);
    res.status(500).json({ success: false, message: 'حدث خطأ في الخادم' });
  }
});

// تسجيل دخول المدير
app.post('/api/admin-login', (req, res) => {
  try {
    const { user, password } = req.body;

    if (!user || !password) {
      return res.status(400).json({ success: false, message: 'البيانات مطلوبة' });
    }

    const admins = readJSON('admins.json', []);
    let foundAdmin = admins.find(a => a.user === user);

    // مدير افتراضي إذا لم يكن هناك مديرين
    if (!foundAdmin && admins.length === 0) {
      const defaultHash = bcrypt.hashSync('admin123', 10);
      foundAdmin = { id: 1, user: 'admin', password: defaultHash, name: 'المدير العام' };
      writeJSON('admins.json', [foundAdmin]);
    }

    if (!foundAdmin) {
      return res.status(401).json({ success: false, message: 'بيانات المدير غير صحيحة' });
    }

    const isMatch = bcrypt.compareSync(password, foundAdmin.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'بيانات المدير غير صحيحة' });
    }

    const token = jwt.sign(
      { id: foundAdmin.id, user: foundAdmin.user, name: foundAdmin.name, isAdmin: true },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    logActivity('تسجيل دخول', 'المدير سجل الدخول');

    res.json({
      success: true,
      message: 'تم تسجيل الدخول بنجاح',
      token,
      user: { id: foundAdmin.id, name: foundAdmin.name, user: foundAdmin.user }
    });
  } catch (err) {
    console.error('خطأ في تسجيل دخول المدير:', err);
    res.status(500).json({ success: false, message: 'حدث خطأ في الخادم' });
  }
});

// التحقق من التوكن
app.get('/api/verify', authMiddleware, (req, res) => {
  res.json({ success: true, user: req.user });
});


/* =============================================
   مسارات المتطوعين (CRUD)
   ============================================= */

// جلب كل المتطوعين
app.get('/api/volunteers', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const volunteers = readJSON('volunteers.json', []);
    const activeSessions = readJSON('active_sessions.json', {});
    const result = volunteers.map(v => ({
      id: v.id,
      name: v.name,
      user: v.user,
      department: v.department,
      phone: v.phone || '',
      role: v.role || 'متطوع',
      createdAt: v.createdAt,
      isActive: !!activeSessions[v.id]
    }));
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في جلب البيانات' });
  }
});

// إضافة متطوع
app.post('/api/volunteers', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const { name, user, password, phone, department, role } = req.body;

    if (!name || !user || !password || !department) {
      return res.status(400).json({ success: false, message: 'الاسم واسم المستخدم وكلمة المرور والقسم مطلوبان' });
    }

    const volunteers = readJSON('volunteers.json', []);

    // التحقق من تكرار اسم المستخدم
    if (volunteers.find(v => v.user === user)) {
      return res.status(409).json({ success: false, message: 'اسم المستخدم مستخدم بالفعل' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const newVol = {
      id: Date.now(),
      name: name.trim(),
      user: user.trim(),
      password: hashedPassword,
      phone: (phone || '').trim(),
      department: department.trim(),
      role: (role || 'متطوع').trim(),
      createdAt: getTodayStr()
    };

    volunteers.push(newVol);
    writeJSON('volunteers.json', volunteers);

    logActivity('إضافة متطوع', `تم إضافة ${newVol.name} كمتطوع جديد`);

    res.status(201).json({ success: true, message: 'تم إضافة المتطوع بنجاح', data: { id: newVol.id, name: newVol.name } });
  } catch (err) {
    console.error('خطأ في إضافة متطوع:', err);
    res.status(500).json({ success: false, message: 'خطأ في إضافة المتطوع' });
  }
});

// تعديل متطوع
app.put('/api/volunteers/:id', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const volId = parseInt(req.params.id);
    const { name, user, password, phone, department, role } = req.body;

    const volunteers = readJSON('volunteers.json', []);
    const idx = volunteers.findIndex(v => v.id === volId);
    if (idx === -1) {
      return res.status(404).json({ success: false, message: 'المتطوع غير موجود' });
    }

    // التحقق من تكرار اسم المستخدم
    if (user && user !== volunteers[idx].user) {
      if (volunteers.find(v => v.user === user)) {
        return res.status(409).json({ success: false, message: 'اسم المستخدم مستخدم بالفعل' });
      }
    }

    if (name) volunteers[idx].name = name.trim();
    if (user) volunteers[idx].user = user.trim();
    if (password) volunteers[idx].password = bcrypt.hashSync(password, 10);
    if (phone !== undefined) volunteers[idx].phone = phone.trim();
    if (department) volunteers[idx].department = department.trim();
    if (role) volunteers[idx].role = role.trim();

    writeJSON('volunteers.json', volunteers);

    logActivity('تعديل متطوع', `تم تعديل بيانات ${volunteers[idx].name}`);

    res.json({ success: true, message: 'تم تعديل البيانات بنجاح' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في تعديل المتطوع' });
  }
});

// حذف متطوع
app.delete('/api/volunteers/:id', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const volId = parseInt(req.params.id);
    let volunteers = readJSON('volunteers.json', []);
    const vol = volunteers.find(v => v.id === volId);
    if (!vol) {
      return res.status(404).json({ success: false, message: 'المتطوع غير موجود' });
    }

    volunteers = volunteers.filter(v => v.id !== volId);
    writeJSON('volunteers.json', volunteers);

    // حذف سجلات الحضور
    let attendance = readJSON('attendance.json', []);
    attendance = attendance.filter(a => a.volunteerId !== volId);
    writeJSON('attendance.json', attendance);

    // حذف الجلسة النشطة
    let sessions = readJSON('active_sessions.json', {});
    if (sessions[volId]) {
      delete sessions[volId];
      writeJSON('active_sessions.json', sessions);
    }

    logActivity('حذف متطوع', `تم حذف المتطوع ${vol.name}`);

    res.json({ success: true, message: 'تم حذف المتطوع بنجاح' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في حذف المتطوع' });
  }
});


/* =============================================
   مسارات الحضور والانصراف
   ============================================= */

// تسجيل حضور
app.post('/api/clock-in', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const sessions = readJSON('active_sessions.json', {});

    if (sessions[userId]) {
      return res.status(400).json({ success: false, message: 'أنت مسجل الحضور بالفعل' });
    }

    const now = new Date();
    sessions[userId] = now.toISOString();
    writeJSON('active_sessions.json', sessions);

    logActivity('تسجيل حضور', `${req.user.name} سجل الحضور في ${now.toLocaleTimeString('ar-EG')}`);

    res.json({
      success: true,
      message: 'تم تسجيل الحضور بنجاح',
      data: {
        clockIn: now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
        timestamp: now.toISOString()
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في تسجيل الحضور' });
  }
});

// تسجيل انصراف
app.post('/api/clock-out', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const sessions = readJSON('active_sessions.json', {});

    if (!sessions[userId]) {
      return res.status(400).json({ success: false, message: 'لم تقم بتسجيل الحضور بعد' });
    }

    const clockInTime = new Date(sessions[userId]);
    const now = new Date();
    const clockInStr = `${String(clockInTime.getHours()).padStart(2, '0')}:${String(clockInTime.getMinutes()).padStart(2, '0')}`;
    const clockOutStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const durationMin = Math.round((now - clockInTime) / 60000);
    const dateStr = now.toISOString().split('T')[0];

    // تحديد الحالة
    const settings = readJSON('settings.json', {});
    const status = determineStatus(clockInStr, clockOutStr, settings);

    // جلب بيانات المتطوع
    const volunteers = readJSON('volunteers.json', []);
    const vol = volunteers.find(v => v.id === userId);

    // حفظ سجل الحضور
    const attendance = readJSON('attendance.json', []);
    attendance.push({
      id: Date.now() + Math.random(),
      volunteerId: userId,
      volunteerName: vol ? vol.name : req.user.name,
      department: vol ? vol.department : '',
      date: dateStr,
      clockIn: clockInStr,
      clockOut: clockOutStr,
      duration: durationMin,
      status
    });
    writeJSON('attendance.json', attendance);

    // حذف الجلسة النشطة
    delete sessions[userId];
    writeJSON('active_sessions.json', sessions);

    logActivity('تسجيل انصراف', `${vol ? vol.name : req.user.name} سجل الانصراف في ${clockOutStr} (مدة ${formatDuration(durationMin)})`);

    res.json({
      success: true,
      message: 'تم تسجيل الانصراف بنجاح',
      data: { clockIn: clockInStr, clockOut: clockOutStr, duration: durationMin, durationFormatted: formatDuration(durationMin), status }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في تسجيل الانصراف' });
  }
});

// حالة المستخدم الحالي
app.get('/api/clock-status', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const sessions = readJSON('active_sessions.json', {});

    if (sessions[userId]) {
      const clockInTime = new Date(sessions[userId]);
      const elapsed = Date.now() - clockInTime.getTime();
      res.json({
        success: true,
        data: {
          isClockedIn: true,
          clockIn: sessions[userId],
          elapsed: elapsed,
          clockInFormatted: clockInTime.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
        }
      });
    } else {
      res.json({ success: true, data: { isClockedIn: false } });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ' });
  }
});


/* =============================================
   مسارات سجل الحضور
   ============================================= */

// جلب سجل الحضور (مع فلاتر)
app.get('/api/attendance', authMiddleware, (req, res) => {
  try {
    let attendance = readJSON('attendance.json', []);
    const { dateFrom, dateTo, volunteerId, status, limit } = req.query;

    if (dateFrom) attendance = attendance.filter(a => a.date >= dateFrom);
    if (dateTo) attendance = attendance.filter(a => a.date <= dateTo);
    if (volunteerId) attendance = attendance.filter(a => a.volunteerId == volunteerId);
    if (status) attendance = attendance.filter(a => a.status === status);

    // ترتيب تنازلي
    attendance.sort((a, b) => b.date.localeCompare(a.date) || b.clockIn.localeCompare(a.clockIn));

    // للمستخدم العادي: إرجاع سجلاته فقط
    if (!req.user.isAdmin) {
      attendance = attendance.filter(a => a.volunteerId === req.user.id);
    }

    if (limit) attendance = attendance.slice(0, parseInt(limit));

    res.json({ success: true, data: attendance, total: attendance.length });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في جلب السجلات' });
  }
});

// إحصائيات الحضور للمستخدم الحالي
app.get('/api/my-stats', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const attendance = readJSON('attendance.json', []);
    const sessions = readJSON('active_sessions.json', {});
    const today = getTodayStr();
    const currentMonth = today.slice(0, 7);

    const todayRecords = attendance.filter(a => a.volunteerId === userId && a.date === today);
    const monthRecords = attendance.filter(a => a.volunteerId === userId && a.date.startsWith(currentMonth));
    const monthDays = new Set(monthRecords.map(a => a.date)).size;

    let todayClockIn = '--:--';
    let todayDuration = 0;

    if (sessions[userId]) {
      todayClockIn = new Date(sessions[userId]).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
      todayDuration = Math.round((Date.now() - new Date(sessions[userId]).getTime()) / 60000);
    } else if (todayRecords.length > 0) {
      const last = todayRecords[todayRecords.length - 1];
      todayClockIn = last.clockIn;
      todayDuration = last.duration || 0;
    }

    const totalHours = attendance
      .filter(a => a.volunteerId === userId)
      .reduce((sum, a) => sum + (a.duration || 0), 0);

    res.json({
      success: true,
      data: {
        todayClockIn,
        todayDuration,
        todayDurationFormatted: formatDuration(todayDuration),
        monthDays,
        totalHours: (totalHours / 60).toFixed(1),
        isClockedIn: !!sessions[userId]
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في جلب الإحصائيات' });
  }
});


/* =============================================
   مسارات الإحصائيات (المدير)
   ============================================= */

app.get('/api/stats/overview', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const volunteers = readJSON('volunteers.json', []);
    const attendance = readJSON('attendance.json', []);
    const sessions = readJSON('active_sessions.json', {});
    const today = getTodayStr();

    const totalVolunteers = volunteers.length;
    const activeNow = Object.keys(sessions).length;
    const todayAttendance = [...new Set(attendance.filter(a => a.date === today).map(a => a.volunteerId))].length;
    const totalMinutes = attendance.reduce((sum, a) => sum + (a.duration || 0), 0);

    // إحصائيات أسبوعية
    const weekly = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayName = d.toLocaleDateString('ar-EG', { weekday: 'short' });
      const count = attendance.filter(a => a.date === dateStr).length;
      weekly.push({ date: dateStr, day: dayName, count });
    }

    // توزيع الأقسام
    const deptMap = {};
    attendance.forEach(a => {
      const dept = a.department || 'غير محدد';
      deptMap[dept] = (deptMap[dept] || 0) + 1;
    });
    const departments = Object.entries(deptMap).map(([name, count]) => ({ name, count }));

    res.json({
      success: true,
      data: { totalVolunteers, activeNow, todayAttendance, totalHours: (totalMinutes / 60).toFixed(1), weekly, departments }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في جلب الإحصائيات' });
  }
});


/* =============================================
   مسارات الإعدادات
   ============================================= */

// جلب الإعدادات
app.get('/api/settings', authMiddleware, (req, res) => {
  try {
    const settings = readJSON('settings.json', {});
    res.json({
      success: true,
      data: {
        workStart: settings.workStart || '08:00',
        workEnd: settings.workEnd || '16:00',
        lateThreshold: settings.lateThreshold || 15
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ' });
  }
});

// حفظ الإعدادات
app.put('/api/settings', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const { workStart, workEnd, lateThreshold } = req.body;
    const settings = {
      workStart: workStart || '08:00',
      workEnd: workEnd || '16:00',
      lateThreshold: parseInt(lateThreshold) || 15
    };
    writeJSON('settings.json', settings);

    logActivity('تعديل إعدادات', `تم تحديث إعدادات ساعات العمل: ${settings.workStart} - ${settings.workEnd}`);

    res.json({ success: true, message: 'تم حفظ الإعدادات بنجاح' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في حفظ الإعدادات' });
  }
});


/* =============================================
   مسارات سجل الأنشطة
   ============================================= */

app.get('/api/activities', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const activities = readJSON('activities.json', []);
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const limit = parseInt(req.query.limit) || 100;
    res.json({ success: true, data: activities.slice(0, limit), total: activities.length });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ' });
  }
});

app.delete('/api/activities', authMiddleware, adminMiddleware, (req, res) => {
  writeJSON('activities.json', []);
  res.json({ success: true, message: 'تم مسح سجل الأنشطة' });
});


/* =============================================
   مسارات التصدير
   ============================================= */

// تصدير CSV
app.get('/api/export/attendance-csv', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const attendance = readJSON('attendance.json', []);
    if (attendance.length === 0) {
      return res.status(404).json({ success: false, message: 'لا توجد بيانات للتصدير' });
    }

    const statusMap = { normal: 'عادي', late: 'متأخر', early: 'انصراف مبكر' };
    const BOM = '\uFEFF';
    const headers = ['المتطوع', 'القسم', 'التاريخ', 'وقت الدخول', 'وقت الخروج', 'المدة (دقيقة)', 'الحالة'];
    const rows = attendance.map(a => [
      a.volunteerName, a.department || '', a.date, a.clockIn, a.clockOut || '', a.duration || '', statusMap[a.status] || a.status
    ]);

    const csv = BOM + [headers, ...rows].map(r => r.map(cell => `"${cell}"`).join(',')).join('\n');

    logActivity('تصدير بيانات', 'تم تصدير سجل الحضور كملف CSV');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=attendance_export.csv');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في التصدير' });
  }
});

// تصدير نسخة احتياطية كاملة
app.get('/api/export/full-backup', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const backup = {
      volunteers: readJSON('volunteers.json', []),
      attendance: readJSON('attendance.json', []),
      activities: readJSON('activities.json', []),
      settings: readJSON('settings.json', {}),
      activeSessions: readJSON('active_sessions.json', {}),
      exportDate: new Date().toISOString(),
      version: '1.0.0'
    };

    logActivity('تصدير بيانات', 'تم تصدير نسخة احتياطية كاملة');

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=mersal_backup.json');
    res.json(backup);
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في التصدير' });
  }
});


/* =============================================
   مسارات إعادة التعيين
   ============================================= */

app.post('/api/reset-all', authMiddleware, adminMiddleware, (req, res) => {
  try {
    writeJSON('volunteers.json', []);
    writeJSON('attendance.json', []);
    writeJSON('activities.json', []);
    writeJSON('active_sessions.json', {});
    writeJSON('settings.json', {});

    res.json({ success: true, message: 'تم إعادة تعيين جميع البيانات' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في إعادة التعيين' });
  }
});


/* =============================================
   مسارات الصفحات (fallback)
   ============================================= */

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/admin-dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-dashboard.html'));
});

// للمسارات غير الموجودة
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'المسار غير موجود' });
});

// معالجة الأخطاء العامة
app.use((err, req, res, next) => {
  console.error('خطأ غير متوقع:', err);
  res.status(500).json({ success: false, message: 'حدث خطأ داخلي في الخادم' });
});


/* =============================================
   بدء الخادم
   ============================================= */

app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║   Mersal Time Keeper - الخادم يعمل      ║
  ╠══════════════════════════════════════════╣
  ║  العنوان: http://localhost:${PORT}          ║
  ║  البيئة:  ${process.env.NODE_ENV || 'تطوير'}                        ║
  ║  البيانات: ${DATA_DIR}              ║
  ╚══════════════════════════════════════════╝
  `);
});
