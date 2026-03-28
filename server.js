<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Mersal System</title>

<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">

<style>
:root{
--primary:#2563eb;
--bg:#f1f5f9;
--card:#ffffff;
--text:#0f172a;
--border:#e2e8f0;
--success:#16a34a;
--danger:#dc2626;
}

*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Inter;background:var(--bg);}

.container{max-width:420px;margin:auto;padding:20px}

.card{
background:var(--card);
padding:25px;
border-radius:18px;
margin-top:20px;
box-shadow:0 5px 15px rgba(0,0,0,.05);
}

h1{text-align:center;margin-bottom:10px}
p{text-align:center;color:gray;margin-bottom:20px}

input,select{
width:100%;
padding:12px;
margin:8px 0;
border-radius:10px;
border:1px solid var(--border);
}

button{
width:100%;
padding:12px;
margin-top:10px;
border:none;
border-radius:10px;
font-weight:600;
cursor:pointer;
}

.btn-primary{background:var(--primary);color:white}
.btn-success{background:var(--success);color:white}
.btn-danger{background:var(--danger);color:white}
.btn-outline{background:none;border:2px solid var(--border)}

.hidden{display:none}

.header{
background:linear-gradient(135deg,#2563eb,#1d4ed8);
color:white;
padding:20px;
border-radius:20px;
text-align:center;
}

.timer{
font-size:40px;
font-weight:800;
text-align:center;
margin:20px 0;
color:var(--primary);
}

</style>
</head>

<body>

<div class="container">

<!-- HOME -->
<div id="home">
<div class="card">
<h1>Mersal</h1>
<p>Select Mode</p>

<button class="btn-primary" onclick="show('login')">User</button>
<button class="btn-outline" onclick="show('adminLogin')">Admin</button>
</div>
</div>

<!-- LOGIN -->
<div id="login" class="hidden">
<div class="card">
<h1>Login</h1>

<input id="email" placeholder="Email">
<input id="password" type="password" placeholder="Password">

<button class="btn-primary" onclick="login()">Login</button>
<button class="btn-outline" onclick="show('register')">Register</button>
</div>
</div>

<!-- REGISTER -->
<div id="register" class="hidden">
<div class="card">
<h1>Register</h1>

<input id="name" placeholder="Name">
<input id="regEmail" placeholder="Email">
<input id="regPass" type="password" placeholder="Password">

<button class="btn-success" onclick="register()">Create</button>
<button class="btn-outline" onclick="show('login')">Back</button>
</div>
</div>

<!-- DASHBOARD -->
<div id="dash" class="hidden">

<div class="header">
<h2 id="username"></h2>
<button onclick="logout()" style="margin-top:10px">Logout</button>
</div>

<div class="card">

<select id="activity"></select>

<div class="timer" id="timer">00:00:00</div>

<input type="time" id="start">
<input type="time" id="end">

<input id="note" placeholder="Feedback">

<button id="mainBtn" class="btn-success" onclick="action()">Start</button>

<p>Total Hours: <span id="total">0</span></p>

</div>

</div>

<!-- ADMIN LOGIN -->
<div id="adminLogin" class="hidden">
<div class="card">
<h1>Admin</h1>

<input id="adminPass" type="password" placeholder="Password">
<button class="btn-primary" onclick="adminLogin()">Login</button>

</div>
</div>

<!-- ADMIN PANEL -->
<div id="admin" class="hidden">
<div class="card">
<h1>Admin Panel</h1>

<p>Total Users: <span id="users"></span></p>
<p>Total Hours: <span id="hours"></span></p>

<button class="btn-success" onclick="download()">Download Excel</button>
<button class="btn-outline" onclick="logout()">Exit</button>

</div>
</div>

</div>

<script>

let user=null
let timer=null
let startTime=null

function show(id){
document.querySelectorAll(".container > div").forEach(d=>d.classList.add("hidden"))
document.getElementById(id).classList.remove("hidden")
}

async function login(){
const res=await fetch('/api/login',{
method:'POST',
headers:{'Content-Type':'application/json'},
body:JSON.stringify({
email:email.value,
password:password.value
})
})

const data=await res.json()

if(!data)return alert("Wrong login")

user=data
username.innerText=data.name

loadActivities()
loadStats()

show('dash')
}

async function register(){
const res=await fetch('/api/register',{
method:'POST',
headers:{'Content-Type':'application/json'},
body:JSON.stringify({
name:name.value,
email:regEmail.value,
password:regPass.value
})
})

const data=await res.json()

if(data.error)return alert(data.error)

alert("Account created")
show('login')
}

async function loadActivities(){
const res=await fetch('/api/activities')
const data=await res.json()

activity.innerHTML=data.map(a=>`<option>${a.name}</option>`).join('')
}

function startTimer(){
timer=setInterval(()=>{
let diff=Date.now()-startTime
let h=Math.floor(diff/3600000)
let m=Math.floor((diff%3600000)/60000)
let s=Math.floor((diff%60000)/1000)

timerDisplay(`${h}:${m}:${s}`)
},1000)
}

function timerDisplay(t){
timer.innerText=t
}

async function action(){

if(startTime){
clearInterval(timer)

await fetch('/api/attendance/checkout',{
method:'POST',
headers:{'Content-Type':'application/json'},
body:JSON.stringify({volunteerId:user.id,feedback:note.value})
})

startTime=null
mainBtn.innerText="Start"
loadStats()

}else{

if(end.value){
await fetch('/api/attendance/manual',{
method:'POST',
headers:{'Content-Type':'application/json'},
body:JSON.stringify({
volunteerId:user.id,
date:new Date().toISOString().split('T')[0],
checkIn:start.value,
checkOut:end.value,
activityName:activity.value,
feedback:note.value
})
})

loadStats()
}else{

await fetch('/api/attendance/checkin',{
method:'POST',
headers:{'Content-Type':'application/json'},
body:JSON.stringify({
volunteerId:user.id,
activityName:activity.value
})
})

startTime=Date.now()
startTimer()
mainBtn.innerText="Stop"
}
}
}

async function loadStats(){
const res=await fetch('/api/attendance/'+user.id)
const data=await res.json()

let total=data.reduce((s,x)=>s+Number(x.duration||0),0)
totalSpan.innerText=total.toFixed(2)
}

async function adminLogin(){
const res=await fetch('/api/admin/login',{
method:'POST',
headers:{'Content-Type':'application/json'},
body:JSON.stringify({password:adminPass.value})
})

const data=await res.json()

if(!data.success)return alert("Wrong")

const stats=await fetch('/api/admin/stats').then(r=>r.json())

users.innerText=stats.totalVolunteers
hours.innerText=stats.totalHours

show('admin')
}

function download(){
window.location='/api/export'
}

function logout(){
location.reload()
}

</script>

</body>
</html>
