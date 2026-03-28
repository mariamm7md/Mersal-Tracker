// ================= GLOBAL STATE =================
let users = [];
let currentUser = null;
let intervalId = null;
let startTime = null;
let target = 130;

// ================= INIT =================
async function init() {
    try {
        const res = await fetch('/api/init');
        const data = await res.json();

        if (data.success) {
            users = data.volunteers || [];
            target = data.target || 130;
        } else {
            alert("فشل تحميل البيانات");
        }
    } catch (e) {
        console.error(e);
        alert("خطأ في الاتصال بالسيرفر");
    }
}

init();

// ================= NAVIGATION =================
function go(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

// ================= LOGIN =================
async function doLogin() {
    const loginId = document.getElementById('l-user').value.trim().toLowerCase();
    const pass = document.getElementById('l-pass').value;

    if (!loginId || !pass) {
        alert("من فضلك أدخل كل البيانات");
        return;
    }

    const user = users.find(u =>
        (u.email && u.email.toLowerCase() === loginId) ||
        u.phone === loginId
    );

    if (!user) {
        alert("المستخدم غير موجود");
        return;
    }

    try {
        const res = await fetch('/api/verify-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: user.id, password: pass })
        });

        const data = await res.json();

        if (data.success) {
            currentUser = user;
            updateUI();
            go('p-dash');
        } else {
            alert("كلمة المرور غير صحيحة");
        }

    } catch (e) {
        console.error(e);
        alert("خطأ في السيرفر");
    }
}

// ================= REGISTER =================
async function doRegister() {
    const name = document.getElementById('r-name').value.trim();
    const email = document.getElementById('r-email').value.trim();
    const phone = document.getElementById('r-phone').value.trim();
    const password = document.getElementById('r-pass').value;

    if (!name || !email || !password) {
        alert("املأ جميع البيانات المطلوبة");
        return;
    }

    const user = {
        id: Date.now().toString(),
        name,
        email,
        phone,
        password
    };

    try {
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(user)
        });

        const data = await res.json();

        if (data.success) {
            alert("تم التسجيل بنجاح");
            location.reload();
        } else {
            alert("فشل التسجيل");
        }

    } catch (e) {
        console.error(e);
        alert("خطأ في السيرفر");
    }
}

// ================= UI UPDATE =================
function updateUI() {
    document.getElementById('u-name').innerText = `مرحباً ${currentUser.name}`;

    const percent = Math.min((currentUser.hours / target) * 100, 100);
    document.getElementById('u-prog').style.width = percent + "%";

    document.getElementById('u-stats').innerText =
        `${currentUser.hours.toFixed(1)} / ${target} ساعة | جلسات: ${currentUser.sessions}`;
}

// ================= TIMER =================
function toggleTimer() {
    const btn = document.getElementById('btn-timer');
    const display = document.getElementById('timer-display');

    // START
    if (!startTime) {
        startTime = new Date();

        btn.innerText = "إنهاء الجلسة";
        btn.style.background = "var(--danger)";

        intervalId = setInterval(() => {
            const diff = Math.floor((new Date() - startTime) / 1000);

            const h = String(Math.floor(diff / 3600)).padStart(2, '0');
            const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
            const s = String(diff % 60).padStart(2, '0');

            display.innerText = `${h}:${m}:${s}`;
        }, 1000);

    } else {
        // STOP
        const hours = (new Date() - startTime) / 3600000;

        currentUser.hours += hours;
        currentUser.sessions += 1;

        saveUser(currentUser);

        clearInterval(intervalId);
        startTime = null;

        display.innerText = "00:00:00";

        btn.innerText = "بدء الجلسة";
        btn.style.background = "var(--p)";

        updateUI();
    }
}

// ================= SAVE =================
async function saveUser(user) {
    try {
        await fetch('/api/update-volunteer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(user)
        });
    } catch (e) {
        console.error(e);
        alert("فشل حفظ البيانات");
    }
}

// ================= LOGOUT =================
function logout() {
    location.reload();
}
