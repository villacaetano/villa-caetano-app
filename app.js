(() => {
  "use strict";

  const config = window.SUPABASE_CONFIG || {};
  const errorBox = document.getElementById("app-error");
  const authView = document.getElementById("auth-view");
  const mainView = document.getElementById("main-view");
  const pageContent = document.getElementById("page-content");
  const modalRoot = document.getElementById("modal-root");
  const toastRoot = document.getElementById("toast-root");

  let supabase = null;
  let currentUser = null;
  let currentProfile = null;
  let currentSection = "dashboard";
  let currentRecords = [];
  let currentRecordType = null;

  const ROLE = { OWNER:"owner", MANAGER:"property_manager", CARETAKER:"caretaker", CONTRACTOR:"contractor", REPORTER:"reporter" };
  const ROLE_LABEL = {
    owner:"Owner", property_manager:"Property Manager", caretaker:"Caretaker",
    contractor:"Contractor", reporter:"Reporter"
  };

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  const dateFmt = value => value ? new Intl.DateTimeFormat(undefined,{day:"2-digit",month:"short",year:"numeric"}).format(new Date(value)) : "—";
  const money = value => value == null || value === "" ? "—" : new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(Number(value));
  const nowISO = () => new Date().toISOString();
  const isAdmin = () => [ROLE.OWNER,ROLE.MANAGER].includes(currentProfile?.role);
  const canDelete = () => isAdmin();
  const canFinance = () => isAdmin();
  const canManageUsers = () => isAdmin();
  const canEditRecord = type => {
    if (isAdmin()) return true;
    if (["caretaker","contractor"].includes(currentProfile?.role)) return type === "issues" || type === "recurring_tasks";
    return ["reporter"].includes(currentProfile?.role) && type === "issues";
  };

  function showToast(message, type="ok") {
    const el = document.createElement("div");
    el.className = `toast ${type === "error" ? "error" : ""}`;
    el.textContent = message;
    toastRoot.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }
  function showAppError(message) {
    errorBox.innerHTML = `<strong>Application diagnostic:</strong><br>${esc(message)}`;
    errorBox.classList.remove("hidden");
  }
  function clearAppError(){ errorBox.classList.add("hidden"); errorBox.textContent = ""; }

  function supabaseDiagnostic() {
    if (!window.supabase) return "Supabase CDN did not load. Check your internet connection or CDN access.";
    if (!config.url || config.url.includes("PASTE_")) return "Supabase Project URL is missing. Open supabase.js and paste your Project URL.";
    if (!config.publishableKey || config.publishableKey.includes("PASTE_")) return "Supabase publishable key is missing. Open supabase.js and paste the publishable key.";
    if (!/^https:\/\/.+\.supabase\.co$/.test(config.url)) return "Supabase URL does not look like a valid project URL. Copy it from Supabase Project Settings → API.";
    return null;
  }

  async function init() {
    const diagnostic = supabaseDiagnostic();
    if (diagnostic) { showAppError(diagnostic); showAuth(); return; }
    try {
      supabase = window.supabase.createClient(config.url, config.publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
    } catch (e) {
      showAppError(`JavaScript could not initialise Supabase: ${e.message}`);
      showAuth(); return;
    }

    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        if (session?.user) {
          currentUser = session.user;
          if (event === "PASSWORD_RECOVERY") showSetPassword();
          else await enterApp();
        }
      }
      if (event === "SIGNED_OUT") { currentUser = null; currentProfile = null; showAuth(); }
    });

    const { data, error } = await supabase.auth.getSession();
    if (error) { showAppError(`Authentication session could not be read: ${error.message}`); showAuth(); return; }
    if (data.session?.user) {
      currentUser = data.session.user;
      const recovery = window.location.hash.includes("type=recovery");
      if (recovery) showSetPassword(); else await enterApp();
    } else showAuth();

    bindAuth();
    bindNavigation();
  }

  function showAuth(panel="login") {
    authView.classList.remove("hidden"); mainView.classList.add("hidden");
    ["login-panel","forgot-panel","set-password-panel"].forEach(id => $(id).classList.add("hidden"));
    $(panel === "login" ? "login-panel" : panel === "forgot" ? "forgot-panel" : "set-password-panel").classList.remove("hidden");
  }

  function showSetPassword(){ showAuth("set-password"); }

  function bindAuth() {
    $("forgot-password-btn").onclick = () => showAuth("forgot");
    $("back-to-login-btn").onclick = () => showAuth("login");
    $("login-form").onsubmit = async e => {
      e.preventDefault(); clearAppError();
      const email = $("login-email").value.trim(), password = $("login-password").value;
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { showToast(`Sign in failed: ${error.message}`, "error"); return; }
      currentUser = data.user; await enterApp();
    };
    $("forgot-form").onsubmit = async e => {
      e.preventDefault();
      const email = $("forgot-email").value.trim();
      const redirectTo = window.location.origin + window.location.pathname;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) { showToast(`Could not send reset email: ${error.message}`, "error"); return; }
      showToast("Reset link sent. Check your email.");
    };
    $("set-password-form").onsubmit = async e => {
      e.preventDefault();
      const p = $("new-password").value, c = $("confirm-password").value;
      if (p.length < 8) return showToast("Password must be at least 8 characters.", "error");
      if (p !== c) return showToast("The passwords do not match.", "error");
      const { error } = await supabase.auth.updateUser({ password:p });
      if (error) { showToast(`Password update failed: ${error.message}`, "error"); return; }
      window.history.replaceState({}, document.title, window.location.pathname);
      showToast("Password set successfully.");
      await enterApp();
    };
    $("logout-btn").onclick = async () => { await supabase.auth.signOut(); };
    $("menu-btn").onclick = () => $("sidebar").classList.toggle("open");
  }

  function bindNavigation() {
    document.querySelectorAll(".nav-item[data-section]").forEach(btn => {
      btn.onclick = () => {
        currentSection = btn.dataset.section;
        document.querySelectorAll(".nav-item[data-section]").forEach(x => x.classList.toggle("active", x === btn));
        $("sidebar").classList.remove("open");
        renderSection();
      };
    });
  }

  async function enterApp() {
    authView.classList.add("hidden"); mainView.classList.remove("hidden");
    try {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", currentUser.id).single();
      if (error) throw error;
      currentProfile = data;
      if (!currentProfile.active) { await supabase.auth.signOut(); showToast("Your account is disabled. Contact the property administrator.","error"); return; }
      $("current-user-mini").innerHTML = `<strong>${esc(currentProfile.full_name || currentUser.email)}</strong><br>${esc(ROLE_LABEL[currentProfile.role] || currentProfile.role)}`;
      $("header-user").textContent = currentUser.email;
      document.querySelectorAll(".admin-only").forEach(el => el.classList.toggle("hidden", !isAdmin()));
      if (!isAdmin() && currentSection === "admin") currentSection = "dashboard";
      renderSection();
    } catch (e) {
      showAppError(`Signed in, but the profile could not be loaded. This usually means schema.sql has not been run or the profile record is missing. Details: ${e.message}`);
    }
  }

  function setTitle(title){ $("page-title").textContent = title; }

  async function renderSection() {
    clearAppError();
    if (currentSection === "dashboard") return renderDashboard();
    if (currentSection === "maintenance") return renderMaintenance();
    if (currentSection === "recurring") return renderRecurring();
    if (currentSection === "bills") return renderBills();
    if (currentSection === "expenses") return renderExpenses();
    if (currentSection === "admin") return renderAdmin();
  }

  function loading(){ pageContent.innerHTML = `<div class="panel"><div class="empty">Loading…</div></div>`; }

  async function queryTable(table, select="*") {
    const { data, error } = await supabase.from(table).select(select);
    if (error) throw error;
    return data || [];
  }

  function metricCard(label,value,note=""){
    return `<div class="card"><div class="metric-label">${esc(label)}</div><div class="metric-value">${esc(value)}</div>${note?`<div class="stat-note">${esc(note)}</div>`:""}</div>`;
  }

  async function renderDashboard() {
    setTitle("Dashboard"); loading();
    try {
      const [issues, recurring, bills, expenses] = await Promise.all([
        queryTable("issues","*, issue_assignments(user_id, profiles:profiles!issue_assignments_user_id_fkey(full_name))"),
        queryTable("recurring_tasks","*"),
        queryTable("bills","*"),
        queryTable("expenses","*")
      ]);
      const today = new Date(); today.setHours(0,0,0,0);
      const monthStart = new Date(today.getFullYear(),today.getMonth(),1);
      const yearStart = new Date(today.getFullYear(),0,1);
      const open = issues.filter(x=>x.status==="open").length;
      const progress = issues.filter(x=>x.status==="in_progress").length;
      const waiting = issues.filter(x=>x.status==="waiting").length;
      const overdue = issues.filter(x=>x.status!=="completed" && x.due_date && new Date(x.due_date) < today).length;
      const monthSpend = expenses.filter(x=>new Date(x.date)>=monthStart).reduce((s,x)=>s+Number(x.amount||0),0);
      const yearSpend = expenses.filter(x=>new Date(x.date)>=yearStart).reduce((s,x)=>s+Number(x.amount||0),0);
      const monthlyProjection = bills.filter(b=>b.status!=="inactive").reduce((s,b)=>s+Number(b.expected_amount||0)/(b.frequency==="monthly"?1:b.frequency==="quarterly"?3:b.frequency==="yearly"?12:1),0)
        + recurring.filter(t=>t.next_due).reduce((s,t)=>s+Number(t.expected_cost||0)/(t.frequency==="weekly"?4.33:t.frequency==="twice_monthly"?2:t.frequency==="monthly"?1:t.frequency==="quarterly"?3:t.frequency==="half_yearly"?6:12),0);
      const yearlyProjection = monthlyProjection*12;
      const upcoming = [
        ...issues.filter(x=>x.status!=="completed" && x.due_date).map(x=>({kind:"Maintenance",title:x.title,date:x.due_date,priority:x.priority})),
        ...recurring.filter(x=>x.next_due).map(x=>({kind:"Recurring",title:x.task_name,date:x.next_due})),
        ...bills.filter(x=>x.status!=="inactive" && x.next_due).map(x=>({kind:"Bill",title:x.bill_name,date:x.next_due}))
      ].sort((a,b)=>new Date(a.date)-new Date(b.date)).slice(0,8);
      const recent = [
        ...issues.map(x=>({kind:"Maintenance",title:x.title,date:x.created_at})),
        ...expenses.map(x=>({kind:"Expense",title:x.description,date:x.created_at})),
        ...bills.map(x=>({kind:"Bill",title:x.bill_name,date:x.created_at})),
        ...recurring.filter(x=>x.last_completed).map(x=>({kind:"Completed task",title:x.task_name,date:x.last_completed}))
      ].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,8);

      pageContent.innerHTML = `
        <div class="cards">
          ${metricCard("Open maintenance",open)}
          ${metricCard("In progress",progress)}
          ${metricCard("Overdue",overdue)}
          ${metricCard("Waiting",waiting)}
          ${metricCard("This month",money(monthSpend),"Actual spending")}
          ${metricCard("This year",money(yearSpend),"Actual spending")}
          ${metricCard("Monthly projection",money(monthlyProjection),"Recurring bills + tasks")}
          ${metricCard("Yearly projection",money(yearlyProjection),"Run-rate estimate")}
        </div>
        <div class="grid-2">
          <section class="panel"><h2>Upcoming</h2><div class="list">${upcoming.length ? upcoming.map(x=>`
            <div class="list-row"><div class="list-main"><div class="list-title">${esc(x.title)}</div><div class="list-meta">${esc(x.kind)}${x.priority?` · ${esc(x.priority)}`:""}</div></div><strong class="${new Date(x.date)<today?"overdue":""}">${dateFmt(x.date)}</strong></div>`).join("") : `<div class="empty">Nothing upcoming.</div>`}</div></section>
          <section class="panel"><h2>Recent activity</h2><div class="list">${recent.length ? recent.map(x=>`
            <div class="list-row"><div class="list-main"><div class="list-title">${esc(x.title)}</div><div class="list-meta">${esc(x.kind)}</div></div><span>${dateFmt(x.date)}</span></div>`).join("") : `<div class="empty">No recent activity.</div>`}</div></section>
        </div>
      `;
    } catch(e) { handleError(e,"Dashboard could not load."); }
  }

  function toolbar({searchId, addText, addFn, filters=""}={}) {
    return `<div class="section-toolbar"><div class="toolbar-left">${searchId?`<input class="search" id="${searchId}" placeholder="Search…">`:""}${filters}</div><div class="toolbar-right">${addText?`<button class="btn btn-primary" id="add-record-btn">+ ${esc(addText)}</button>`:""}</div></div>`;
  }

  function issueBadge(v){ return `<span class="badge badge-${v==="in_progress"?"progress":v==="completed"?"complete":v==="waiting"?"waiting":"open"}">${esc(v.replace("_"," "))}</span>`; }
  function priorityBadge(v){ return `<span class="badge badge-${v}">${esc(v)}</span>`; }

  async function renderMaintenance() {
    setTitle("Maintenance"); loading();
    try {
      currentRecords = await queryTable("issues","*, issue_assignments(user_id, profiles:profiles!issue_assignments_user_id_fkey(full_name))");
      pageContent.innerHTML = `
        ${toolbar({searchId:"issue-search",addText:canEditRecord("issues")?"Report issue":""})}
        <div class="desktop-table table-wrap"><table class="data-table"><thead><tr><th>Issue</th><th>Category</th><th>Priority</th><th>Status</th><th>Due</th><th>Assigned</th><th></th></tr></thead><tbody id="issue-table"></tbody></table></div>
        <div class="mobile-cards" id="issue-mobile"></div>`;
      if ($("add-record-btn")) $("add-record-btn").onclick = () => openIssueModal();
      renderIssueRows(currentRecords);
      $("issue-search").oninput = () => renderIssueRows(filterText(currentRecords,$("issue-search").value,["title","description","category","status","priority"]));
    } catch(e) { handleError(e,"Maintenance could not load."); }
  }

  function filterText(rows,q,fields){ if(!q)return rows; q=q.toLowerCase(); return rows.filter(r=>fields.some(f=>String(r[f]??"").toLowerCase().includes(q))); }

  function assignees(record){
    return (record.issue_assignments||[]).map(a=>a.profiles?.full_name).filter(Boolean).join(", ") || "Unassigned";
  }

  function renderIssueRows(rows){
    $("issue-table").innerHTML = rows.length ? rows.map(r=>`
      <tr class="clickable" data-id="${r.id}">
        <td><strong>${esc(r.title)}</strong><div class="list-meta">${esc(r.description||"").slice(0,70)}</div></td>
        <td>${esc(r.category)}</td><td>${priorityBadge(r.priority)}</td><td>${issueBadge(r.status)}</td>
        <td class="${r.status!=="completed"&&r.due_date&&new Date(r.due_date)<new Date()?"overdue":""}">${dateFmt(r.due_date)}</td>
        <td>${esc(assignees(r))}</td><td><button class="icon-btn more" data-id="${r.id}" aria-label="Actions">•••</button></td>
      </tr>`).join("") : `<tr><td colspan="7"><div class="empty">No maintenance issues found.</div></td></tr>`;
    $("issue-mobile").innerHTML = rows.length ? rows.map(r=>`
      <article class="mobile-record clickable" data-id="${r.id}">
        <div class="mobile-record-head"><div class="mobile-record-title">${esc(r.title)}</div>${priorityBadge(r.priority)}</div>
        <div class="list-meta">${esc(r.category)} · ${issueBadge(r.status)}</div>
        <div class="mobile-record-grid"><div><div class="mobile-record-label">Due</div><div class="mobile-record-value">${dateFmt(r.due_date)}</div></div><div><div class="mobile-record-label">Assigned</div><div class="mobile-record-value">${esc(assignees(r))}</div></div></div>
      </article>`).join("") : `<div class="empty">No maintenance issues found.</div>`;
    document.querySelectorAll("[data-id]").forEach(el=>{ if(el.dataset.id && !el.classList.contains("more")) el.onclick=()=>openIssueModal(el.dataset.id); });
    document.querySelectorAll(".more").forEach(el=>el.onclick=e=>{e.stopPropagation(); openActions("issues",el.dataset.id);});
  }

  async function renderRecurring(){
    setTitle("Recurring"); loading();
    try {
      currentRecords=await queryTable("recurring_tasks","*");
      pageContent.innerHTML=`${toolbar({searchId:"recurring-search",addText:canEditRecord("recurring_tasks")?"Add recurring task":""})}
      <div class="desktop-table table-wrap"><table class="data-table"><thead><tr><th>Task</th><th>Category</th><th>Frequency</th><th>Next due</th><th>Expected</th><th>Last completed</th><th></th></tr></thead><tbody id="recurring-table"></tbody></table></div><div class="mobile-cards" id="recurring-mobile"></div>`;
      if($("add-record-btn")) $("add-record-btn").onclick=()=>openRecurringModal();
      renderRecurringRows(currentRecords);
      $("recurring-search").oninput=()=>renderRecurringRows(filterText(currentRecords,$("recurring-search").value,["task_name","description","category","frequency"]));
    }catch(e){handleError(e,"Recurring tasks could not load.");}
  }
  function renderRecurringRows(rows){
    const freq = v=>v?.replace("_"," ");
    $("recurring-table").innerHTML=rows.length?rows.map(r=>`<tr class="clickable" data-rid="${r.id}"><td><strong>${esc(r.task_name)}</strong><div class="list-meta">${esc(r.description||"").slice(0,70)}</div></td><td>${esc(r.category)}</td><td>${esc(freq(r.frequency))}</td><td>${dateFmt(r.next_due)}</td><td>${money(r.expected_cost)}</td><td>${dateFmt(r.last_completed)}</td><td><button class="icon-btn recurring-more" data-id="${r.id}">•••</button></td></tr>`).join(""):`<tr><td colspan="7"><div class="empty">No recurring tasks found.</div></td></tr>`;
    $("recurring-mobile").innerHTML=rows.length?rows.map(r=>`<article class="mobile-record clickable" data-rid="${r.id}"><div class="mobile-record-head"><div class="mobile-record-title">${esc(r.task_name)}</div><span class="badge badge-normal">${esc(freq(r.frequency))}</span></div><div class="mobile-record-grid"><div><div class="mobile-record-label">Next due</div><div class="mobile-record-value">${dateFmt(r.next_due)}</div></div><div><div class="mobile-record-label">Expected</div><div class="mobile-record-value">${money(r.expected_cost)}</div></div></div></article>`).join(""):`<div class="empty">No recurring tasks found.</div>`;
    document.querySelectorAll("[data-rid]").forEach(el=>el.onclick=()=>openRecurringModal(el.dataset.rid));
    document.querySelectorAll(".recurring-more").forEach(el=>el.onclick=e=>{e.stopPropagation();openActions("recurring_tasks",el.dataset.id);});
  }

  async function renderBills(){
    setTitle("Bills"); loading();
    try{
      currentRecords=await queryTable("bills","*");
      pageContent.innerHTML=`${toolbar({searchId:"bill-search",addText:canFinance()?"Add bill":""})}
      <div class="desktop-table table-wrap"><table class="data-table"><thead><tr><th>Bill</th><th>Category</th><th>Frequency</th><th>Expected</th><th>Next due</th><th>Status</th><th></th></tr></thead><tbody id="bill-table"></tbody></table></div><div class="mobile-cards" id="bill-mobile"></div>`;
      if($("add-record-btn"))$("add-record-btn").onclick=()=>openBillModal();
      renderBillRows(currentRecords); $("bill-search").oninput=()=>renderBillRows(filterText(currentRecords,$("bill-search").value,["bill_name","category","frequency","status"]));
    }catch(e){handleError(e,"Bills could not load.");}
  }
  function renderBillRows(rows){
    $("bill-table").innerHTML=rows.length?rows.map(r=>`<tr class="clickable" data-bid="${r.id}"><td><strong>${esc(r.bill_name)}</strong></td><td>${esc(r.category)}</td><td>${esc(r.frequency)}</td><td>${money(r.expected_amount)}</td><td>${dateFmt(r.next_due)}</td><td><span class="badge ${r.status==="inactive"?"badge-disabled":"badge-active"}">${esc(r.status)}</span></td><td><button class="icon-btn bill-more" data-id="${r.id}">•••</button></td></tr>`).join(""):`<tr><td colspan="7"><div class="empty">No bills found.</div></td></tr>`;
    $("bill-mobile").innerHTML=rows.length?rows.map(r=>`<article class="mobile-record clickable" data-bid="${r.id}"><div class="mobile-record-head"><div class="mobile-record-title">${esc(r.bill_name)}</div><span class="badge ${r.status==="inactive"?"badge-disabled":"badge-active"}">${esc(r.status)}</span></div><div class="mobile-record-grid"><div><div class="mobile-record-label">Next due</div><div class="mobile-record-value">${dateFmt(r.next_due)}</div></div><div><div class="mobile-record-label">Expected</div><div class="mobile-record-value">${money(r.expected_amount)}</div></div></div></article>`).join(""):`<div class="empty">No bills found.</div>`;
    document.querySelectorAll("[data-bid]").forEach(el=>el.onclick=()=>openBillModal(el.dataset.bid));
    document.querySelectorAll(".bill-more").forEach(el=>el.onclick=e=>{e.stopPropagation();openActions("bills",el.dataset.id);});
  }

  async function renderExpenses(){
    setTitle("Expenses"); loading();
    try{
      currentRecords=await queryTable("expenses","*");
      pageContent.innerHTML=`${toolbar({searchId:"expense-search",addText:canFinance()?"Add expense":""})}
      <div class="desktop-table table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Amount</th><th>Source</th><th></th></tr></thead><tbody id="expense-table"></tbody></table></div><div class="mobile-cards" id="expense-mobile"></div>`;
      if($("add-record-btn"))$("add-record-btn").onclick=()=>openExpenseModal();
      renderExpenseRows(currentRecords); $("expense-search").oninput=()=>renderExpenseRows(filterText(currentRecords,$("expense-search").value,["description","category","source_type"]));
    }catch(e){handleError(e,"Expenses could not load.");}
  }
  function renderExpenseRows(rows){
    $("expense-table").innerHTML=rows.length?rows.sort((a,b)=>new Date(b.date)-new Date(a.date)).map(r=>`<tr class="clickable" data-eid="${r.id}"><td>${dateFmt(r.date)}</td><td><strong>${esc(r.description)}</strong></td><td>${esc(r.category)}</td><td><strong>${money(r.amount)}</strong></td><td>${esc(r.source_type||"manual")}</td><td><button class="icon-btn expense-more" data-id="${r.id}">•••</button></td></tr>`).join(""):`<tr><td colspan="6"><div class="empty">No expenses found.</div></td></tr>`;
    $("expense-mobile").innerHTML=rows.length?rows.sort((a,b)=>new Date(b.date)-new Date(a.date)).map(r=>`<article class="mobile-record clickable" data-eid="${r.id}"><div class="mobile-record-head"><div class="mobile-record-title">${esc(r.description)}</div><strong>${money(r.amount)}</strong></div><div class="list-meta">${dateFmt(r.date)} · ${esc(r.category)}</div></article>`).join(""):`<div class="empty">No expenses found.</div>`;
    document.querySelectorAll("[data-eid]").forEach(el=>el.onclick=()=>openExpenseModal(el.dataset.eid));
    document.querySelectorAll(".expense-more").forEach(el=>el.onclick=e=>{e.stopPropagation();openActions("expenses",el.dataset.id);});
  }

  async function renderAdmin(){
    if(!isAdmin())return;
    setTitle("Admin"); loading();
    try{
      const profiles=await queryTable("profiles","*");
      pageContent.innerHTML=`<section class="panel"><div class="section-toolbar"><div><h2>User access</h2><div class="calendar-note">Create/invite users from Supabase Authentication → Users. Change their application role and disable access here.</div></div></div>
      <div class="desktop-table table-wrap"><table class="data-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th><th></th></tr></thead><tbody>${profiles.map(p=>`<tr><td><strong>${esc(p.full_name||"—")}</strong></td><td>${esc(p.email||"—")}</td><td><select class="role-select" data-id="${p.id}" ${p.id===currentUser.id?"":" "}>${Object.entries(ROLE_LABEL).map(([v,l])=>`<option value="${v}" ${p.role===v?"selected":""}>${l}</option>`).join("")}</select></td><td><span class="badge ${p.active?"badge-active":"badge-disabled"}">${p.active?"Active":"Disabled"}</span></td><td>${dateFmt(p.created_at)}</td><td>${p.id!==currentUser.id?`<button class="btn btn-ghost toggle-user" data-id="${p.id}" data-active="${p.active}">${p.active?"Disable":"Enable"}</button>`:"Current user"}</td></tr>`).join("")}</tbody></table></div></section>`;
      document.querySelectorAll(".role-select").forEach(el=>el.onchange=async()=>{const {error}=await supabase.from("profiles").update({role:el.value,updated_at:nowISO()}).eq("id",el.dataset.id); if(error){showToast(`Role update failed: ${error.message}`,"error");return;} showToast("Role updated.");});
      document.querySelectorAll(".toggle-user").forEach(el=>el.onclick=async()=>{const active=el.dataset.active==="true"; const ok=await confirmDelete(`This will ${active?"disable":"enable"} this user's application access.`,"CONFIRM"); if(!ok)return; const {error}=await supabase.from("profiles").update({active:!active,updated_at:nowISO()}).eq("id",el.dataset.id); if(error){showToast(`Could not update user: ${error.message}`,"error");return;} renderAdmin();});
    }catch(e){handleError(e,"Admin could not load.");}
  }

  function openActions(type,id){
    const record=currentRecords.find(x=>x.id===id);
    if(!record)return;
    const actions=[];
    if(canEditRecord(type)) actions.push(`<button class="btn btn-secondary" id="action-edit">Edit</button>`);
    if(type==="bills" && canFinance() && record.status!=="inactive") actions.push(`<button class="btn btn-primary" id="action-pay">Pay Bill</button>`);
    if(type==="recurring_tasks" && canEditRecord(type)) actions.push(`<button class="btn btn-primary" id="action-complete">Complete</button>`);
    if(canDelete()) actions.push(`<button class="btn btn-danger" id="action-delete">Delete</button>`);
    openModal("Actions",`<div class="list">${actions.length?actions.join(""):`<div class="empty">No actions available for your role.</div>`}</div>`);
    if($("action-edit")) $("action-edit").onclick=()=>{closeModal(); type==="issues"?openIssueModal(id):type==="recurring_tasks"?openRecurringModal(id):type==="bills"?openBillModal(id):openExpenseModal(id);};
    if($("action-delete")) $("action-delete").onclick=async()=>{closeModal();if(await confirmDelete(`Delete this ${type.replace("_"," ")} permanently?`,"DELETE"))await deleteRecord(type,id);};
    if($("action-pay")) $("action-pay").onclick=()=>{closeModal();openPayBillModal(record);};
    if($("action-complete")) $("action-complete").onclick=()=>{closeModal();openCompleteRecurringModal(record);};
  }

  async function deleteRecord(type,id){
    const {error}=await supabase.from(type).delete().eq("id",id);
    if(error){showToast(`Delete failed: ${error.message}`,"error");return;}
    showToast("Deleted."); renderSection();
  }

  function confirmDelete(message,word="DELETE"){
    return new Promise(resolve=>{
      openModal("Confirm deletion",`<div class="danger-box">${esc(message)}<br><br>Type <strong>${esc(word)}</strong> to continue.</div><div class="field" style="margin-top:14px"><label>Confirmation<input id="delete-word" autocomplete="off"></label></div><div class="modal-actions"><button class="btn btn-ghost" id="cancel-delete">Cancel</button><button class="btn btn-danger" id="confirm-delete">Confirm</button></div>`);
      $("cancel-delete").onclick=()=>{closeModal();resolve(false);};
      $("confirm-delete").onclick=()=>{const ok=$("delete-word").value===word; if(!ok)return showToast(`Please type ${word} exactly.`,"error"); closeModal();resolve(true);};
    });
  }

  async function openIssueModal(id=null){
    let r=id?currentRecords.find(x=>x.id===id):null;
    const users = await queryTable("profiles","id,full_name,role,active");
    const assigned = new Set((r?.issue_assignments||[]).map(x=>x.user_id));
    openModal(r?"Edit maintenance":"Report maintenance",`
      <form id="record-form" class="modal-form">
        <div class="form-columns">
          <div class="field"><label>Title<input id="f-title" required value="${esc(r?.title)}"></label></div>
          <div class="field"><label>Category<select id="f-category">${["Pool","Garden","Electrical","Plumbing","Air Conditioning","Building","Security","Cleaning","Furniture","Appliances","Other"].map(x=>`<option ${r?.category===x?"selected":""}>${x}</option>`).join("")}</select></label></div>
          <div class="field"><label>Priority<select id="f-priority">${["urgent","high","normal","low"].map(x=>`<option ${r?.priority===x?"selected":""}>${x}</option>`).join("")}</select></label></div>
          <div class="field"><label>Status<select id="f-status">${["open","in_progress","waiting","completed"].map(x=>`<option ${r?.status===x?"selected":""}>${x.replace("_"," ")}</option>`).join("")}</select></label></div>
          <div class="field"><label>Due date<input id="f-due" type="date" min="${new Date().toISOString().slice(0,10)}" value="${r?.due_date?String(r.due_date).slice(0,10):""}"></label></div>
          <div class="field"><label>Estimated cost<input id="f-estimate" type="number" min="0" step="0.01" value="${r?.estimated_cost??""}"></label></div>
          <div class="field"><label>Actual cost<input id="f-actual" type="number" min="0" step="0.01" value="${r?.actual_cost??""}"></label></div>
          <div class="field"><label>Assigned people<select id="f-assigned" multiple size="4">${users.filter(u=>u.active).map(u=>`<option value="${u.id}" ${assigned.has(u.id)?"selected":""}>${esc(u.full_name||u.id)} — ${esc(ROLE_LABEL[u.role]||u.role)}</option>`).join("")}</select></label></div>
          <div class="field full"><label>Description<textarea id="f-description">${esc(r?.description)}</textarea></label></div>
          <div class="field full"><label>Notes<textarea id="f-notes">${esc(r?.notes)}</textarea></label></div>
          <div class="field full"><label>Photos / documents<input id="f-files" class="file-input" type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" multiple><span class="calendar-note">JPG, JPEG, PNG, WEBP or PDF. Maximum 10 MB per file.</span></label></div>
        </div>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" id="cancel-form">Cancel</button><button class="btn btn-primary" type="submit">Save</button></div>
      </form>`);
    $("cancel-form").onclick=closeModal;
    $("record-form").onsubmit=async e=>{
      e.preventDefault();
      const due=$("f-due").value;
      if(due && due < new Date().toISOString().slice(0,10) && !r) return showToast("Due date cannot be in the past.","error");
      const payload={title:$("f-title").value.trim(),description:$("f-description").value.trim(),category:$("f-category").value,priority:$("f-priority").value,status:$("f-status").value,due_date:due||null,estimated_cost:numOrNull($("f-estimate").value),actual_cost:numOrNull($("f-actual").value),notes:$("f-notes").value.trim(),updated_at:nowISO()};
      if(!payload.title)return showToast("Title is required.","error");
      let issueId=id;
      if(id){const {error}=await supabase.from("issues").update(payload).eq("id",id);if(error)return showToast(`Save failed: ${error.message}`,"error");}
      else{payload.created_by=currentUser.id;const {data,error}=await supabase.from("issues").insert(payload).select("id").single();if(error)return showToast(`Create failed: ${error.message}`,"error");issueId=data.id;}
      const selected=[...$("f-assigned").selectedOptions].map(o=>o.value);
      if(id) await supabase.from("issue_assignments").delete().eq("issue_id",issueId);
      if(selected.length){const {error}=await supabase.from("issue_assignments").insert(selected.map(user_id=>({issue_id:issueId,user_id})));if(error)return showToast(`Assignment failed: ${error.message}`,"error");}
      await uploadFiles("issue",issueId,$("f-files").files);
      closeModal();showToast(id?"Maintenance updated.":"Maintenance created.");renderMaintenance();
    };
  }

  function numOrNull(v){return v===""?null:Number(v)}

  async function openRecurringModal(id=null){
    const r=id?currentRecords.find(x=>x.id===id):null;
    openModal(r?"Edit recurring task":"Add recurring task",`
      <form id="record-form" class="modal-form"><div class="form-columns">
      <div class="field"><label>Task name<input id="f-name" required value="${esc(r?.task_name)}"></label></div>
      <div class="field"><label>Category<select id="f-category">${["Pool","Garden","Electrical","Plumbing","Air Conditioning","Building","Security","Cleaning","Furniture","Appliances","Other"].map(x=>`<option ${r?.category===x?"selected":""}>${x}</option>`).join("")}</select></label></div>
      <div class="field"><label>Frequency<select id="f-frequency">${["weekly","twice_monthly","monthly","quarterly","half_yearly","yearly"].map(x=>`<option ${r?.frequency===x?"selected":""}>${x.replace("_"," ")}</option>`).join("")}</select></label></div>
      <div class="field"><label>Next due<input id="f-next" type="date" value="${r?.next_due?String(r.next_due).slice(0,10):""}"></label></div>
      <div class="field"><label>Expected cost<input id="f-cost" type="number" min="0" step="0.01" value="${r?.expected_cost??""}"></label></div>
      <div class="field"><label>Last actual cost<input id="f-lastcost" type="number" min="0" step="0.01" value="${r?.last_actual_cost??""}"></label></div>
      <div class="field full"><label>Description<textarea id="f-description">${esc(r?.description)}</textarea></label></div>
      <div class="field full"><label>Notes<textarea id="f-notes">${esc(r?.notes)}</textarea></label></div>
      <div class="field full"><label>Photos / documents<input id="f-files" class="file-input" type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" multiple></label></div>
      </div><div class="modal-actions"><button type="button" class="btn btn-ghost" id="cancel-form">Cancel</button><button class="btn btn-primary">Save</button></div></form>`);
    $("cancel-form").onclick=closeModal;
    $("record-form").onsubmit=async e=>{e.preventDefault();const payload={task_name:$("f-name").value.trim(),category:$("f-category").value,frequency:$("f-frequency").value,next_due:$("f-next").value||null,expected_cost:numOrNull($("f-cost").value),last_actual_cost:numOrNull($("f-lastcost").value),description:$("f-description").value.trim(),notes:$("f-notes").value.trim(),updated_at:nowISO()};if(!payload.task_name)return showToast("Task name is required.","error");let taskId=id;if(id){const {error}=await supabase.from("recurring_tasks").update(payload).eq("id",id);if(error)return showToast(`Save failed: ${error.message}`,"error");}else{payload.created_by=currentUser.id;const {data,error}=await supabase.from("recurring_tasks").insert(payload).select("id").single();if(error)return showToast(`Create failed: ${error.message}`,"error");taskId=data.id;}await uploadFiles("recurring_task",taskId,$("f-files").files);closeModal();showToast(id?"Recurring task updated.":"Recurring task created.");renderRecurring();};
  }

  async function openCompleteRecurringModal(r){
    openModal("Complete recurring task",`<form id="complete-form" class="modal-form"><div class="notice">Completion will record today's date, store the actual cost, calculate the next due date, and create an expense automatically.</div><div class="form-columns"><div class="field"><label>Actual cost<input id="complete-cost" type="number" min="0" step="0.01" value="${r.expected_cost??""}"></label></div><div class="field"><label>Completion date<input id="complete-date" type="date" value="${new Date().toISOString().slice(0,10)}"></label></div></div><div class="modal-actions"><button type="button" class="btn btn-ghost" id="cancel-form">Cancel</button><button class="btn btn-primary">Complete</button></div></form>`);
    $("cancel-form").onclick=closeModal;
    $("complete-form").onsubmit=async e=>{e.preventDefault();const date=$("complete-date").value,cost=Number($("complete-cost").value||0);const next=nextDue(date,r.frequency);const {error}=await supabase.from("recurring_tasks").update({last_completed:date,last_actual_cost:cost,next_due:next,updated_at:nowISO()}).eq("id",r.id);if(error)return showToast(`Completion failed: ${error.message}`,"error");const {error:ee}=await supabase.from("expenses").insert({date,description:`${r.task_name} — recurring task`,category:r.category,amount:cost,source_type:"recurring_task",source_id:r.id,created_by:currentUser.id,notes:"Automatically created when recurring task was completed."});if(ee)return showToast(`Task completed, but expense creation failed: ${ee.message}`,"error");closeModal();showToast("Task completed and expense created.");renderRecurring();};
  }

  function nextDue(date,freq){const d=new Date(date+"T12:00:00");if(freq==="weekly")d.setDate(d.getDate()+7);else if(freq==="twice_monthly")d.setDate(d.getDate()+15);else if(freq==="monthly")d.setMonth(d.getMonth()+1);else if(freq==="quarterly")d.setMonth(d.getMonth()+3);else if(freq==="half_yearly")d.setMonth(d.getMonth()+6);else d.setFullYear(d.getFullYear()+1);return d.toISOString().slice(0,10)}

  async function openBillModal(id=null){
    const r=id?currentRecords.find(x=>x.id===id):null;
    openModal(r?"Edit bill":"Add bill",`<form id="record-form" class="modal-form"><div class="form-columns">
      <div class="field"><label>Bill name<input id="f-name" required value="${esc(r?.bill_name)}"></label></div>
      <div class="field"><label>Category<select id="f-category">${["Electricity","Water","Property tax","Insurance","Internet","Gas","Waste","Other"].map(x=>`<option ${r?.category===x?"selected":""}>${x}</option>`).join("")}</select></label></div>
      <div class="field"><label>Frequency<select id="f-frequency">${["monthly","quarterly","yearly","other"].map(x=>`<option ${r?.frequency===x?"selected":""}>${x}</option>`).join("")}</select></label></div>
      <div class="field"><label>Expected amount<input id="f-amount" type="number" min="0" step="0.01" value="${r?.expected_amount??""}"></label></div>
      <div class="field"><label>Next due<input id="f-next" type="date" min="${new Date().toISOString().slice(0,10)}" value="${r?.next_due?String(r.next_due).slice(0,10):""}"></label></div>
      <div class="field"><label>Status<select id="f-status"><option ${r?.status!=="inactive"?"selected":""}>active</option><option ${r?.status==="inactive"?"selected":""}>inactive</option></select></label></div>
      <div class="field full"><label>Notes<textarea id="f-notes">${esc(r?.notes)}</textarea></label></div>
      <div class="field full"><label>Bill documents<input id="f-files" class="file-input" type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" multiple></label></div>
      </div><div class="modal-actions"><button type="button" class="btn btn-ghost" id="cancel-form">Cancel</button><button class="btn btn-primary">Save</button></div></form>`);
    $("cancel-form").onclick=closeModal;
    $("record-form").onsubmit=async e=>{e.preventDefault();const due=$("f-next").value;if(due && due<new Date().toISOString().slice(0,10) && !r)return showToast("Next due date cannot be in the past.","error");const payload={bill_name:$("f-name").value.trim(),category:$("f-category").value,frequency:$("f-frequency").value,expected_amount:numOrNull($("f-amount").value),next_due:due||null,status:$("f-status").value,notes:$("f-notes").value.trim(),updated_at:nowISO()};if(!payload.bill_name)return showToast("Bill name is required.","error");let billId=id;if(id){const {error}=await supabase.from("bills").update(payload).eq("id",id);if(error)return showToast(`Save failed: ${error.message}`,"error");}else{payload.created_by=currentUser.id;const {data,error}=await supabase.from("bills").insert(payload).select("id").single();if(error)return showToast(`Create failed: ${error.message}`,"error");billId=data.id;}await uploadFiles("bill",billId,$("f-files").files);closeModal();showToast(id?"Bill updated.":"Bill created.");renderBills();};
  }

  function openPayBillModal(r){
    openModal("Pay bill",`<form id="pay-form" class="modal-form"><div class="notice">Paying this bill creates an expense and advances the next due date according to its frequency.</div><div class="form-columns"><div class="field"><label>Actual amount paid<input id="pay-amount" type="number" min="0" step="0.01" value="${r.expected_amount??""}" required></label></div><div class="field"><label>Payment date<input id="pay-date" type="date" value="${new Date().toISOString().slice(0,10)}" required></label></div></div><div class="field"><label>Notes<textarea id="pay-notes"></textarea></label></div><div class="modal-actions"><button type="button" class="btn btn-ghost" id="cancel-form">Cancel</button><button class="btn btn-primary">Pay Bill</button></div></form>`);
    $("cancel-form").onclick=closeModal;
    $("pay-form").onsubmit=async e=>{e.preventDefault();const date=$("pay-date").value,amount=Number($("pay-amount").value);const next=nextBillDue(date,r.frequency);const {error}=await supabase.from("bills").update({last_paid:date,last_paid_amount:amount,next_due:next,updated_at:nowISO()}).eq("id",r.id);if(error)return showToast(`Payment update failed: ${error.message}`,"error");const {error:ee}=await supabase.from("expenses").insert({date,description:`${r.bill_name} — bill`,category:r.category,amount,source_type:"bill",source_id:r.id,created_by:currentUser.id,notes:$("pay-notes").value.trim()});if(ee)return showToast(`Bill updated, but expense creation failed: ${ee.message}`,"error");closeModal();showToast("Bill paid and expense recorded.");renderBills();};
  }
  function nextBillDue(date,freq){const d=new Date(date+"T12:00:00");if(freq==="monthly")d.setMonth(d.getMonth()+1);else if(freq==="quarterly")d.setMonth(d.getMonth()+3);else if(freq==="yearly")d.setFullYear(d.getFullYear()+1);else d.setMonth(d.getMonth()+1);return d.toISOString().slice(0,10)}

  async function openExpenseModal(id=null){
    const r=id?currentRecords.find(x=>x.id===id):null;
    openModal(r?"Edit expense":"Add expense",`<form id="record-form" class="modal-form"><div class="form-columns">
      <div class="field"><label>Date<input id="f-date" type="date" required value="${r?.date?String(r.date).slice(0,10):new Date().toISOString().slice(0,10)}"></label></div>
      <div class="field"><label>Amount<input id="f-amount" type="number" min="0" step="0.01" required value="${r?.amount??""}"></label></div>
      <div class="field"><label>Description<input id="f-description" required value="${esc(r?.description)}"></label></div>
      <div class="field"><label>Category<input id="f-category" value="${esc(r?.category)}"></label></div>
      <div class="field"><label>Source<select id="f-source"><option value="manual">manual</option><option value="maintenance">maintenance</option><option value="recurring_task">recurring task</option><option value="bill">bill</option></select></label></div>
      <div class="field full"><label>Notes<textarea id="f-notes">${esc(r?.notes)}</textarea></label></div>
      <div class="field full"><label>Receipt / document<input id="f-files" class="file-input" type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" multiple></label></div>
      </div><div class="modal-actions"><button type="button" class="btn btn-ghost" id="cancel-form">Cancel</button><button class="btn btn-primary">Save</button></div></form>`);
    if(r)$("f-source").value=r.source_type||"manual";
    $("cancel-form").onclick=closeModal;
    $("record-form").onsubmit=async e=>{e.preventDefault();const payload={date:$("f-date").value,amount:Number($("f-amount").value),description:$("f-description").value.trim(),category:$("f-category").value.trim()||"Other",source_type:$("f-source").value,notes:$("f-notes").value.trim(),updated_at:nowISO()};if(!payload.description||!payload.amount)return showToast("Description and amount are required.","error");let expenseId=id;if(id){const {error}=await supabase.from("expenses").update(payload).eq("id",id);if(error)return showToast(`Save failed: ${error.message}`,"error");}else{payload.created_by=currentUser.id;const {data,error}=await supabase.from("expenses").insert(payload).select("id").single();if(error)return showToast(`Create failed: ${error.message}`,"error");expenseId=data.id;}await uploadFiles("expense",expenseId,$("f-files").files);closeModal();showToast(id?"Expense updated.":"Expense created.");renderExpenses();};
  }

  async function uploadFiles(recordType,recordId,fileList){
    const files=[...(fileList||[])]; for(const file of files){
      if(file.size>10*1024*1024){showToast(`${file.name} is larger than 10 MB and was skipped.`,"error");continue;}
      const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
      const path=`${currentUser.id}/${recordType}/${recordId}/${crypto.randomUUID()}-${safe}`;
      const {error}=await supabase.storage.from("property-attachments").upload(path,file,{upsert:false});
      if(error){showToast(`Unable to upload ${file.name}: ${error.message}`,"error");continue;}
      const {error:dbError}=await supabase.from("attachments").insert({record_type:recordType,record_id:recordId,storage_path:path,original_filename:file.name,mime_type:file.type||"application/octet-stream",file_size:file.size,uploaded_by:currentUser.id});
      if(dbError){showToast(`File uploaded but metadata save failed for ${file.name}: ${dbError.message}`,"error");}
    }
  }

  async function openAttachmentList(type,id){
    const {data,error}=await supabase.from("attachments").select("*").eq("record_type",type).eq("record_id",id).order("created_at",{ascending:false});
    if(error)return showToast(`Attachments could not load: ${error.message}`,"error");
    const html=data.length?`<div class="attachments">${data.map(a=>`<div class="attachment"><div class="attachment-info"><strong>${esc(a.original_filename)}</strong><br>${Math.round(a.file_size/1024)} KB</div></div>`).join("")}</div>`:`<div class="empty">No attachments.</div>`;
    openModal("Attachments",html);
  }

  function openModal(title,body){
    modalRoot.innerHTML=`<div class="modal-backdrop" id="modal-backdrop"><div class="modal"><div class="modal-header"><h2>${esc(title)}</h2><button class="icon-btn" id="modal-close" aria-label="Close">×</button></div>${body}</div></div>`;
    $("modal-close").onclick=closeModal;
    $("modal-backdrop").onclick=e=>{if(e.target.id==="modal-backdrop")closeModal()};
  }
  function closeModal(){modalRoot.innerHTML=""}

  function handleError(e,prefix){console.error(prefix,e);showToast(`${prefix} ${e?.message||"Check your connection and try again."}`,"error");}

  document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal()});
  init();
})();
