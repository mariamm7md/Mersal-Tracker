/**
 * Mersal Tracker - Core Logic
 * نظام مرسال لتتبع الساعات - المنطق البرمجي
 */

// 1. الإعدادات العامة والمتغيرات
const state = {
    users: JSON.parse(localStorage.getItem('m_v2_users')) || [
        { 
            id: 'admin-001',
            name: "مدير مرسال", 
            email: "admin@mersal.org", 
            pass: "admin123", 
            hours: 0, 
            sessions: 0, 
            role: 'admin' 
        }
    ],
    currentUser: null,
    timerInterval: null,
    startTime: null,
    targetHours: 130
};

// 2. دوال المساعدة (Helper Functions)
const $ = id => document.getElementById(id);
const saveToDisk = () => localStorage.setItem('m_v2_users', JSON.stringify(state.users));

/**
 * التنقل بين الصفحات مع تأثير بصري
 */
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    $(pageId).classList.add('active');
    
    // إذا كانت الصفحة هي الإدارة، قم بتحديث القائمة
    if (pageId === 'p-admin') renderAdminDashboard();
}

// 3. نظام الحسابات (Auth System)

/**
 * تسجيل الدخول
 */
function login() {
    const email = $('l-id').value.trim().toLowerCase();
    const pass = $('l-pass').value;

    const user = state.users.find(u => u.email.toLowerCase() === email && u.pass === pass);

    if (user) {
        state.currentUser = user;
        updateUserUI();
        showPage('p-dash');
        
        // إظهار ميزات الأدمن إذا لزم الأمر
        const isAdmin = user.role === 'admin';
        $('admin-btn').classList.toggle('hidden', !isAdmin);
        $('u-role').classList.toggle('hidden', !isAdmin);
    } else {
        showToast('خطأ في البريد أو كلمة المرور', 'danger');
    }
}

/**
 * إنشاء حساب متطوع جديد
 */
function register() {
    const name = $('r-name').value.trim();
    const email = $('r-email').value.trim().toLowerCase();
    const pass = $('r-pass').value;

    if (!name || !email || !pass) {
        return showToast('يرجى ملء جميع الحقول', 'danger');
    }

    if (state.users.some(u => u.email === email)) {
        return showToast('هذا البريد مسجل مسبقاً', 'danger');
    }

    const newUser = {
        id: 'u-' + Date.now(),
        name,
        email,
        pass,
        hours: 0,
        sessions: 0,
        role: 'user',
        joinDate: new Date().toISOString()
    };

    state.users.push(newUser);
    saveToDisk();
    showToast('تم التسجيل بنجاح! يمكنك الدخول الآن', 'success');
    showPage('p-login');
}

// 4. نظام التايمر (Timer System)

/**
 * تبديل حالة المؤقت (بدء/إيقاف)
 */
function toggleTimer() {
    const btn = $('timer-btn');
    
    if (!state.startTime) {
        // بدء الجلسة
        state.startTime = new Date();
        state.timerInterval = setInterval(updateTimerDisplay, 1000);
        
        btn.innerHTML = "⏹️ إنهاء المهمة";
        btn.style.background = 'var(--danger)';
        showToast('بدأت المهمة، بالتوفيق!', 'success');
    } else {
        // إنهاء الجلسة وحساب الوقت
        const endTime = new Date();
        const diffMs = endTime - state.startTime;
        const diffHours = diffMs / 3600000; // تحويل من ميلي ثانية إلى ساعات

        state.currentUser.hours += diffHours;
        state.currentUser.sessions += 1;
        
        saveToDisk();
        clearInterval(state.timerInterval);
        state.startTime = null;
        
        // إعادة ضبط الواجهة
        $('timer').textContent = '00:00:00';
        btn.innerHTML = "▶️ بدء المهمة";
        btn.style.background = 'var(--success)';
        
        updateUserUI();
        showToast(`تم حفظ ${diffHours.toFixed(2)} ساعة بنجاح`, 'success');
    }
}

function updateTimerDisplay() {
    const diff = new Date() - state.startTime;
    const h = String(Math.floor(diff / 3600000)).padStart(2, '0');
    const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
    const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
    $('timer').textContent = `${h}:${m}:${s}`;
}

// 5. واجهة المستخدم (UI Updates)

function updateUserUI() {
    if (!state.currentUser) return;

    $('u-name').textContent = `أهلاً، ${state.currentUser.name.split(' ')[0]}`;
    
    const hours = state.currentUser.hours || 0;
    $('u-target-text').textContent = `${hours.toFixed(1)} / ${state.targetHours} ساعة`;
    
    // تحديث شريط التقدم
    const progress = Math.min((hours / state.targetHours) * 100, 100);
    $('u-fill').style.width = `${progress}%`;
    
    $('u-sessions').textContent = state.currentUser.sessions || 0;

    // حساب الترتيب (Ranking)
    const sortedUsers = [...state.users].sort((a, b) => b.hours - a.hours);
    const rank = sortedUsers.findIndex(u => u.id === state.currentUser.id) + 1;
    $('u-rank').textContent = `#${rank}`;
}

// 6. لوحة الإدارة (Admin Logic)

function renderAdminDashboard() {
    const listContainer = $('admin-user-list');
    listContainer.innerHTML = ''; // تفريغ القائمة

    state.users.forEach((user, index) => {
        const item = document.createElement('div');
        item.className = 'user-list-item';
        item.innerHTML = `
            <div>
                <strong>${user.name}</strong> ${user.role === 'admin' ? '<span class="badge admin-badge">أدمن</span>' : ''}<br>
                <small style="color:var(--text-secondary)">${user.hours.toFixed(1)} ساعة | ${user.sessions} جلسة</small>
            </div>
            <div style="display:flex; gap:8px;">
                <button onclick="adminModifyHours(${index}, 1)" style="width:auto; padding:5px 10px; background:var(--success); font-size:12px;">+ ساعة</button>
                <button onclick="adminModifyHours(${index}, -1)" style="width:auto; padding:5px 10px; background:var(--border); font-size:12px; color:var(--txt)">- ساعة</button>
                ${user.role !== 'admin' ? `
                    <button onclick="adminDeleteUser(${index})" style="width:auto; padding:5px 10px; background:var(--danger); font-size:12px;">حذف</button>
                ` : ''}
            </div>
        `;
        listContainer.appendChild(item);
    });
}

function adminModifyHours(userIndex, amount) {
    state.users[userIndex].hours = Math.max(0, state.users[userIndex].hours + amount);
    saveToDisk();
    renderAdminDashboard();
    showToast('تم تعديل الساعات بنجاح', 'success');
}

function adminDeleteUser(userIndex) {
    if (confirm(`هل أنت متأكد من حذف حساب ${state.users[userIndex].name}؟ لا يمكن التراجع عن هذا الإجراء.`)) {
        state.users.splice(userIndex, 1);
        saveToDisk();
        renderAdminDashboard();
        showToast('تم حذف المستخدم', 'danger');
    }
}

// 7. وظائف إضافية

function toggleTheme() {
    const currentTheme = document.body.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', newTheme);
    localStorage.setItem('m_theme', newTheme);
}

function showToast(msg, type = 'success') {
    // يمكنك استبدال هذا بـ Toast library احترافية لاحقاً
    alert(msg); 
}

function logout() {
    if (state.startTime && !confirm('لديك جلسة تعمل حالياً، هل تريد الخروج دون حفظ الوقت؟')) return;
    
    clearInterval(state.timerInterval);
    state.startTime = null;
    state.currentUser = null;
    showPage('p-login');
}

// تنفيذ عند بدء التشغيل
(function init() {
    const savedTheme = localStorage.getItem('m_theme');
    if (savedTheme) document.body.setAttribute('data-theme', savedTheme);
})();
