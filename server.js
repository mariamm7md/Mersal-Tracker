<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mersal Tracker | مرسال</title>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap" rel="stylesheet">
    <style>
        :root { --p: #2563eb; --bg: #f8fafc; --txt: #0f172a; --card: #ffffff; --border: #e2e8f0; }
        [data-theme="dark"] { --bg: #0f172a; --txt: #f1f5f9; --card: #1e293b; --border: #334151; }
        * { box-sizing: border-box; font-family: 'Cairo', sans-serif; transition: 0.3s; }
        body { background: var(--bg); color: var(--txt); margin: 0; padding: 20px; }
        .container { max-width: 500px; margin: 0 auto; }
        .card { background: var(--card); padding: 25px; border-radius: 16px; border: 1px solid var(--border); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); margin-bottom: 20px; }
        .page { display: none; }
        .active { display: block; animation: fadeIn 0.4s; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        input, button { width: 100%; padding: 12px; margin: 8px 0; border-radius: 10px; border: 1px solid var(--border); font-size: 16px; }
        button { background: var(--p); color: white; border: none; font-weight: bold; cursor: pointer; }
        .timer { font-size: 45px; font-weight: 800; text-align: center; color: var(--p); margin: 20px 0; }
        .progress-bar { height: 10px; background: #e2e8f0; border-radius: 10px; overflow: hidden; }
        .progress-fill { height: 100%; background: #22c55e; width: 0%; transition: 0.5s; }
        .theme-btn { position: fixed; top: 10px; left: 10px; width: 40px; height: 40px; border-radius: 50%; padding: 0; }
    </style>
</head>
<body>

<button class="theme-btn" onclick="toggleTheme()">🌓</button>

<div class="container">
    <!-- Login -->
    <div id="p-login" class="page active">
        <div class="card" style="text-align: center;">
            <h1 style="color: var(--p);">مرسال</h1>
            <input type="text" id="l-id" placeholder="البريد أو الهاتف">
            <input type="password" id="l-pass" placeholder="كلمة المرور">
            <button onclick="login()">تسجيل الدخول</button>
            <p onclick="showPage('p-reg')" style="cursor:pointer; font-size:14px;">ليس لديك حساب؟ سجل الآن</p>
        </div>
    </div>

    <!-- Register -->
    <div id="p-reg" class="page">
        <div class="card">
            <h3>حساب جديد</h3>
            <input type="text" id="r-name" placeholder="الاسم الكامل">
            <input type="email" id="r-email" placeholder="البريد الإلكتروني">
            <input type="password" id="r-pass" placeholder="كلمة المرور">
            <button onclick="register()">إنشاء الحساب</button>
            <button onclick="showPage('p-login')" style="background:#64748b;">عودة</button>
        </div>
    </div>

    <!-- Dashboard -->
    <div id="p-dash" class="page">
        <div class="card" style="background: var(--p); color: white; border: none;">
            <h2 id="u-name">مرحباً</h2>
            <div style="display:flex; justify-content:space-between; margin-bottom:5px;"><span id="u-target">0 / 130 ساعة</span></div>
            <div class="progress-bar"><div id="u-fill" class="progress-fill"></div></div>
        </div>
        <div class="card" style="text-align: center;">
            <div class="timer" id="timer">00:00:00</div>
            <button id="timer-btn" onclick="toggleTimer()" style="background:#22c55e;">بدء المهمة</button>
            <button onclick="logout()" style="background:none; color:var(--txt); margin-top:10px; border:1px solid var(--border);">خروج</button>
        </div>
    </div>
</div>

<script>
    // الأدوات الأساسية وفحص المتصفح لمنع الـ Crash في Railway
    const $ = id => document.getElementById(id);
    const isBrowser = typeof window !== 'undefined' && window.localStorage;

    let users = isBrowser ? JSON.parse(localStorage.getItem('m_users')) || [] : [];
    let currentUser = null;
    let timerInt = null;
    let startTime = null;

    function save() { if(isBrowser) localStorage.setItem('m_users', JSON.stringify(users)); }

    function showPage(id) {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        $(id).classList.add('active');
    }

    function login() {
        const user = users.find(u => u.email === $('l-id').value && u.pass === $('l-pass').value);
        if(user) { currentUser = user; updateUI(); showPage('p-dash'); }
        else alert('خطأ في البيانات');
    }

    function register() {
        if(!$('r-name').value || !$('r-pass').value) return alert('أكمل البيانات');
        const newUser = { name: $('r-name').value, email: $('r-email').value, pass: $('r-pass').value, hours: 0 };
        users.push(newUser); save(); currentUser = newUser;
        updateUI(); showPage('p-dash');
    }

    function toggleTimer() {
        if(!startTime) {
            startTime = new Date();
            timerInt = setInterval(() => {
                const diff = new Date() - startTime;
                const h = String(Math.floor(diff/3600000)).padStart(2,'0');
                const m = String(Math.floor((diff%3600000)/60000)).padStart(2,'0');
                const s = String(Math.floor((diff%60000)/1000)).padStart(2,'0');
                $('timer').textContent = `${h}:${m}:${s}`;
            }, 1000);
            $('timer-btn').textContent = 'إيقاف';
            $('timer-btn').style.background = '#ef4444';
        } else {
            const finalDiff = (new Date() - startTime) / 3600000;
            currentUser.hours += finalDiff;
            save(); clearInterval(timerInt); startTime = null;
            $('timer').textContent = '00:00:00';
            $('timer-btn').textContent = 'بدء المهمة';
            $('timer-btn').style.background = '#22c55e';
            updateUI();
        }
    }

    function updateUI() {
        $('u-name').textContent = currentUser.name;
        $('u-target').textContent = `${currentUser.hours.toFixed(1)} / 130 ساعة`;
        $('u-fill').style.width = Math.min((currentUser.hours / 130) * 100, 100) + '%';
    }

    function logout() { currentUser = null; showPage('p-login'); }

    function toggleTheme() {
        const theme = document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.body.setAttribute('data-theme', theme);
        if(isBrowser) localStorage.setItem('m_theme', theme);
    }
    if(isBrowser && localStorage.getItem('m_theme') === 'dark') document.body.setAttribute('data-theme', 'dark');
</script>

</body>
</html>
