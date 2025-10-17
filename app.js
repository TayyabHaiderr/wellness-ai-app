// --------- Tab router ----------
document.querySelectorAll('.tab').forEach(btn=>{
  btn.onclick=()=>{
    document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.panel').forEach(p=>p.classList.remove('show'));
    document.getElementById(btn.dataset.tab).classList.add('show');
  };
});

// --------- State ----------
const todayISO = ()=>new Date().toISOString().slice(0,10);
const state = {
  foods: [],
  today: todayISO(),
  logs: JSON.parse(localStorage.getItem('logs')||'{}') // { [date]: { meals:[], waterEntries:[], mood:'', wellness:[], workouts:[] } }
};
// Migrate older structure (if existed): water_ml -> waterEntries
for(const d of Object.keys(state.logs)){
  const v = state.logs[d];
  if(v && typeof v.water_ml === 'number' && !Array.isArray(v.waterEntries)){
    v.waterEntries = v.water_ml>0 ? [{ml:v.water_ml, ts:Date.now()}] : [];
    delete v.water_ml;
  }
  if(!Array.isArray(v.waterEntries)) v.waterEntries = [];
  if(!Array.isArray(v.workouts)) v.workouts = [];
}
if(!state.logs[state.today]) state.logs[state.today] = { meals:[], waterEntries:[], mood:'😐 Neutral', wellness:[], workouts:[] };

function save(){ localStorage.setItem('logs', JSON.stringify(state.logs)); render(); }

// --------- Load foods DB ----------
fetch('data/foods-large.json')
  .then(r=>r.json())
  .then(data=>{
    state.foods = data;
    setupFoodUI();
    render();
  })
  .catch(()=>{
    document.getElementById('foodMeta').textContent = 'Could not load data/foods-large.json — check the path/case.';
  });

// --------- FOOD ----------
function setupFoodUI(){
  const q = document.getElementById('foodSearch');
  const results = document.getElementById('foodResults');
  const selectedEl = document.getElementById('selectedFood');
  const meta = document.getElementById('foodMeta');
  meta.textContent = `${state.foods.length.toLocaleString()} foods available`;

  let selected = null, t=null;

  const renderResults = (list)=>{
    if(!list.length){ results.innerHTML = `<div class="muted small">No results.</div>`; return; }
    results.innerHTML = list.slice(0,50).map(f=>{
      const kcal = f.per_100g?.calories ?? 0;
      return `<div class="item" data-name="${encodeURIComponent(f.name)}">
        <span>${f.name}</span><span class="muted">${kcal} kcal/100g</span>
      </div>`;
    }).join('');
    results.querySelectorAll('.item').forEach(div=>{
      div.onclick=()=>{
        const n = decodeURIComponent(div.dataset.name);
        selected = state.foods.find(x=>x.name===n);
        selectedEl.textContent = selected ? selected.name : 'No food selected';
        selectedEl.className='pill';
      };
    });
  };

  const searchFoods = (term)=>{
    const tt = term.toLowerCase().trim();
    if(!tt){ results.innerHTML=''; selected=null; selectedEl.textContent='No food selected'; selectedEl.className='pill pill-muted'; return; }
    const list = state.foods.filter(f=>f.name.toLowerCase().includes(tt));
    renderResults(list);
  };

  q.oninput=()=>{ clearTimeout(t); t = setTimeout(()=>searchFoods(q.value), 150); };

  // Quick add from text: pick the best match from current query
  document.getElementById('tryAddFromSearch').onclick=()=>{
    const term = q.value.toLowerCase().trim();
    if(!term){ alert('Type something to search first.'); return; }
    const matches = state.foods
      .map(f=>({f,score: similarity(term, f.name.toLowerCase())}))
      .sort((a,b)=>b.score-a.score);
    if(!matches.length || matches[0].score < 0.2){ alert('No close match found.'); return; }
    selected = matches[0].f;
    selectedEl.textContent = selected.name;
    selectedEl.className='pill';
  };

  document.getElementById('addFood').onclick=()=>{
    if(!selected){ alert('Pick a food from results or use Quick add.'); return; }
    const grams = parseFloat(document.getElementById('grams').value)||0;
    if(grams<=0){ alert('Enter grams > 0'); return; }
    const p = selected.per_100g; const factor = grams/100;
    const entry = {
      meal: document.getElementById('mealType').value,
      name: selected.name, grams,
      kcal: +(p.calories*factor).toFixed(1),
      protein_g: +(p.protein_g*factor).toFixed(1),
      carbs_g: +(p.carbs_g*factor).toFixed(1),
      fat_g: +(p.fat_g*factor).toFixed(1)
    };
    state.logs[state.today].meals.push(entry);
    save();
  };

  document.getElementById('clearToday').onclick=()=>{
    if(confirm('Clear today’s meals?')){ state.logs[state.today].meals=[]; save(); }
  };
}

// Simple similarity (Dice coefficient-ish) to help quick add
function similarity(a,b){
  if(a===b) return 1;
  const sa = new Set(a.split(' ')), sb = new Set(b.split(' '));
  let inter=0; sa.forEach(x=>{ if(sb.has(x)) inter++; });
  return inter / Math.max(1, sa.size+sb.size-inter);
}

// --------- HYDRATION & MOOD ----------
const addWaterBtn = document.getElementById('addWater');
document.querySelectorAll('.chip[data-water]').forEach(b=>{
  b.onclick=()=> addWater(+b.dataset.water);
});
addWaterBtn.onclick=()=> addWater(+document.getElementById('waterMl').value||0);
document.getElementById('saveMood').onclick=()=>{
  state.logs[state.today].mood = document.getElementById('moodSel').value;
  save();
};
function addWater(ml){
  if(ml<=0) return;
  state.logs[state.today].waterEntries.push({ml, ts: Date.now()});
  save();
}
document.getElementById('deleteLastWater').onclick=()=>{
  const arr = state.logs[state.today].waterEntries;
  if(arr.length){ arr.pop(); save(); }
};
document.getElementById('clearWater').onclick=()=>{
  if(confirm('Clear all water entries today?')){
    state.logs[state.today].waterEntries = []; save();
  }
};

// --------- WELLNESS ----------
document.getElementById('saveWellness').onclick=()=>{
  const w = {
    sleep:+document.getElementById('sleepH').value||0,
    stress:+document.getElementById('stress').value||0,
    energy:+document.getElementById('energy').value||0,
    notes:document.getElementById('notes').value||""
  };
  state.logs[state.today].wellness.push(w);
  save();
};

// Add sample history so charts look alive
document.getElementById('addDemoDay').onclick=()=>{
  const days = 6;
  for(let i=days;i>=1;i--){
    const d = new Date(Date.now()-i*86400000).toISOString().slice(0,10);
    if(!state.logs[d]) state.logs[d]={meals:[],waterEntries:[],mood:'😐 Neutral',wellness:[],workouts:[]};
    const kcal = 1700 + Math.round(Math.random()*700);
    state.logs[d].meals = [
      {meal:"Breakfast",name:"Oats (cup)",grams:80,kcal:kcal*0.25,protein_g:12,carbs_g:60,fat_g:8},
      {meal:"Lunch",name:"Chicken breast",grams:150,kcal:kcal*0.35,protein_g:38,carbs_g:10,fat_g:9},
      {meal:"Dinner",name:"Rice",grams:200,kcal:kcal*0.30,protein_g:8,carbs_g:70,fat_g:4}
    ];
    const entries = 3+Math.floor(Math.random()*3);
    state.logs[d].waterEntries = Array.from({length:entries}, ()=>({ml:400+Math.floor(Math.random()*500), ts:Date.now()}));
    state.logs[d].wellness.push({sleep:6+Math.random()*2,stress:1+Math.floor(Math.random()*5),energy:1+Math.floor(Math.random()*5),notes:""});
  }
  save();
};

// --------- WORKOUTS ----------
const plans = {
  "Beginner Full-body": [
    {name:"Bodyweight Squats", sets:3, reps:12},
    {name:"Knee Push-ups", sets:3, reps:10},
    {name:"Glute Bridges", sets:3, reps:12},
    {name:"Plank", sets:3, mins:0.5}
  ],
  "Core Booster": [
    {name:"Plank", sets:3, mins:0.75},
    {name:"Side Plank (each)", sets:2, mins:0.5},
    {name:"Dead Bug", sets:3, reps:10},
    {name:"Bird-Dog (each)", sets:3, reps:10}
  ],
  "Cardio Intervals": [
    {name:"Brisk Walk / Jog", sets:6, mins:2},
    {name:"Easy Pace", sets:6, mins:1},
    {name:"Stretching", sets:1, mins:5}
  ]
};

document.querySelectorAll('.plan-add').forEach(btn=>{
  btn.onclick=()=>{
    const plan = plans[btn.dataset.plan] || [];
    state.logs[state.today].workouts.push(...plan);
    save();
    renderPlans();
  };
});

document.getElementById('addExercise').onclick=()=>{
  const name = document.getElementById('exName').value.trim();
  const sets = +document.getElementById('exSets').value||0;
  const reps = +document.getElementById('exReps').value||0;
  const mins = +document.getElementById('exMins').value||0;
  if(!name){ alert('Enter exercise name'); return; }
  if(sets<=0 && reps<=0 && mins<=0){ alert('Enter sets/reps or minutes'); return; }
  state.logs[state.today].workouts.push({name, sets:sets||undefined, reps:reps||undefined, mins:mins||undefined});
  document.getElementById('exName').value='';
  document.getElementById('exSets').value='';
  document.getElementById('exReps').value='';
  document.getElementById('exMins').value='';
  save();
};
document.getElementById('clearWorkout').onclick=()=>{
  if(confirm('Clear today’s workout?')){ state.logs[state.today].workouts=[]; save(); }
};

// --------- Render + Charts ----------
let calChart, waterChart;
function render(){
  const log = state.logs[state.today];

  // Meals
  const mealLog = document.getElementById('mealLog');
  mealLog.innerHTML = log.meals.map((m,i)=>`
    <div class="item">
      <span>${m.meal}: ${m.name} (${m.grams}g)</span>
      <span>${m.kcal.toFixed(0)} kcal</span>
    </div>
  `).join('');

  const totals = log.meals.reduce((a,m)=>({
    kcal:a.kcal+m.kcal, p:a.p+m.protein_g, c:a.c+m.carbs_g, f:a.f+m.fat_g
  }), {kcal:0,p:0,c:0,f:0});
  const classK = totals.kcal<1600?'warn':totals.kcal>2600?'bad':'good';
  document.getElementById('totals').innerHTML = `
    <div class="${classK}"><strong>${totals.kcal.toFixed(0)}</strong> kcal</div>
    <div class="muted">Protein ${totals.p.toFixed(1)}g • Carbs ${totals.c.toFixed(1)}g • Fat ${totals.f.toFixed(1)}g</div>
  `;

  // Hydration summary & list
  document.getElementById('todayMood').textContent = log.mood;
  const waterSum = log.waterEntries.reduce((s,e)=>s+e.ml,0);
  document.getElementById('todayWater').textContent = waterSum;
  const waterList = document.getElementById('waterList');
  waterList.innerHTML = log.waterEntries.map((e,idx)=>`
    <div class="item">
      <span>${e.ml} ml</span>
      <button class="badge-del" data-del-idx="${idx}">Delete</button>
    </div>
  `).join('');
  waterList.querySelectorAll('[data-del-idx]').forEach(btn=>{
    btn.onclick=()=>{ const i=+btn.dataset.delIdx; state.logs[state.today].waterEntries.splice(i,1); save(); };
  });

  // 7-day arrays
  const days = [...Array(7)].map((_,i)=>{
    const d = new Date(Date.now() - (6-i)*86400000).toISOString().slice(0,10);
    const L = state.logs[d]||{meals:[],waterEntries:[],mood:'😐 Neutral',wellness:[],workouts:[]};
    return {
      label:d.slice(5),
      kcal: L.meals.reduce((s,m)=>s+m.kcal,0),
      water: L.waterEntries.reduce((s,e)=>s+e.ml,0)
    };
  });
  const labels = days.map(x=>x.label);
  const kcals = days.map(x=>Math.round(x.kcal));
  const waters = days.map(x=>x.water);

  if(calChart) calChart.destroy();
  calChart = new Chart(document.getElementById('calChart'), {
    type:'bar',
    data:{ labels, datasets:[{label:'Calories', data:kcals}] },
    options:{responsive:true}
  });
  if(waterChart) waterChart.destroy();
  waterChart = new Chart(document.getElementById('waterChart'), {
    type:'line',
    data:{ labels, datasets:[{label:'Water (ml)', data:waters}] },
    options:{responsive:true}
  });

  // Workout log
  const wLog = document.getElementById('workoutLog');
  wLog.innerHTML = (log.workouts||[]).map(w=>{
    const parts = [];
    if(w.sets) parts.push(`${w.sets} sets`);
    if(w.reps) parts.push(`${w.reps} reps`);
    if(w.mins) parts.push(`${w.mins} min`);
    return `<div class="item"><span>${w.name}</span><span class="muted">${parts.join(' • ')}</span></div>`;
  }).join('');

  renderPlans();
}

function renderPlans(){
  const planList = document.getElementById('planList');
  const todayW = state.logs[state.today].workouts||[];
  if(!todayW.length){ planList.innerHTML = `<div class="muted small">No plan added yet. Use the quick buttons above or add exercises.</div>`; return; }
  const byName = {};
  todayW.forEach(w=>{ byName[w.name] = (byName[w.name]||0)+1; });
  planList.innerHTML = Object.entries(byName).map(([name,count])=>`
    <div class="item"><span>${name}</span><span class="muted">${count} item(s)</span></div>
  `).join('');
}

// --------- AI (MOCK) ----------
function buildPayloadForAdvice(){
  const t = state.logs[state.today];
  const totals = t.meals.reduce((a,m)=>({
    kcal:a.kcal+m.kcal, p:a.p+m.protein_g, c:a.c+m.carbs_g, f:a.f+m.fat_g
  }), {kcal:0,p:0,c:0,f:0});
  return {
    goal: document.getElementById('goal').value,
    activityLevel: document.getElementById('activity').value,
    fitnessLevel: document.getElementById('fitness').value,
    today: {
      calories:+totals.kcal.toFixed(0),
      macros:{protein_g:+totals.p.toFixed(1), carbs_g:+totals.c.toFixed(1), fat_g:+totals.f.toFixed(1)},
      meals: t.meals,
      water_ml: t.waterEntries.reduce((s,e)=>s+e.ml,0),
      mood: t.mood,
      sleep_hours: (t.wellness.at(-1)?.sleep)||0,
      stress: (t.wellness.at(-1)?.stress)||0,
      energy: (t.wellness.at(-1)?.energy)||0,
      workouts: t.workouts
    }
  };
}

function generateAdviceMock(payload){
  const {today, fitnessLevel, goal} = payload;
  const lowProtein = (today.macros?.protein_g||0) < 80;
  const lowWater = (today.water_ml||0) < 2000;
  const poorSleep = (today.sleep_hours||0) < 7;

  // Workout suggestions adapt to fitness level + goal
  const workoutSug = {
    beginner: [
      {title:"Full-body 20 min", steps:["Warm-up 3 min","3× (12 squats, 8 knee push-ups, 12 glute bridges)","Plank 30s × 2","Stretch 3 min"]},
      {title:"Brisk walk + core", steps:["Walk 15–20 min","Core: 2× plank 30–45s","Glute bridge 2×12","Stretch 3 min"]}
    ],
    intermediate: [
      {title:"Intervals 25 min", steps:["Warm-up 5 min","6× (1 min faster, 2 min easy)","Cool down 4 min","Mobility 3 min"]},
      {title:"Legs & Core 25 min", steps:["3× (12 lunges/leg)","3× (30s side planks)","3× (15 hip hinges)","Walk 5 min"]}
    ],
    advanced: [
      {title:"Tempo 30 min", steps:["Warm-up 6 min","20 min tempo run","Cool down 4 min"]},
      {title:"EMOM x 20", steps:["Min1: 12 burpees","Min2: 15 kettlebell swings","Repeat 10 rounds"]}
    ]
  };

  const nutritionPool = [
    goal==='lose' ? "Slight calorie deficit; add 1 serving of lean protein and veggies." :
    goal==='gain' ? "Small surplus; add ~300 kcal with protein + complex carbs." :
                    "Aim for balance; spread protein across 3–4 meals.",
    lowProtein ? "Increase daily protein by ~20–30g (eggs, lentils, chicken, tofu)." :
                 "Protein looks solid—keep spacing it across meals.",
    "Prefer whole grains, legumes, and fiber for satiety.",
    "Include 1–2 servings of fruit for micronutrients."
  ];
  const hydrationPool = [
    lowWater ? "Drink 300–500 ml water now; aim ≥2–2.5 L today." :
               "Hydration on track—sip regularly across the day.",
    poorSleep ? "Target 7–8h tonight; dim screens 60 min before bed." :
                 "Keep a consistent sleep window this week."
  ];
  const motivations = [
    "Small wins add up—log your next meal now.",
    "Momentum beats perfection. Keep going.",
    "You’re closer than you think. One good step at a time."
  ];

  const rand = arr => arr[Math.floor(Math.random()*arr.length)];
  return {
    workout: [rand(workoutSug[fitnessLevel] || workoutSug.beginner)],
    nutrition: [{tip: rand(nutritionPool)}, {tip: rand(nutritionPool)}],
    hydration_sleep: [{tip: rand(hydrationPool)}, {tip: rand(hydrationPool)}],
    motivation: rand(motivations)
  };
}

function renderAdvice(json){
  const box = document.getElementById('adviceCards');
  const safe = x => Array.isArray(x)?x:[];
  const workout = safe(json.workout).map(w=>`
    <div class="card">
      <h3>${w.title||'Workout'}</h3>
      <ul>${(w.steps||[]).map(s=>`<li>${s}</li>`).join('')}</ul>
    </div>
  `).join('');
  const nutrition = safe(json.nutrition).map(n=>`
    <div class="card"><h3>Nutrition</h3><p>${n.tip||''}</p></div>
  `).join('');
  const hs = safe(json.hydration_sleep).map(n=>`
    <div class="card"><h3>Hydration & Sleep</h3><p>${n.tip||''}</p></div>
  `).join('');
  const mot = `<div class="card"><h3>Motivation</h3><p>${json.motivation||'You got this!'}</p></div>`;
  box.innerHTML = workout + nutrition + hs + mot;
}

document.getElementById('genAdvice').onclick=()=>{
  const payload = buildPayloadForAdvice();
  const data = generateAdviceMock(payload);
  renderAdvice(data);
};
document.getElementById('genAdvice2').onclick=()=>{
  const payload = buildPayloadForAdvice();
  const data = generateAdviceMock(payload);
  renderAdvice(data);
};

// --------- Initial render ----------
render();
