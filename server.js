<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mersal Tracker - All-in-One</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        :root {
            /* Light Theme Variables */
            --bg: #f8fafc; --card: #ffffff; --text: #0f172a; --muted: #64748b;
            --primary: #2563eb; --primary-dark: #1d4ed8; --success: #059669; --danger: #dc2626;
            --border: #e2e8f0; --radius: 16px; --input-bg: #ffffff;
        }

        [data-theme="dark"] {
            /* Dark Theme Variables */
            --bg: #0f172a; --card: #1e293b; --text: #f1f5f9; --muted: #94a3b8;
            --border: #334151; --input-bg: #0f172a; --primary: #3b82f6;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; transition: background 0.3s, color 0.3s; }
        body { font-family: 'Inter', sans-serif; background: var(--bg); color: var(--text); line-height: 1.5; }
        
        /* Theme Toggle Button */
        .theme-toggle {
            position: fixed; top: 20px; right: 20px; z-index: 1000;
            background: var(--card); border: 1px solid var(--border);
            padding: 10px; border-radius: 50%; cursor: pointer;
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); font-size: 20px;
            display: flex; align-items: center; justify-content: center;
        }

        .app-container { max-width: 500px; margin: 0 auto; padding: 20px; min-height: 100vh; }
        .page { display: none; }
        .page.active { display: block; animation: fadeIn 0.3s ease; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }

        .card { background: var(--card); border-radius: var(--radius); padding: 24px; margin-bottom: 20px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border: 1px solid var(--border); }
        .btn { width: 100%; padding: 14px; border: none; border-radius: 12px; font-family: inherit; font-weight: 600; font-size: 15px; cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px; }
        .btn-primary { background: var(--primary); color: white; }
        .btn-success { background: var(--success); color: white; }
        .btn-danger { background: var(--danger); color: white; }
        .btn-outline { background: transparent; border: 2px solid var(--border); color: var(--text); }
        .btn:active { transform: scale(0.98); }
        
        .input-group { margin-bottom: 16px; }
        .input-label { display: block; font-size: 13px; font-weight: 600; color: var(--muted); margin-bottom: 6px; }
        .input-field { width: 100%; padding: 12px 16px; border: 2px solid var(--border); border-radius: 12px; background: var(--input-bg); color: var(--text); font-family: inherit; font-size: 15px; }

        .header-box { background: linear-gradient(135deg, var(--primary), var(--primary-dark)); border-radius: var(--radius); padding: 25px; color: white; margin-bottom: 20px; position: relative; }
        .user-row { display: flex; justify-content: space-between; align-items: center; }
        .avatar { width: 50px; height: 50px; border-radius: 50%; background: rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; font-weight: bold; border: 2px solid rgba(255,255,255,0.8); }
        .progress-bg { height: 8px; background: rgba(0,0,0,0.2); border-radius: 10px; overflow: hidden; margin-top: 15px; }
        .progress-fill { height: 100%; background: #34d399; transition: width 0.5s; }

        .timer-display { font-size: 48px; font-weight: 800; text-align: center; color: var(--primary); margin: 10px 0; }
        .status-badge { text-align: center; font-size: 12px; font-weight: 700; padding: 6px 16px; border-radius: 20px; display: inline-block; margin-bottom: 15px; text-transform: uppercase; }
        .status-active { background: #d1fae5; color: #065f46; }
        .status-inactive { background: #fee2e2; color: #991b1b; }

        .modal { position: fixed; top:0; left:0; right:0; bottom:0; background: rgba(15, 23, 42, 0.7); backdrop-filter: blur(4px); display: none; align-items: center; justify-content: center; z-index: 1100; padding: 20px; }
        .modal.active { display: flex; }
        .modal-content { background: var(--card); padding: 30px; border-radius: var(--radius); width: 100%; max-width: 400px; }
        
        .admin-tabs { display: flex; background: var(--bg); border-radius: 12px; padding: 4px; margin-bottom: 20px; border: 1px solid var(--border); }
        .admin-tab { flex: 1; padding: 10px; border: none; background: transparent; color: var(--muted); font-weight: 600; border-radius: 8px; cursor: pointer; }
        .admin-tab.active { background: var(--primary); color: white; }
        .admin-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .admin-table th { text-align: left; padding: 12px 10px; border-bottom: 2px solid var(--border); color: var(--muted); }
        .admin-table td { padding: 12px 10px; border-bottom: 1px solid var(--border); }
    </style>
</head>
<body>

<button class="theme-toggle" onclick="toggleTheme()" id="theme-btn">🌓</button>

<div class="app-container">
    
    <!-- Login Page -->
    <div id="page-login" class="page active">
        <div style="min-height: 80vh; display: flex; flex-direction: column; justify-content: center;">
            <div class="card" style="text-align: center;">
                <h1 style="font-size: 28px; font-weight: 800; color: var(--primary);">Mersal</h1>
                <p style="color: var(--muted); margin-bottom: 30px;">Volunteer Tracker</p>
                <div class="input-group"><input type="text" id="login-id" class="input-field" placeholder="Email or Phone"></div>
                <div class="input-group"><input type="password" id="login-pass" class="input-field" placeholder="Password"></div>
                <button class="btn btn-primary" onclick="login()">Sign In</button>
                <button class="btn btn-outline" style="margin-top:12px;" onclick="showPage('page-register')">Create Account</button>
                <p style="margin-top:20px; font-size:13px; color:var(--muted); cursor:pointer" onclick="showPage('page-admin-login')">Admin Portal</p>
            </div>
        </div>
    </div>

    <!-- Register Page -->
    <div id="page-register" class="page">
        <div class="card">
            <h2>Join Mersal</h2>
            <div class="input-group"><label class="input-label">Full Name</label><input type="text" id="reg-name" class="input-field"></div>
            <div class="input-group"><label class="input-label">Email</label><input type="email" id="reg-email" class="input-field"></div>
            <div class="input-group"><label class="input-label">Phone</label><input type="tel" id="reg-phone" class="input-field"></div>
            <div class="input-group"><label class="input-label">Password</label><input type="password" id="reg-pass" class="input-field"></div>
            <button class="btn btn-primary" onclick="register()">Create Account</button>
            <button class="btn btn-outline" style="margin-top:12px;" onclick="showPage('page-login')">Back</button>
        </div>
    </div>

    <!-- Activity Select Page -->
    <div id="page-activity-select" class="page">
        <div class="card">
            <h2 style="text-align: center; margin-bottom:20px;">Check-in</h2>
            <div class="input-group">
                <label class="input-label">Select Activity</label>
                <select id="select-activity" class="input-field" onchange="handleActivityChange(this)"></select>
            </div>
            <div class="input-group" id="manual-activity-group" style="display:none;">
                <input type="text" id="manual-activity-input" class="input-field" placeholder="Activity name">
            </div>
            <button class="btn btn-success" onclick="startSessionWithActivity()">Clock In Now</button>
        </div>
    </div>

    <!-- Main Dashboard -->
    <div id="page-dash" class="page">
        <div class="header-box">
            <div class="user-row">
                <div style="display:flex; align-items:center; gap:12px; cursor:pointer;" onclick="openProfileModal()">
                    <div class="avatar"><span id="dash-avatar-letter">M</span></div>
                    <div><h2 id="dash-name" style="font-size: 18px;">User</h2></div>
                </div>
                <button onclick="logout()" style="background:rgba(255,255,255,0.2); color:white; border:none; padding:8px 12px; border-radius:8px; cursor:pointer;">Exit</button>
            </div>
            <div style="display: flex; justify-content: space-between; margin-top: 20px;"><span id="prog-text">0 / 130h</span></div>
            <div class="progress-bg"><div class="progress-fill" id="prog-fill" style="width: 0%"></div></div>
        </div>

        <div class="card">
            <div style="text-align: center;">
                <span class="status-badge status-inactive" id="status-badge">Ready</span>
                <div class="timer-display" id="timer">00:00:00</div>
                <div id="current-activity-display" style="margin-bottom:15px; font-weight:600; color:var(--primary);">No Task</div>
            </div>
            <button id="main-action-btn" class="btn btn-success" onclick="handleMainAction()">Clock In</button>
            <div style="display: flex; justify-content: space-around; margin-top: 20px;">
                <div style="text-align:center;"><small>Total Hours</small><div id="total-hours" style="font-size:20px; font-weight:800;">0.00</div></div>
                <div style="text-align:center;"><small>Sessions</small><div id="total-sessions" style="font-size:20px; font-weight:800;">0</div></div>
            </div>
        </div>
    </div>

    <!-- Admin Pages -->
    <div id="page-admin-login" class="page">
        <div class="card">
            <h2>Admin Login</h2>
            <input type="password" id="admin-pass" class="input-field" placeholder="Password" style="margin-top:15px;">
            <button class="btn btn-primary" style="margin-top:15px;" onclick="adminLogin()">Login</button>
            <button class="btn btn-outline" style="margin-top:10px;" onclick="showPage('page-login')">Back</button>
        </div>
    </div>

    <div id="page-admin" class="page">
        <div class="admin-tabs">
            <button class="admin-tab active" onclick="switchTab('users', this)">Volunteers</button>
            <button class="admin-tab" onclick="switchTab('activities', this)">Settings</button>
        </div>

        <div id="tab-users" class="admin-section">
            <div class="card" style="overflow-x:auto;">
                <table class="admin-table">
                    <thead><tr><th>Name</th><th>Hours</th><th>Action</th></tr></thead>
                    <tbody id="admin-users-body"></tbody>
                </table>
            </div>
        </div>

        <div id="tab-activities" class="admin-section" style="display:none;">
            <div class="card">
                <h3>Global Target</h3>
                <input type="number" id="global-target-input" class="input-field" style="margin-top:10px;">
                <button class="btn btn-primary" style="margin-top:10px;" onclick="updateGlobalTarget()">Update</button>
            </div>
            <div class="card">
                <h3>Activity List</h3>
                <div style="display:flex; gap:5px; margin-bottom:15px;">
                    <input type="text" id="new-act-name" class="input-field" placeholder="Add activity">
                    <button class="btn btn-primary" style="width:auto;" onclick="addActivity()">Add</button>
                </div>
                <div id="admin-act-list"></div>
            </div>
        </div>
        <button class="btn btn-outline" onclick="logout()">Logout</button>
    </div>
</div>

<!-- Edit Profile Modal -->
<div class="modal" id="modal-profile">
    <div class="modal-content">
        <h3 id="modal-title">Edit Profile</h3>
        <div class="input-group"><label class="input-label">Name</label><input type="text" id="edit-name" class="input-field"></div>
        <div class="input-group"><label class="input-label">Email</label><input type="email" id="edit-email" class="input-field"></div>
        <div class="input-group"><label class="input-label">Phone</label><input type="tel" id="edit-phone" class="input-field"></div>
        <div id="admin-only-edit" style="display:none;">
            <div class="input-group"><label class="input-label">Manual Hours Adjustment</label><input type="number" id="edit-hours" class="input-field"></div>
        </div>
        <button class="btn btn-success" onclick="saveProfileChanges()">Save</button>
        <button class="btn btn-outline" style="margin-top:8px;" onclick="closeModal('modal-profile')">Cancel</button>
    </div>
</div>

<script>
    // --- Utils & Initial State ---
    const $ = id => document.getElementById(id);
    const showPage = id => { document.querySelectorAll('.page').forEach(p => p.classList.remove('active')); $(id).classList.add('active'); };

    let allVolunteers = JSON.parse(localStorage.getItem('mersal_users')) || [];
    let activitiesList = JSON.parse(localStorage.getItem('mersal_acts')) || ['معرض الملابس', 'فرز الملابس', 'قوافل غزة'];
    let globalTarget = localStorage.getItem('mersal_target') || 130;

    let currentUser = null;
    let timerInterval = null;
    let sessionStart = null;

    function saveData() {
        localStorage.setItem('mersal_users', JSON.stringify(allVolunteers));
        localStorage.setItem('mersal_acts', JSON.stringify(activitiesList));
        localStorage.setItem('mersal_target', globalTarget);
    }

    // --- Theme Control ---
    function toggleTheme() {
        const current = document.body.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.body.setAttribute('data-theme', next);
        localStorage.setItem('mersal_theme', next);
    }
    if(localStorage.getItem('mersal_theme') === 'dark') document.body.setAttribute('data-theme', 'dark');

    // --- Authentication ---
    function login() {
        const idVal = $('login-id').value;
        const passVal = $('login-pass').value;
        const user = allVolunteers.find(u => (u.email === idVal || u.phone === idVal) && u.password === passVal);
        if(user) { 
            currentUser = user; 
            loadUserActivities(); 
            showPage('page-activity-select'); 
        } else alert('Invalid credentials');
    }

    function register() {
        const name = $('reg-name').value;
        const email = $('reg-email').value;
        const phone = $('reg-phone').value;
        const password = $('reg-pass').value;
        if(!name || !email || !password) return alert('Fill required fields');
        const newUser = { id: Date.now().toString(), name, email, phone, password, hours: 0, sessions: 0 };
        allVolunteers.push(newUser); saveData(); currentUser = newUser;
        loadUserActivities(); showPage('page-activity-select');
    }

    // --- Dashboard & Timer ---
    function loadUserActivities() {
        $('select-activity').innerHTML = activitiesList.map(a => `<option value="${a}">${a}</option>`).join('') + `<option value="other">Other...</option>`;
    }

    function handleActivityChange(el) { $('manual-activity-group').style.display = el.value === 'other' ? 'block' : 'none'; }

    function startSessionWithActivity() {
        const sel = $('select-activity').value;
        $('current-activity-display').textContent = sel === 'other' ? $('manual-activity-input').value : sel;
        updateUI(); showPage('page-dash');
    }

    function handleMainAction() {
        if(!sessionStart) {
            sessionStart = new Date();
            timerInterval = setInterval(() => {
                const diff = new Date() - sessionStart;
                const h = String(Math.floor(diff/3600000)).padStart(2,'0');
                const m = String(Math.floor((diff%3600000)/60000)).padStart(2,'0');
                const s = String(Math.floor((diff%60000)/1000)).padStart(2,'0');
                $('timer').textContent = `${h}:${m}:${s}`;
            }, 1000);
            $('status-badge').className = 'status-badge status-active';
            $('status-badge').textContent = 'Live';
            $('main-action-btn').textContent = 'Stop Session';
            $('main-action-btn').className = 'btn btn-danger';
        } else {
            const diff = (new Date() - sessionStart) / 3600000;
            currentUser.hours += diff; currentUser.sessions++; saveData();
            clearInterval(timerInterval); sessionStart = null;
            $('timer').textContent = '00:00:00';
            $('status-badge').className = 'status-badge status-inactive';
            $('status-badge').textContent = 'Ready';
            $('main-action-btn').textContent = 'Clock In';
            $('main-action-btn').className = 'btn btn-success';
            updateUI();
        }
    }

    function updateUI() {
        $('dash-name').textContent = currentUser.name;
        $('dash-avatar-letter').textContent = currentUser.name.charAt(0).toUpperCase();
        $('total-hours').textContent = currentUser.hours.toFixed(2);
        $('total-sessions').textContent = currentUser.sessions;
        const prog = (currentUser.hours / globalTarget) * 100;
        $('prog-fill').style.width = Math.min(prog, 100) + '%';
        $('prog-text').textContent = `${Math.floor(currentUser.hours)} / ${globalTarget}h`;
    }

    function logout() { currentUser = null; clearInterval(timerInterval); showPage('page-login'); }

    // --- Admin Control ---
    function adminLogin() { if($('admin-pass').value === 'admin123') { loadAdmin(); showPage('page-admin'); } }
    function loadAdmin() {
        $('admin-users-body').innerHTML = allVolunteers.map(v => `
            <tr>
                <td><b>${v.name}</b></td>
                <td>${v.hours.toFixed(1)}h</td>
                <td><button onclick="adminEditUser('${v.id}')" style="color:var(--primary); background:none; border:none; font-weight:700; cursor:pointer;">Edit</button></td>
            </tr>`).join('');
        renderAdminActs();
        $('global-target-input').value = globalTarget;
    }

    function renderAdminActs() {
        $('admin-act-list').innerHTML = activitiesList.map((a, i) => `
            <div style="display:flex; justify-content:space-between; padding:8px; border-bottom:1px solid var(--border);">
                <span>${a}</span><span style="color:var(--danger); cursor:pointer;" onclick="activitiesList.splice(${i},1); saveData(); renderAdminActs();">Delete</span>
            </div>`).join('');
    }

    function addActivity() { const n = $('new-act-name').value; if(n){ activitiesList.push(n); $('new-act-name').value=''; saveData(); renderAdminActs(); }}
    function updateGlobalTarget() { globalTarget = $('global-target-input').value; saveData(); alert('Saved'); }

    // --- Modal & Profile ---
    let editingId = null;
    function adminEditUser(id) {
        editingId = id; const u = allVolunteers.find(v => v.id === id);
        $('modal-title').textContent = "Admin Edit";
        $('edit-name').value = u.name; $('edit-email').value = u.email; $('edit-phone').value = u.phone;
        $('edit-hours').value = u.hours.toFixed(1);
        $('admin-only-edit').style.display = 'block';
        $('modal-profile').classList.add('active');
    }

    function openProfileModal() {
        editingId = null;
        $('modal-title').textContent = "My Profile";
        $('edit-name').value = currentUser.name; $('edit-email').value = currentUser.email; $('edit-phone').value = currentUser.phone;
        $('admin-only-edit').style.display = 'none';
        $('modal-profile').classList.add('active');
    }

    function saveProfileChanges() {
        const u = editingId ? allVolunteers.find(v => v.id === editingId) : currentUser;
        u.name = $('edit-name').value; u.email = $('edit-email').value; u.phone = $('edit-phone').value;
        if(editingId) { u.hours = parseFloat($('edit-hours').value); loadAdmin(); }
        else updateUI();
        saveData(); closeModal('modal-profile');
    }

    function closeModal(id) { $(id).classList.remove('active'); }
    function switchTab(t, b) {
        document.querySelectorAll('.admin-tab').forEach(x => x.classList.remove('active'));
        document.querySelectorAll('.admin-section').forEach(x => x.style.display = 'none');
        b.classList.add('active'); $('tab-' + t).style.display = 'block';
    }
</script>
</body>
</html>
