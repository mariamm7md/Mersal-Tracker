// --- Configuration & State ---
const $ = id => document.getElementById(id);

// Safety check to prevent Railway/Node.js from crashing
const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined';

let allVolunteers = isBrowser ? JSON.parse(localStorage.getItem('mersal_users')) || [] : [];
let globalTarget = isBrowser ? localStorage.getItem('mersal_target') || 130 : 130;
let currentUser = null;
let timerInterval = null;
let sessionStart = null;

// --- Persistence ---
function saveData() {
    if (isBrowser) {
        localStorage.setItem('mersal_users', JSON.stringify(allVolunteers));
        localStorage.setItem('mersal_target', globalTarget);
    }
}

// --- Navigation ---
function showPage(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    $(id).classList.add('active');
}

// --- Authentication ---
function login() {
    const idVal = $('login-id').value;
    const passVal = $('login-pass').value;
    
    const user = allVolunteers.find(u => (u.email === idVal || u.phone === idVal) && u.password === passVal);
    
    if (user) {
        currentUser = user;
        updateUI();
        showPage('page-dash');
    } else {
        alert('Invalid Login Credentials');
    }
}

function register() {
    const name = $('reg-name').value;
    const email = $('reg-email').value;
    const pass = $('reg-pass').value;

    if (!name || !email || !pass) return alert('Please fill all fields');

    const newUser = {
        id: Date.now(),
        name: name,
        email: email,
        password: pass,
        hours: 0
    };

    allVolunteers.push(newUser);
    saveData();
    currentUser = newUser;
    updateUI();
    showPage('page-dash');
}

// --- Timer Logic ---
function handleMainAction() {
    if (!sessionStart) {
        // Start Clock In
        sessionStart = new Date();
        timerInterval = setInterval(updateTimerDisplay, 1000);
        
        $('main-action-btn').textContent = 'Stop Session';
        $('main-action-btn').style.background = 'var(--danger)';
        $('status-badge').className = 'status-badge status-active';
        $('status-badge').textContent = 'Live Now';
    } else {
        // Stop & Save
        const diffHours = (new Date() - sessionStart) / 3600000;
        currentUser.hours += diffHours;
        
        saveData();
        clearInterval(timerInterval);
        sessionStart = null;
        
        $('timer').textContent = '00:00:00';
        $('main-action-btn').textContent = 'Clock In';
        $('main-action-btn').style.background = 'var(--success)';
        $('status-badge').className = 'status-badge status-inactive';
        $('status-badge').textContent = 'Ready';
        updateUI();
    }
}

function updateTimerDisplay() {
    const diff = new Date() - sessionStart;
    const h = String(Math.floor(diff / 3600000)).padStart(2, '0');
    const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
    const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
    $('timer').textContent = `${h}:${m}:${s}`;
}

// --- UI Updates ---
function updateUI() {
    if (!currentUser) return;
    $('dash-name').textContent = currentUser.name;
    const hours = currentUser.hours || 0;
    $('prog-text').textContent = `${hours.toFixed(1)} / ${globalTarget}h`;
    
    const percentage = Math.min((hours / globalTarget) * 100, 100);
    $('prog-fill').style.width = percentage + '%';
}

function logout() {
    currentUser = null;
    clearInterval(timerInterval);
    sessionStart = null;
    showPage('page-login');
}

// --- Theme Management ---
function toggleTheme() {
    if (!isBrowser) return;
    const current = document.body.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', next);
    localStorage.setItem('mersal_theme', next);
}

// Initialize theme on load
if (isBrowser && localStorage.getItem('mersal_theme') === 'dark') {
    document.body.setAttribute('data-theme', 'dark');
}
