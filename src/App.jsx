import { useState, useEffect } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const STORAGE_KEY = "enverde_app_v1";
const CATEGORIES = [
  { id:"vivienda",        label:"Vivienda",        color:"#4ade80", icon:"🏠" },
  { id:"alimentacion",   label:"Alimentación",    color:"#22c55e", icon:"🛒" },
  { id:"transporte",     label:"Transporte",      color:"#16a34a", icon:"🚌" },
  { id:"entretenimiento",label:"Entretenimiento", color:"#86efac", icon:"🎮" },
  { id:"salud",          label:"Salud",           color:"#6ee7b7", icon:"💊" },
  { id:"educacion",      label:"Educación",       color:"#34d399", icon:"📚" },
  { id:"tecnologia",     label:"Tecnología",      color:"#a7f3d0", icon:"💻" },
  { id:"otros",          label:"Otros",           color:"#bbf7d0", icon:"📦" },
];
const MONTHS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

function defaultState() {
  return {
    transactions: [],
    savings: [],
    budgets: Object.fromEntries(CATEGORIES.map(c => [c.id, 0])),
    payDay: 1, // día del mes en que empieza el ciclo (1 = mes calendario)
  };
}
function loadState() {
  try { const r = localStorage.getItem(STORAGE_KEY); return r ? { ...defaultState(), ...JSON.parse(r) } : defaultState(); }
  catch { return defaultState(); }
}
function saveState(s) { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }
function formatCLP(n) { return "$" + Math.abs(n).toLocaleString("es-CL"); }
function today() { return new Date().toISOString().split("T")[0]; }

// Dado un día de pago, retorna {start, end} del ciclo actual como strings YYYY-MM-DD
function getCurrentCycle(payDay) {
  const now = new Date();
  const d = now.getDate();
  let startYear, startMonth;
  if (d >= payDay) {
    startMonth = now.getMonth();
    startYear  = now.getFullYear();
  } else {
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    startMonth = prev.getMonth();
    startYear  = prev.getFullYear();
  }
  const startDate = new Date(startYear, startMonth, payDay);
  const endDate   = new Date(startYear, startMonth + 1, payDay - 1);
  const fmt = dt => dt.toISOString().split("T")[0];
  return { start: fmt(startDate), end: fmt(endDate), startMonth, startYear };
}

// Retorna {start, end} del ciclo que empieza N ciclos atrás (offset negativo)
function getCycleOffset(payDay, offset) {
  const now = new Date();
  const d = now.getDate();
  let startMonth = d >= payDay ? now.getMonth() : now.getMonth() - 1;
  let startYear  = now.getFullYear();
  startMonth += offset;
  // normalizar
  while (startMonth < 0)  { startMonth += 12; startYear--; }
  while (startMonth > 11) { startMonth -= 12; startYear++; }
  const startDate = new Date(startYear, startMonth, payDay);
  const endDate   = new Date(startYear, startMonth + 1, payDay - 1);
  const fmt = dt => dt.toISOString().split("T")[0];
  return { start: fmt(startDate), end: fmt(endDate), startMonth, startYear };
}

function cycleLabel(payDay, offset) {
  const { startMonth, startYear } = getCycleOffset(payDay, offset);
  return `${MONTHS[startMonth]} ${startYear}`;
}

function inCycle(dateStr, start, end) {
  return dateStr >= start && dateStr <= end;
}

const G = {
  bg:"#0a110d", surface:"#111a14", card:"#131f17", border:"#1e3024", borderHi:"#2d5c3a",
  primary:"#22c55e", primaryDim:"#22c55e18", primaryMid:"#22c55e40", accent:"#4ade80",
  muted:"#3a6b47", text:"#e6f4ea", textDim:"#7aab8a", textFaint:"#3d6b4f",
  danger:"#f87171", dangerDim:"#f8717118", warn:"#fbbf24",
};

export default function App() {
  const [state, setState] = useState(loadState);
  const [tab, setTab] = useState("dashboard");
  const [txForm, setTxForm] = useState({ type:"gasto", amount:"", category:"alimentacion", description:"", date:today() });
  const [savForm, setSavForm] = useState({ name:"", goal:"", current:"", color:"#22c55e", icon:"🎯" });
  const [savDeposit, setSavDeposit] = useState({ id:null, amount:"" });
  const [budgetDraft, setBudgetDraft] = useState(null);
  const [filter, setFilter] = useState("all");
  const [toast, setToast] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [payDayDraft, setPayDayDraft] = useState(String(state.payDay));

  useEffect(() => { saveState(state); }, [state]);

  function showToast(msg, type="ok") { setToast({ msg, type }); setTimeout(() => setToast(null), 2500); }

  const txs = state.transactions;
  const payDay = state.payDay || 1;

  // ciclo actual
  const cycle = getCurrentCycle(payDay);

  // balance total histórico
  const income  = txs.filter(t => t.type==="ingreso").reduce((s,t) => s+t.amount, 0);
  const expense = txs.filter(t => t.type==="gasto").reduce((s,t) => s+t.amount, 0);
  const balance = income - expense;

  // movimientos del ciclo actual
  const cycleTxs    = txs.filter(t => inCycle(t.date, cycle.start, cycle.end));
  const cycleIncome  = cycleTxs.filter(t => t.type==="ingreso").reduce((s,t) => s+t.amount, 0);
  const cycleExpense = cycleTxs.filter(t => t.type==="gasto").reduce((s,t) => s+t.amount, 0);

  // días restantes en el ciclo
  const today_str = today();
  const daysLeft = Math.max(0, Math.round((new Date(cycle.end+"T12:00:00") - new Date(today_str+"T12:00:00")) / 86400000));

  // pie data (ciclo actual)
  const pieData = CATEGORIES.map(c => ({
    name:c.label,
    value:cycleTxs.filter(t=>t.type==="gasto"&&t.category===c.id).reduce((s,t)=>s+t.amount,0),
    color:c.color,
  })).filter(d => d.value>0);

  // bar data últimos 6 ciclos
  const barData = Array.from({length:6},(_,i) => {
    const { start, end, startMonth } = getCycleOffset(payDay, i - 5);
    const sl = txs.filter(t => inCycle(t.date, start, end));
    return {
      name: MONTHS[startMonth],
      Ingresos: sl.filter(t=>t.type==="ingreso").reduce((s,t)=>s+t.amount,0),
      Gastos:   sl.filter(t=>t.type==="gasto").reduce((s,t)=>s+t.amount,0),
    };
  });

  // budget usage en ciclo actual
  const budgetUsage = CATEGORIES.map(c => {
    const spent = cycleTxs.filter(t=>t.type==="gasto"&&t.category===c.id).reduce((s,t)=>s+t.amount,0);
    const budget = state.budgets[c.id]||0;
    return {...c, spent, budget, pct:budget>0?Math.min(100,(spent/budget)*100):0};
  });

  function addTransaction() {
    if (!txForm.amount||isNaN(+txForm.amount)||+txForm.amount<=0) return showToast("Monto inválido","err");
    if (!txForm.description.trim()) return showToast("Agrega una descripción","err");
    const t={id:Date.now(),type:txForm.type,amount:+txForm.amount,category:txForm.category,description:txForm.description.trim(),date:txForm.date};
    setState(s=>({...s,transactions:[t,...s.transactions]}));
    setTxForm(f=>({...f,amount:"",description:""}));
    showToast(txForm.type==="ingreso"?"Ingreso registrado ✓":"Gasto registrado ✓");
  }
  function deleteTx(id) { setState(s=>({...s,transactions:s.transactions.filter(t=>t.id!==id)})); }

  function addSavings() {
    if (!savForm.name.trim()) return showToast("Nombre requerido","err");
    if (!savForm.goal||+savForm.goal<=0) return showToast("Meta inválida","err");
    const sv={id:Date.now(),name:savForm.name.trim(),goal:+savForm.goal,current:+savForm.current||0,color:savForm.color,icon:savForm.icon,createdAt:today()};
    setState(st=>({...st,savings:[...st.savings,sv]}));
    setSavForm({name:"",goal:"",current:"",color:"#22c55e",icon:"🎯"});
    showToast("Meta creada ✓");
  }
  function depositSavings() {
    if (!savDeposit.amount||+savDeposit.amount<=0) return showToast("Monto inválido","err");
    setState(st=>({...st,savings:st.savings.map(s=>s.id===savDeposit.id?{...s,current:s.current+(+savDeposit.amount)}:s)}));
    setSavDeposit({id:null,amount:""}); showToast("Depósito registrado ✓");
  }
  function deleteSaving(id) { setState(s=>({...s,savings:s.savings.filter(sv=>sv.id!==id)})); }
  function saveBudgets() { setState(s=>({...s,budgets:{...budgetDraft}})); setBudgetDraft(null); showToast("Presupuestos guardados ✓"); }

  function savePayDay() {
    const d = parseInt(payDayDraft);
    if (isNaN(d)||d<1||d>28) return showToast("Elige un día entre 1 y 28","err");
    setState(s=>({...s,payDay:d}));
    setShowSettings(false);
    showToast(`Ciclo actualizado: día ${d} ✓`);
  }

  const filteredTxs = filter==="all" ? txs : txs.filter(t=>t.type===filter);
  const TABS=[
    {id:"dashboard",label:"Resumen",icon:"◈"},
    {id:"transactions",label:"Movimientos",icon:"↕"},
    {id:"savings",label:"Ahorros",icon:"◎"},
    {id:"budgets",label:"Presupuestos",icon:"▦"},
  ];

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Space+Mono:wght@400;700&display=swap');
    *{box-sizing:border-box;margin:0;padding:0;}
    body{background:${G.bg};}
    ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-track{background:${G.surface};} ::-webkit-scrollbar-thumb{background:${G.muted};border-radius:2px;}
    input,select{outline:none;} button{cursor:pointer;border:none;}
    .card{background:${G.card};border:1px solid ${G.border};border-radius:16px;}
    .inp{background:${G.surface};border:1px solid ${G.border};border-radius:10px;color:${G.text};padding:10px 14px;font-size:14px;font-family:inherit;width:100%;transition:border .2s;}
    .inp:focus{border-color:${G.primary};box-shadow:0 0 0 3px ${G.primaryDim};}
    .inp::placeholder{color:${G.textFaint};}
    .btn{padding:10px 20px;border-radius:10px;font-size:14px;font-weight:600;font-family:inherit;transition:all .15s;}
    .btn-primary{background:${G.primary};color:#0a110d;}
    .btn-primary:hover{background:${G.accent};transform:translateY(-1px);box-shadow:0 4px 16px ${G.primaryMid};}
    .btn-ghost{background:transparent;color:${G.textDim};border:1px solid ${G.border};}
    .btn-ghost:hover{border-color:${G.primary};color:${G.primary};}
    .btn-danger{background:transparent;color:${G.danger};border:1px solid ${G.dangerDim};font-size:12px;padding:5px 10px;}
    .btn-danger:hover{background:${G.dangerDim};}
    .tag{display:inline-block;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:500;}
    .progress-bar{height:6px;border-radius:3px;background:${G.border};overflow:hidden;}
    .progress-fill{height:100%;border-radius:3px;transition:width .6s cubic-bezier(.4,0,.2,1);}
    @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
    .fade{animation:fadeIn .3s ease;}
    @keyframes toastIn{0%{opacity:0;transform:translateX(20px)}10%{opacity:1;transform:translateX(0)}90%{opacity:1}100%{opacity:0}}
    .toast-anim{animation:toastIn 2.5s ease forwards;}
    .wm{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);font-size:72px;opacity:.03;pointer-events:none;user-select:none;z-index:0;}
    @keyframes glow{0%,100%{text-shadow:0 0 8px #22c55e44}50%{text-shadow:0 0 24px #22c55e99}}
    .bal-pos{animation:glow 3s ease-in-out infinite;}
    .modal-bg{position:fixed;inset:0;background:#00000088;z-index:100;display:flex;align-items:center;justify-content:center;padding:20px;}
    @keyframes modalIn{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:scale(1)}}
    .modal{background:${G.card};border:1px solid ${G.borderHi};border-radius:20px;padding:28px;width:100%;max-width:380px;animation:modalIn .2s ease;}
    /* day picker grid */
    .day-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin:16px 0;}
    .day-btn{aspect-ratio:1;border-radius:8px;font-size:13px;font-weight:500;font-family:inherit;background:${G.surface};color:${G.textDim};border:1px solid ${G.border};cursor:pointer;transition:all .15s;display:flex;align-items:center;justify-content:center;}
    .day-btn:hover{border-color:${G.primaryMid};color:${G.primary};}
    .day-btn.selected{background:${G.primary};color:#0a110d;border-color:${G.primary};}
  `;

  return (
    <div style={{fontFamily:"'Space Grotesk',sans-serif",background:G.bg,minHeight:"100vh",color:G.text}}>
      <style>{css}</style>
      <div className="wm">🥑</div>

      {/* ── HEADER ── */}
      <div style={{background:G.bg,borderBottom:`1px solid ${G.border}`,padding:"14px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:50,backdropFilter:"blur(12px)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:34,height:34,borderRadius:10,background:G.primaryDim,border:`1px solid ${G.primaryMid}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>🥑</div>
          <div>
            <div style={{fontSize:17,fontWeight:700,letterSpacing:"-0.5px",color:G.accent}}>En Verde</div>
            <div style={{fontSize:10,color:G.textFaint,fontFamily:"'Space Mono'",letterSpacing:0.8,cursor:"pointer"}} onClick={()=>setShowSettings(true)}>
              ciclo: día {payDay} · {cycle.start.slice(5).replace("-","/") + " → " + cycle.end.slice(5).replace("-","/")} ✦
            </div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <button onClick={()=>setShowSettings(true)} className="btn" style={{background:"transparent",color:G.textFaint,border:`1px solid ${G.border}`,padding:"6px 10px",fontSize:16,lineHeight:1}}>⚙</button>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:10,color:G.textFaint,textTransform:"uppercase",letterSpacing:1.2,marginBottom:2}}>balance total</div>
            <div className={balance>=0?"bal-pos":""} style={{fontSize:20,fontWeight:700,color:balance>=0?G.primary:G.danger,fontFamily:"'Space Mono'"}}>{balance<0?"-":""}{formatCLP(balance)}</div>
          </div>
        </div>
      </div>

      {/* ── NAV ── */}
      <div style={{display:"flex",padding:"10px 14px",gap:6,background:G.bg,borderBottom:`1px solid ${G.border}`,overflowX:"auto"}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} className="btn" style={{background:tab===t.id?G.primaryDim:"transparent",color:tab===t.id?G.primary:G.textFaint,border:tab===t.id?`1px solid ${G.primaryMid}`:"1px solid transparent",padding:"7px 14px",whiteSpace:"nowrap",fontSize:13}}>
            <span style={{marginRight:6}}>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      <div style={{padding:"20px 16px",maxWidth:700,margin:"0 auto",position:"relative",zIndex:1}}>

        {/* ── DASHBOARD ── */}
        {tab==="dashboard" && (
          <div className="fade">
            {/* ciclo banner */}
            <div className="card" style={{padding:"14px 18px",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center",borderColor:G.primaryMid}}>
              <div>
                <div style={{fontSize:11,color:G.textFaint,textTransform:"uppercase",letterSpacing:1,marginBottom:3}}>Ciclo actual · {cycleLabel(payDay, 0)}</div>
                <div style={{fontSize:12,color:G.textDim,fontFamily:"'Space Mono'"}}>{cycle.start} → {cycle.end}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:11,color:G.textFaint,marginBottom:2}}>días restantes</div>
                <div style={{fontSize:22,fontWeight:700,color:daysLeft<=5?G.warn:G.primary,fontFamily:"'Space Mono'"}}>{daysLeft}</div>
              </div>
            </div>

            {/* stat cards */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>
              {[
                {label:"Ingresos del ciclo",val:cycleIncome, color:G.primary,icon:"↑"},
                {label:"Gastos del ciclo",  val:cycleExpense,color:G.danger, icon:"↓"},
              ].map(s=>(
                <div key={s.label} className="card" style={{padding:"16px 18px"}}>
                  <div style={{fontSize:10,color:G.textFaint,marginBottom:8,textTransform:"uppercase",letterSpacing:1}}>{s.label}</div>
                  <div style={{fontSize:18,fontWeight:700,color:s.color,fontFamily:"'Space Mono'"}}><span style={{fontSize:13,marginRight:4}}>{s.icon}</span>{formatCLP(s.val)}</div>
                </div>
              ))}
            </div>

            {/* bar */}
            <div className="card" style={{padding:"20px",marginBottom:20}}>
              <div style={{fontSize:11,fontWeight:600,marginBottom:16,color:G.textDim,textTransform:"uppercase",letterSpacing:1.2}}>Últimos 6 ciclos</div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={barData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke={G.border} vertical={false}/>
                  <XAxis dataKey="name" tick={{fill:G.textFaint,fontSize:11,fontFamily:"'Space Mono'"}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fill:G.textFaint,fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>`$${(v/1000).toFixed(0)}k`}/>
                  <Tooltip contentStyle={{background:G.surface,border:`1px solid ${G.borderHi}`,borderRadius:10,color:G.text}} formatter={v=>formatCLP(v)}/>
                  <Bar dataKey="Ingresos" fill={G.primary} radius={[4,4,0,0]}/>
                  <Bar dataKey="Gastos"   fill={G.danger}  radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* pie */}
            {pieData.length>0 && (
              <div className="card" style={{padding:"20px",marginBottom:20}}>
                <div style={{fontSize:11,fontWeight:600,marginBottom:16,color:G.textDim,textTransform:"uppercase",letterSpacing:1.2}}>Gastos por categoría — ciclo actual</div>
                <div style={{display:"flex",alignItems:"center",gap:20,flexWrap:"wrap"}}>
                  <ResponsiveContainer width={150} height={150}>
                    <PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={42} outerRadius={68} dataKey="value" stroke="none">{pieData.map((d,i)=><Cell key={i} fill={d.color}/>)}</Pie></PieChart>
                  </ResponsiveContainer>
                  <div style={{flex:1,display:"flex",flexDirection:"column",gap:8}}>
                    {pieData.map(d=>(
                      <div key={d.name} style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{width:8,height:8,borderRadius:"50%",background:d.color,flexShrink:0}}/>
                        <span style={{fontSize:12,color:G.textDim,flex:1}}>{d.name}</span>
                        <span style={{fontSize:12,fontFamily:"'Space Mono'",color:G.text}}>{formatCLP(d.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* savings */}
            {state.savings.length>0 && (
              <div className="card" style={{padding:"20px"}}>
                <div style={{fontSize:11,fontWeight:600,marginBottom:16,color:G.textDim,textTransform:"uppercase",letterSpacing:1.2}}>Metas de ahorro</div>
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  {state.savings.map(sv=>{const pct=Math.min(100,(sv.current/sv.goal)*100);return(
                    <div key={sv.id}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                        <span style={{fontSize:13}}>{sv.icon} {sv.name}</span>
                        <span style={{fontSize:11,fontFamily:"'Space Mono'",color:G.textDim}}>{formatCLP(sv.current)} / {formatCLP(sv.goal)}</span>
                      </div>
                      <div className="progress-bar"><div className="progress-fill" style={{width:`${pct}%`,background:pct>=100?G.primary:sv.color}}/></div>
                    </div>
                  );})}
                </div>
              </div>
            )}

            {txs.length===0 && state.savings.length===0 && (
              <div style={{textAlign:"center",padding:"60px 20px",color:G.textFaint}}>
                <div style={{fontSize:52,marginBottom:14}}>🥑</div>
                <div style={{fontSize:16,fontWeight:600,color:G.textDim}}>¡Empieza a ponerte En Verde!</div>
                <div style={{fontSize:13,marginTop:8}}>Registra tu primer movimiento</div>
              </div>
            )}
          </div>
        )}

        {/* ── TRANSACTIONS ── */}
        {tab==="transactions" && (
          <div className="fade">
            <div className="card" style={{padding:"20px",marginBottom:20}}>
              <div style={{fontSize:11,fontWeight:600,marginBottom:16,color:G.textDim,textTransform:"uppercase",letterSpacing:1.2}}>Nuevo movimiento</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                <select className="inp" value={txForm.type} onChange={e=>setTxForm(f=>({...f,type:e.target.value}))}><option value="gasto">Gasto</option><option value="ingreso">Ingreso</option></select>
                <input className="inp" type="number" placeholder="Monto (CLP)" value={txForm.amount} onChange={e=>setTxForm(f=>({...f,amount:e.target.value}))}/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                <select className="inp" value={txForm.category} onChange={e=>setTxForm(f=>({...f,category:e.target.value}))}>{CATEGORIES.map(c=><option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}</select>
                <input className="inp" type="date" value={txForm.date} onChange={e=>setTxForm(f=>({...f,date:e.target.value}))}/>
              </div>
              <input className="inp" placeholder="Descripción" value={txForm.description} onChange={e=>setTxForm(f=>({...f,description:e.target.value}))} style={{marginBottom:12}}/>
              <button className="btn btn-primary" onClick={addTransaction} style={{width:"100%"}}>Registrar</button>
            </div>

            <div style={{display:"flex",gap:8,marginBottom:16}}>
              {["all","gasto","ingreso"].map(f=>(
                <button key={f} onClick={()=>setFilter(f)} className="btn" style={{background:filter===f?G.primaryDim:"transparent",color:filter===f?G.primary:G.textFaint,border:filter===f?`1px solid ${G.primaryMid}`:`1px solid ${G.border}`,padding:"6px 14px",fontSize:12}}>
                  {f==="all"?"Todos":f==="gasto"?"Gastos":"Ingresos"}
                </button>
              ))}
              <span style={{marginLeft:"auto",fontSize:11,color:G.textFaint,alignSelf:"center",fontFamily:"'Space Mono'"}}>{filteredTxs.length} reg.</span>
            </div>

            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {filteredTxs.length===0 && <div style={{textAlign:"center",padding:40,color:G.textFaint,fontSize:14}}>Sin movimientos registrados</div>}
              {filteredTxs.map(t=>{const cat=CATEGORIES.find(c=>c.id===t.category);const inThisCycle=inCycle(t.date,cycle.start,cycle.end);return(
                <div key={t.id} className="card" style={{padding:"14px 16px",display:"flex",alignItems:"center",gap:12,opacity:inThisCycle?1:0.6}}>
                  <div style={{width:38,height:38,borderRadius:10,background:`${cat.color}18`,border:`1px solid ${cat.color}30`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{cat.icon}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <div style={{fontSize:14,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.description}</div>
                      {inThisCycle && <span style={{fontSize:9,background:G.primaryDim,color:G.primary,padding:"1px 6px",borderRadius:4,whiteSpace:"nowrap",flexShrink:0}}>ciclo actual</span>}
                    </div>
                    <div style={{fontSize:11,color:G.textFaint,marginTop:2}}>{cat.label} · {new Date(t.date+"T12:00:00").toLocaleDateString("es-CL")}</div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    <div style={{fontSize:15,fontWeight:700,color:t.type==="ingreso"?G.primary:G.danger,fontFamily:"'Space Mono'"}}>{t.type==="ingreso"?"+":"-"}{formatCLP(t.amount)}</div>
                    <button className="btn btn-danger" onClick={()=>deleteTx(t.id)} style={{marginTop:4}}>✕</button>
                  </div>
                </div>
              );})}
            </div>
          </div>
        )}

        {/* ── SAVINGS ── */}
        {tab==="savings" && (
          <div className="fade">
            <div className="card" style={{padding:"20px",marginBottom:20}}>
              <div style={{fontSize:11,fontWeight:600,marginBottom:16,color:G.textDim,textTransform:"uppercase",letterSpacing:1.2}}>Nueva meta de ahorro</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:10,marginBottom:10}}>
                <input className="inp" placeholder="Nombre de la meta" value={savForm.name} onChange={e=>setSavForm(f=>({...f,name:e.target.value}))}/>
                <input className="inp" placeholder="🎯" value={savForm.icon} onChange={e=>setSavForm(f=>({...f,icon:e.target.value}))} style={{width:60,textAlign:"center",fontSize:18}}/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                <input className="inp" type="number" placeholder="Meta (CLP)" value={savForm.goal} onChange={e=>setSavForm(f=>({...f,goal:e.target.value}))}/>
                <input className="inp" type="number" placeholder="Ya tengo (opcional)" value={savForm.current} onChange={e=>setSavForm(f=>({...f,current:e.target.value}))}/>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                <span style={{fontSize:11,color:G.textFaint}}>Color:</span>
                {["#22c55e","#4ade80","#86efac","#16a34a","#6ee7b7","#34d399"].map(c=>(
                  <div key={c} onClick={()=>setSavForm(f=>({...f,color:c}))} style={{width:22,height:22,borderRadius:"50%",background:c,cursor:"pointer",border:savForm.color===c?"2px solid #fff":"2px solid transparent",transition:"transform .15s",transform:savForm.color===c?"scale(1.25)":"scale(1)"}}/>
                ))}
              </div>
              <button className="btn btn-primary" onClick={addSavings} style={{width:"100%"}}>Crear meta</button>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {state.savings.length===0 && <div style={{textAlign:"center",padding:40,color:G.textFaint,fontSize:14}}>Sin metas creadas aún</div>}
              {state.savings.map(sv=>{const pct=Math.min(100,(sv.current/sv.goal)*100);const done=pct>=100;return(
                <div key={sv.id} className="card" style={{padding:"18px",border:done?`1px solid ${G.primaryMid}`:`1px solid ${G.border}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                    <div>
                      <div style={{fontSize:22,marginBottom:4}}>{sv.icon}</div>
                      <div style={{fontSize:15,fontWeight:600}}>{sv.name}</div>
                      {done && <span className="tag" style={{background:G.primaryDim,color:G.primary,marginTop:6}}>✓ ¡En Verde!</span>}
                    </div>
                    <button className="btn btn-danger" onClick={()=>deleteSaving(sv.id)}>✕</button>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:8,color:G.textDim}}>
                    <span>Acumulado: <b style={{color:G.text,fontFamily:"'Space Mono'"}}>{formatCLP(sv.current)}</b></span>
                    <span>Meta: <b style={{color:G.text,fontFamily:"'Space Mono'"}}>{formatCLP(sv.goal)}</b></span>
                  </div>
                  <div className="progress-bar" style={{marginBottom:10}}><div className="progress-fill" style={{width:`${pct}%`,background:done?G.primary:sv.color}}/></div>
                  <div style={{fontSize:11,color:G.textFaint,marginBottom:12,textAlign:"right",fontFamily:"'Space Mono'"}}>{pct.toFixed(1)}% · Faltan {formatCLP(Math.max(0,sv.goal-sv.current))}</div>
                  {savDeposit.id===sv.id?(
                    <div style={{display:"flex",gap:8}}>
                      <input className="inp" type="number" placeholder="Monto a depositar" value={savDeposit.amount} onChange={e=>setSavDeposit(d=>({...d,amount:e.target.value}))}/>
                      <button className="btn btn-primary" onClick={depositSavings}>✓</button>
                      <button className="btn" onClick={()=>setSavDeposit({id:null,amount:""})} style={{background:G.surface,color:G.textDim,border:`1px solid ${G.border}`}}>✕</button>
                    </div>
                  ):(
                    <button className="btn" onClick={()=>setSavDeposit({id:sv.id,amount:""})} style={{background:`${sv.color}15`,color:sv.color,border:`1px solid ${sv.color}35`,width:"100%"}}>+ Depositar</button>
                  )}
                </div>
              );})}
            </div>
          </div>
        )}

        {/* ── BUDGETS ── */}
        {tab==="budgets" && (
          <div className="fade">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div>
                <div style={{fontSize:15,fontWeight:600}}>Presupuesto del ciclo</div>
                <div style={{fontSize:11,color:G.textFaint,fontFamily:"'Space Mono'"}}>{cycle.start} → {cycle.end}</div>
              </div>
              {budgetDraft?(
                <div style={{display:"flex",gap:8}}>
                  <button className="btn btn-primary" onClick={saveBudgets} style={{padding:"8px 14px",fontSize:12}}>Guardar</button>
                  <button className="btn btn-ghost" onClick={()=>setBudgetDraft(null)} style={{padding:"8px 14px",fontSize:12}}>Cancelar</button>
                </div>
              ):(
                <button className="btn btn-ghost" onClick={()=>setBudgetDraft({...state.budgets})} style={{padding:"8px 14px",fontSize:12}}>Editar</button>
              )}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {budgetUsage.map(c=>{const over=c.budget>0&&c.spent>c.budget;return(
                <div key={c.id} className="card" style={{padding:"16px",border:over?`1px solid ${G.danger}40`:`1px solid ${G.border}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:(over||(!budgetDraft&&c.budget>0))?10:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:18}}>{c.icon}</span>
                      <span style={{fontSize:14,fontWeight:500}}>{c.label}</span>
                      {over && <span className="tag" style={{background:G.dangerDim,color:G.danger,fontSize:10}}>Excedido</span>}
                    </div>
                    {budgetDraft?(
                      <input type="number" className="inp" value={budgetDraft[c.id]||""} placeholder="0" onChange={e=>setBudgetDraft(d=>({...d,[c.id]:+e.target.value}))} style={{width:120,textAlign:"right",fontSize:13}}/>
                    ):(
                      <div style={{fontSize:12,fontFamily:"'Space Mono'",color:over?G.danger:G.textDim}}>{formatCLP(c.spent)} <span style={{color:G.textFaint}}>/ {c.budget>0?formatCLP(c.budget):"—"}</span></div>
                    )}
                  </div>
                  {!budgetDraft && c.budget>0 && <div className="progress-bar"><div className="progress-fill" style={{width:`${c.pct}%`,background:over?G.danger:c.color}}/></div>}
                  {!budgetDraft && c.budget===0 && <div style={{fontSize:11,color:G.textFaint,marginTop:4}}>Sin presupuesto definido</div>}
                </div>
              );})}
            </div>
            <div className="card" style={{padding:"16px",marginTop:16,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:13,color:G.textDim}}>Total presupuestado</div>
              <div style={{fontFamily:"'Space Mono'",fontSize:15,fontWeight:700,color:G.primary}}>{formatCLP(Object.values(state.budgets).reduce((s,v)=>s+v,0))}</div>
            </div>
          </div>
        )}
      </div>

      {/* ── SETTINGS MODAL ── */}
      {showSettings && (
        <div className="modal-bg" onClick={e=>{if(e.target===e.currentTarget)setShowSettings(false)}}>
          <div className="modal">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <div>
                <div style={{fontSize:16,fontWeight:700}}>Configuración</div>
                <div style={{fontSize:12,color:G.textFaint,marginTop:2}}>Ciclo de pago</div>
              </div>
              <button onClick={()=>setShowSettings(false)} style={{background:"transparent",border:"none",color:G.textFaint,fontSize:20,cursor:"pointer"}}>✕</button>
            </div>

            <div style={{fontSize:13,color:G.textDim,marginBottom:4}}>¿Qué día del mes te pagan?</div>
            <div style={{fontSize:11,color:G.textFaint,marginBottom:12}}>Los ciclos se contarán desde ese día hasta el día anterior del mes siguiente.</div>

            {/* grid de días 1–28 */}
            <div className="day-grid">
              {Array.from({length:28},(_,i)=>i+1).map(d=>(
                <button key={d} className={`day-btn${+payDayDraft===d?" selected":""}`} onClick={()=>setPayDayDraft(String(d))}>{d}</button>
              ))}
            </div>

            {/* preview */}
            {payDayDraft && !isNaN(+payDayDraft) && +payDayDraft>=1 && +payDayDraft<=28 && (()=>{
              const preview = getCurrentCycle(+payDayDraft);
              return (
                <div style={{background:G.surface,border:`1px solid ${G.border}`,borderRadius:10,padding:"12px 14px",marginBottom:16}}>
                  <div style={{fontSize:11,color:G.textFaint,marginBottom:4}}>Vista previa del ciclo actual</div>
                  <div style={{fontSize:13,color:G.primary,fontFamily:"'Space Mono'",fontWeight:600}}>{preview.start} → {preview.end}</div>
                </div>
              );
            })()}

            <div style={{display:"flex",gap:10}}>
              <button className="btn btn-primary" onClick={savePayDay} style={{flex:1}}>Guardar</button>
              <button className="btn btn-ghost" onClick={()=>setShowSettings(false)} style={{flex:1}}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── TOAST ── */}
      {toast && (
        <div className="toast-anim" style={{position:"fixed",bottom:28,right:16,background:toast.type==="err"?G.danger:G.primary,color:toast.type==="err"?"#fff":"#0a110d",padding:"12px 20px",borderRadius:12,fontSize:14,fontWeight:600,zIndex:999,boxShadow:`0 8px 24px ${toast.type==="err"?"#f8717140":"#22c55e40"}`}}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
