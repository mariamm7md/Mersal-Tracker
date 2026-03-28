// --- Utils & Initial State ---
const $ = id => document.getElementById(id);

// Navigation Function
const showPage = id => { 
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active')); 
    $(id).classList.add('active'); 
};

// Data persistence using LocalStorage
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

// --- Theme Control (Light/Dark Mode) ---
function toggleTheme() {
    const current = document.body.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', next);
    localStorage.setItem('mersal_theme', next);
}

// Initialize Theme on Load
if(localStorage.getItem('mersal_theme') === 'dark') {
    document.body.setAttribute('data-theme', 'dark');
}

// --- Authentication (Login/Register) ---
function login() {
    const idVal = $('login-id').value;
    const passVal = $('login-pass').value;
    
    // Check against Email or Phone
    const user = allVolunteers.find(u => (u.email === idVal || u.phone === idVal) && u.password === passVal);
    
    if(user) { 
        currentUser = user; 
        loadUserActivities(); 
        showPage('page-activity-select'); 
    } else {
        alert('Invalid credentials');
    }
}

function register() {
    const name = $('reg-name').value;
    const email = $('reg-email').value;
    const phone = $('reg-phone').value;
    const password = $('reg-pass').value;

    if(!name || !email || !password) return alert('Fill required fields');
    
    const newUser = { 
        id: Date.now().toString(), 
        name, 
        email, 
        phone, 
        password, 
        hours: 0, 
        sessions: 0 
    };

    allVolunteers.push(newUser); 
    saveData(); 
    currentUser = newUser;
    loadUserActivities(); 
    showPage('page-activity-select');
}

// --- Dashboard & Timer Logic ---
function loadUserActivities() {
    $('select-activity').innerHTML = activitiesList.map(a => 
        `<option value="${a}">${a}</option>`
    ).join('') + `<option value="other">Other...</option>`;
}

function handleActivityChange(el) { 
    $('manual-activity-group').style.display = el.value === 'other' ? 'block' : 'none'; 
}

function startSessionWithActivity() {
    const sel = $('select-activity').value;
    const manualVal = $('manual-activity-input').value;
    $('current-activity-display').textContent = sel === 'other' ? manualVal : sel;
    updateUI(); 
    showPage('page-dash');
}

function handleMainAction() {
    if(!sessionStart) {
        // Start Timer
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
        // Stop Timer & Calculate Hours
        const diffHours = (new Date() - sessionStart) / 3600000;
        currentUser.hours += diffHours; 
        currentUser.sessions++; 
        
        saveData();
        clearInterval(timerInterval); 
        sessionStart = null;
        
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

function logout() { 
    currentUser = null; 
    clearInterval(timerInterval); 
    showPage('page-login'); 
}

// --- Admin Portal Logic ---
function adminLogin() { 
    if($('admin-pass').value === 'admin123') { 
        loadAdmin(); 
        showPage('page-admin'); 
    } else {
        alert('Access Denied');
    }
}

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
            <span>${a}</span>
            <span style="color:var(--danger); cursor:pointer;" onclick="deleteActivity(${i})">Delete</span>
        </div>`).join('');
}

function deleteActivity(index) {
    activitiesList.splice(index, 1);
    saveData();
    renderAdminActs();
}

function addActivity() { 
    const n = $('new-act-name').value; 
    if(n) { 
        activitiesList.push(n); 
        $('new-act-name').value = ''; 
        saveData(); 
        renderAdminActs(); 
    }
}

function updateGlobalTarget() { 
    globalTarget = $('global-target-input').value; 
    saveData(); 
    alert('Target Updated'); 
}

// --- Modal & Profile Management ---
let editingId = null;

function adminEditUser(id) {
    editingId = id; 
    const u = allVolunteers.find(v => v.id === id);
    $('modal-title').textContent = "Admin Edit";
    $('edit-name').value = u.name; 
    $('edit-email').value = u.email; 
    $('edit-phone').value = u.phone;
    $('edit-hours').value = u.hours.toFixed(1);
    $('admin-only-edit').style.display = 'block';
    $('modal-profile').classList.add('active');
}

function openProfileModal() {
    editingId = null;
    $('modal-title').textContent = "My Profile";
    $('edit-name').value = currentUser.name; 
    $('edit-email').value = currentUser.email; 
    $('edit-phone').value = currentUser.phone;
    $('admin-only-edit').style.display = 'none';
    $('modal-profile').classList.add('active');
}

function saveProfileChanges() {
    const target = editingId ? allVolunteers.find(v => v.id === editingId) : currentUser;
    
    target.name = $('edit-name').value; 
    target.email = $('edit-email').value; 
    target.phone = $('edit-phone').value;
    
    if(editingId) { 
        target.hours = parseFloat($('edit-hours').value) || 0; 
        loadAdmin(); 
    } else {
        updateUI();
    }
    
    saveData(); 
    closeModal('modal-profile');
}

function closeModal(id) { $(id).classList.remove('active'); }

function switchTab(tabName, btnElement) {
    document.querySelectorAll('.admin-tab').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.admin-section').forEach(x => x.style.display = 'none');
    btnElement.classList.add('active'); 
    $('tab-' + tabName).style.display = 'block';
}
