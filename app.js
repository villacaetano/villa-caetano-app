const sb = window.supabaseClient;
let session = null, profile = null, issues = [], recurring = [], bills = [], expenses = [], profiles = [];
let loginBusy = false;
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const money = n => `₹${Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:2})}`;
const today = () => new Date().toISOString().slice(0,10);
const admin = () => ['owner','property manager'].includes((profile?.role||'').toLowerCase());
function toast(m){ $('toast').textContent=m; $('toast').classList.add('show'); setTimeout(()=> $('toast').classList.remove('show'),2800); }
function error(m){ console.error(m); toast(typeof m==='string'?m:(m?.message||'Something went wrong')); }
function setAdminUI(){ document.querySelectorAll('.admin-only').forEach(el=>el.classList.toggle('hidden',!admin())); $('roleBadge').textContent=profile?.role||'reporter'; }
function showTab(name){ document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===name)); document.querySelectorAll('.tab-panel').forEach(p=>p.classList.add('hidden')); $(`${name}Tab`).classList.remove('hidden'); if(name==='dashboard') renderDashboard(); if(name==='issues') renderIssues(); if(name==='recurring') renderRecurring(); if(name==='bills') renderBills(); if(name==='expenses') renderExpenses(); if(name==='admin') renderUsers(); }

document.addEventListener('click', e=>{
  const tab=e.target.closest('.tab'); if(tab){ showTab(tab.dataset.tab); return; }
  const go=e.target.closest('[data-go]'); if(go) showTab(go.dataset.go);
});

async function boot(){
  if(!sb){ $('loginError').textContent='Supabase could not be initialized. Check supabase.js.'; return; }
  const {data:{session:s},error:e}=await sb.auth.getSession();
  if(e){ console.error(e); $('loginError').textContent=e.message; }
  await handleSession(s);
  sb.auth.onAuthStateChange(async (_e,s)=>{ await handleSession(s); });
}
async function handleSession(s){
  session=s;
  if(!s){ $('loginScreen').classList.remove('hidden'); $('app').classList.add('hidden'); return; }
  $('loginScreen').classList.add('hidden'); $('app').classList.remove('hidden');
  $('userName').textContent=s.user.user_metadata?.full_name||s.user.user_metadata?.name||s.user.email||'';
  await loadProfile(); setAdminUI(); await loadAll(); showTab('dashboard');
}
async function loadProfile(){
  let {data,error:e}=await sb.from('profiles').select('*').eq('id',session.user.id).single();
  if(e){ error(e); return; } profile=data;
}
async function loadAll(){
  const results=await Promise.all([
    sb.from('issues').select('*').order('created_at',{ascending:false}),
    sb.from('recurring_tasks').select('*').order('next_due'),
    sb.from('bills').select('*').order('next_due'),
    sb.from('expenses').select('*').order('expense_date',{ascending:false})
  ]);
  if(results.some(r=>r.error)) results.forEach(r=>r.error&&console.error(r.error));
  issues=results[0].data||[]; recurring=results[1].data||[]; bills=results[2].data||[]; expenses=results[3].data||[];
}

$('loginBtn').onclick=async()=>{
  if(loginBusy || !sb) return;
  loginBusy=true;
  const btn=$('loginBtn');
  const original=btn.textContent;
  btn.disabled=true;
  btn.textContent='Connecting to Google…';
  $('loginError').textContent='';
  try{
    const redirectTo=location.origin+location.pathname;
    const {error:e}=await sb.auth.signInWithOAuth({provider:'google',options:{redirectTo}});
    if(e) throw e;
  }catch(e){
    console.error('Google sign-in error:',e);
    $('loginError').textContent=e?.message||'Unable to start Google sign-in.';
    btn.disabled=false;
    btn.textContent=original;
    loginBusy=false;
  }
};
$('logoutBtn').onclick=()=>sb.auth.signOut();
$('quickAction').onclick=()=>openIssueModal();
$('issueSearch').oninput=renderIssues; $('issueStatusFilter').onchange=renderIssues; $('issuePriorityFilter').onchange=renderIssues;
$('addRecurringBtn').onclick=()=>openRecurringModal(); $('addBillBtn').onclick=()=>openBillModal(); $('addExpenseBtn').onclick=()=>openExpenseModal();
$('closeModal').onclick=closeModal; $('modal').onclick=e=>{if(e.target.id==='modal')closeModal();};

function openModal(title,html,submit){ $('modalTitle').textContent=title; $('modalBody').innerHTML=html; $('modal').classList.remove('hidden'); const f=$('modalBody').querySelector('form'); if(f) f.onsubmit=e=>{e.preventDefault();submit(new FormData(f));}; }
function closeModal(){ $('modal').classList.add('hidden'); $('modalBody').innerHTML=''; }
function fileField(label='Photo / bill attachment',multiple=true){ return `<label>${label}<input type="file" name="files" accept="image/*,.pdf" ${multiple?'multiple':''}></label>`; }

function openIssueModal(issue=null){
 const edit=!!issue; openModal(edit?'Edit issue':'Report maintenance issue',`<form>
 <label>Issue title<input name="title" required value="${esc(issue?.title)}" placeholder="e.g. Pool pump making noise"></label>
 <label>Category<select name="category" required>${['Pool','Garden','Electrical','Plumbing','Air Conditioning','Building','Security','Cleaning','Furniture','Appliances','Other'].map(x=>`<option ${issue?.category===x?'selected':''}>${x}</option>`).join('')}</select></label>
 <div class="grid2"><label>Priority<select name="priority">${['Normal','Low','High','Urgent'].map(x=>`<option ${issue?.priority===x?'selected':''}>${x}</option>`).join('')}</select></label><label>Due date<input type="date" name="due_date" min="${today()}" value="${esc(issue?.due_date)}"></label></div>
 <label>Assigned to<input name="assigned_to" value="${esc(issue?.assigned_to)}" placeholder="Caretaker / Contractor / etc."></label>
 <label>Cost<input type="number" min="0" step="0.01" name="cost" value="${issue?.cost||0}"></label>
 <label>Description<textarea name="description" rows="4" placeholder="Describe the problem...">${esc(issue?.description)}</textarea></label>
 ${fileField('Issue photos / documents',true)}
 <div class="form-actions"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button class="primary">${edit?'Save changes':'Report issue'}</button></div></form>`,async fd=>{
  const payload={title:fd.get('title').trim(),category:fd.get('category'),priority:fd.get('priority'),due_date:fd.get('due_date')||null,assigned_to:fd.get('assigned_to')?.trim()||null,cost:Number(fd.get('cost'))||0,description:fd.get('description')?.trim()||null};
  let res=edit?await sb.from('issues').update(payload).eq('id',issue.id):await sb.from('issues').insert({...payload,created_by:session.user.id}).select().single(); if(res.error){error(res.error);return;}
  const id=edit?issue.id:res.data?.id; await uploadFiles(fd.getAll('files'), 'issue', id); closeModal(); await loadAll(); renderIssues(); renderDashboard(); toast(edit?'Issue updated':'Issue reported');
 });
}

function issueCard(i){
 const done=i.status==='Completed'; return `<div class="item ${done?'done':''}"><div class="item-main"><div class="item-title">${done?'✓ ':''}${esc(i.title)}</div><div class="item-desc">${esc(i.description||'No description')}</div><div class="chips"><span>${esc(i.category)}</span><span class="p-${esc(i.priority)}">${esc(i.priority)}</span><span>${esc(i.status)}</span>${i.assigned_to?`<span>👤 ${esc(i.assigned_to)}</span>`:''}${i.due_date?`<span>📅 ${esc(i.due_date)}</span>`:''}${i.cost?`<span>${money(i.cost)}</span>`:''}</div></div><div class="item-actions"><button class="secondary" onclick='openIssueModal(${JSON.stringify(i).replace(/'/g,"&#39;")})'>Edit</button>${admin()?`<button class="danger" onclick="deleteIssue('${i.id}')">•••</button>`:`<button class="secondary" onclick="completeIssue('${i.id}')">${done?'Done':'Complete'}</button>`}</div></div>`;
}
function renderIssues(){ const q=$('issueSearch').value.toLowerCase(),s=$('issueStatusFilter').value,p=$('issuePriorityFilter').value; const f=issues.filter(i=>(!q||[i.title,i.description,i.category,i.assigned_to].some(x=>String(x||'').toLowerCase().includes(q)))&&(s==='all'||i.status===s)&&(p==='all'||i.priority===p)); $('issueCount').textContent=`${f.length} issue${f.length===1?'':'s'}`; $('issuesList').innerHTML=f.length?f.map(issueCard).join(''):`<div class="empty">No maintenance issues found.</div>`; }
async function completeIssue(id){ if(!confirm('Mark this issue completed?'))return; const {error:e}=await sb.from('issues').update({status:'Completed',completed_at:new Date().toISOString()}).eq('id',id); if(e)error(e); else {await loadAll();renderIssues();renderDashboard();}}
async function deleteIssue(id){ const word=prompt('To permanently delete this issue, type DELETE'); if(word!=='DELETE')return; const {data:atts}=await sb.from('attachments').select('storage_path').eq('entity_type','issue').eq('entity_id',id); if(atts?.length)await sb.storage.from('property-files').remove(atts.map(a=>a.storage_path)); await sb.from('attachments').delete().eq('entity_type','issue').eq('entity_id',id); const {error:e}=await sb.from('issues').delete().eq('id',id); if(e)error(e); else {await loadAll();renderIssues();renderDashboard();toast('Issue deleted');}}

function openRecurringModal(task=null){ const edit=!!task; openModal(edit?'Edit recurring task':'Add recurring task',`<form><label>Task<input name="title" required value="${esc(task?.title)}" placeholder="Pool cleaning"></label><div class="grid2"><label>Category<input name="category" required value="${esc(task?.category)}" placeholder="Pool"></label><label>Frequency<select name="frequency">${[['weekly','Weekly'],['twice_monthly','Twice a month'],['monthly','Monthly'],['quarterly','Quarterly'],['half_yearly','Half yearly'],['yearly','Yearly']].map(([v,l])=>`<option value="${v}" ${task?.frequency===v?'selected':''}>${l}</option>`).join('')}</select></label></div><div class="grid2"><label>Next due<input type="date" name="next_due" min="${today()}" required value="${esc(task?.next_due||today())}"></label><label>Expected cost<input type="number" name="expected_cost" min="0" step="0.01" value="${task?.expected_cost||0}"></label></div><label>Assigned to<input name="assigned_to" value="${esc(task?.assigned_to)}"></label><label>Notes<textarea name="notes">${esc(task?.notes)}</textarea></label>${fileField('Task proof / documents',true)}<div class="form-actions"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button class="primary">Save</button></div></form>`,async fd=>{const p={title:fd.get('title').trim(),category:fd.get('category').trim(),frequency:fd.get('frequency'),next_due:fd.get('next_due'),expected_cost:Number(fd.get('expected_cost'))||0,assigned_to:fd.get('assigned_to')?.trim()||null,notes:fd.get('notes')?.trim()||null};const r=edit?await sb.from('recurring_tasks').update(p).eq('id',task.id):await sb.from('recurring_tasks').insert({...p,created_by:session.user.id}).select().single();if(r.error){error(r.error);return;}await uploadFiles(fd.getAll('files'),'recurring_task',edit?task.id:r.data.id);closeModal();await loadAll();renderRecurring();renderDashboard();toast('Recurring task saved');});}
function renderRecurring(){ $('recurringList').innerHTML=recurring.length?recurring.map(t=>`<div class="item"><div class="item-main"><div class="item-title">${esc(t.title)}</div><div class="item-desc">${esc(t.category)} · ${esc(t.frequency.replace('_',' '))} · next ${esc(t.next_due)} · ${money(t.expected_cost)}</div>${t.last_completed?`<div class="muted">Last completed ${t.last_completed}${t.last_cost!=null?` · actual ${money(t.last_cost)}`:''}</div>`:''}</div><div class="item-actions"><button class="primary" onclick="completeRecurring('${t.id}')">Complete</button><button class="secondary" onclick='openRecurringModal(${JSON.stringify(t)})'>Edit</button></div></div>`).join(''):`<div class="empty">No recurring tasks yet.</div>`; }
function nextDate(date,freq){const d=new Date(date+'T12:00:00'); if(freq==='weekly')d.setDate(d.getDate()+7); else if(freq==='twice_monthly')d.setDate(d.getDate()+15); else if(freq==='monthly')d.setMonth(d.getMonth()+1); else if(freq==='quarterly')d.setMonth(d.getMonth()+3); else if(freq==='half_yearly')d.setMonth(d.getMonth()+6); else d.setFullYear(d.getFullYear()+1); return d.toISOString().slice(0,10);}
async function completeRecurring(id){const t=recurring.find(x=>x.id===id);const actual=prompt(`Actual cost for ${t.title}`,String(t.expected_cost||0));if(actual===null)return;const amount=Number(actual)||0;const done=t.next_due;const n=nextDate(done,t.frequency);let r=await sb.from('recurring_tasks').update({last_completed:done,last_cost:amount,next_due:n}).eq('id',id);if(r.error){error(r.error);return;}r=await sb.from('expenses').insert({expense_date:today(),description:t.title,category:t.category,amount,source_type:'recurring_task',source_id:id,created_by:session.user.id});if(r.error)error(r.error);await loadAll();renderRecurring();renderDashboard();toast('Task completed and expense recorded');}

function openBillModal(bill=null){const edit=!!bill;openModal(edit?'Edit bill':'Add bill',`<form><label>Bill name<input name="name" required value="${esc(bill?.name)}" placeholder="Electricity"></label><div class="grid2"><label>Category<select name="category">${['Electricity','Water','Internet','Property tax','Insurance','Gas','Waste','Other'].map(x=>`<option ${bill?.category===x?'selected':''}>${x}</option>`).join('')}</select></label><label>Frequency<select name="frequency">${['monthly','quarterly','yearly','other'].map(x=>`<option ${bill?.frequency===x?'selected':''}>${x}</option>`).join('')}</select></label></div><div class="grid2"><label>Next due<input type="date" name="next_due" min="${today()}" required value="${esc(bill?.next_due||today())}"></label><label>Expected amount<input type="number" name="expected_amount" min="0" step="0.01" value="${bill?.expected_amount||0}"></label></div><label>Notes<textarea name="notes">${esc(bill?.notes)}</textarea></label>${fileField('Bill / receipt',true)}<div class="form-actions"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button class="primary">Save</button></div></form>`,async fd=>{const p={name:fd.get('name').trim(),category:fd.get('category'),frequency:fd.get('frequency'),next_due:fd.get('next_due'),expected_amount:Number(fd.get('expected_amount'))||0,notes:fd.get('notes')?.trim()||null};const r=edit?await sb.from('bills').update(p).eq('id',bill.id):await sb.from('bills').insert({...p,created_by:session.user.id}).select().single();if(r.error){error(r.error);return;}await uploadFiles(fd.getAll('files'),'bill',edit?bill.id:r.data.id);closeModal();await loadAll();renderBills();renderDashboard();toast('Bill saved');});}
function renderBills(){ $('billsList').innerHTML=bills.length?bills.map(b=>`<div class="item"><div class="item-main"><div class="item-title">${esc(b.name)}</div><div class="item-desc">${esc(b.category)} · ${esc(b.frequency)} · next ${esc(b.next_due)} · ${money(b.expected_amount)}</div></div><div class="item-actions"><button class="primary" onclick="payBill('${b.id}')">Mark paid</button><button class="secondary" onclick='openBillModal(${JSON.stringify(b)})'>Edit</button></div></div>`).join(''):`<div class="empty">No bills yet.</div>`; }
function billNext(date,freq){if(freq==='other')return date;return nextDate(date,freq==='monthly'?'monthly':freq==='quarterly'?'quarterly':'yearly');}
async function payBill(id){const b=bills.find(x=>x.id===id);const amount=prompt(`Amount paid for ${b.name}`,String(b.expected_amount||0));if(amount===null)return;const n=billNext(b.next_due,b.frequency);let r=await sb.from('expenses').insert({expense_date:today(),description:b.name,category:b.category,amount:Number(amount)||0,source_type:'bill',source_id:id,created_by:session.user.id});if(r.error){error(r.error);return;}r=await sb.from('bills').update({next_due:n}).eq('id',id);if(r.error)error(r.error);await loadAll();renderBills();renderDashboard();toast('Bill paid and expense recorded');}

function openExpenseModal(){openModal('Add one-off expense',`<form><label>Description<input name="description" required placeholder="Plumber visit"></label><div class="grid2"><label>Date<input type="date" name="expense_date" max="${today()}" value="${today()}"></label><label>Amount<input type="number" name="amount" min="0" step="0.01" required></label></div><label>Category<input name="category" required placeholder="Plumbing"></label><label>Notes<textarea name="notes"></textarea></label>${fileField('Receipt / invoice',true)}<div class="form-actions"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button class="primary">Save expense</button></div></form>`,async fd=>{const r=await sb.from('expenses').insert({description:fd.get('description').trim(),expense_date:fd.get('expense_date'),amount:Number(fd.get('amount'))||0,category:fd.get('category').trim(),notes:fd.get('notes')?.trim()||null,source_type:'one_off',created_by:session.user.id}).select().single();if(r.error){error(r.error);return;}await uploadFiles(fd.getAll('files'),'expense',r.data.id);closeModal();await loadAll();renderExpenses();renderDashboard();toast('Expense saved');});}
function renderExpenses(){ $('expensesList').innerHTML=expenses.length?expenses.map(e=>`<div class="item"><div class="item-main"><div class="item-title">${esc(e.description)}</div><div class="item-desc">${esc(e.category)} · ${esc(e.expense_date)} · ${money(e.amount)}</div><div class="muted">${esc(e.source_type)}</div></div><button class="danger" onclick="deleteExpense('${e.id}')">•••</button></div>`).join(''):`<div class="empty">No expenses yet.</div>`; }
async function deleteExpense(id){if(prompt('To permanently delete this expense, type DELETE')!=='DELETE')return;const {error:e}=await sb.from('expenses').delete().eq('id',id);if(e)error(e);else{await loadAll();renderExpenses();renderDashboard();}}

async function uploadFiles(files,type,id){if(!id||!files?.length)return;for(const file of files){if(!file||!file.size)continue;if(file.size>10*1024*1024){toast(`${file.name} is over 10 MB and was skipped`);continue;}const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');const path=`${session.user.id}/${type}/${id}/${crypto.randomUUID()}-${safe}`;const r=await sb.storage.from('property-files').upload(path,file,{contentType:file.type||'application/octet-stream',upsert:false});if(r.error){error(r.error);continue;}const a=await sb.from('attachments').insert({entity_type:type,entity_id:id,storage_path:path,file_name:file.name,mime_type:file.type,file_size:file.size,uploaded_by:session.user.id});if(a.error)error(a.error);}}

async function attachmentsHtml(type,id){const {data}=await sb.from('attachments').select('*').eq('entity_type',type).eq('entity_id',id).order('created_at');if(!data?.length)return '';const rows=await Promise.all(data.map(async a=>{const {data:u}=await sb.storage.from('property-files').createSignedUrl(a.storage_path,3600);return `<a class="file-chip" href="${u?.signedUrl||'#'}" target="_blank">📎 ${esc(a.file_name)}</a>`;}));return `<div class="files">${rows.join('')}</div>`;}

function renderDashboard(){const open=issues.filter(i=>i.status==='Open').length,progress=issues.filter(i=>i.status==='In Progress').length,completed=issues.filter(i=>i.status==='Completed').length,overdue=issues.filter(i=>i.status!=='Completed'&&i.due_date&&i.due_date<today()).length;$('statOpen').textContent=open;$('statProgress').textContent=progress;$('statCompleted').textContent=completed;$('statOverdue').textContent=overdue;const now=new Date(),m=now.getMonth(),y=now.getFullYear();const month=expenses.filter(e=>{const d=new Date(e.expense_date+'T12:00:00');return d.getMonth()===m&&d.getFullYear()===y}).reduce((s,e)=>s+Number(e.amount||0),0);const year=expenses.filter(e=>new Date(e.expense_date+'T12:00:00').getFullYear()===y).reduce((s,e)=>s+Number(e.amount||0),0);const monthlyRecurring=recurring.filter(t=>t.active).reduce((s,t)=>s+Number(t.expected_cost||0)*({'weekly':52/12,'twice_monthly':2,'monthly':1,'quarterly':1/3,'half_yearly':1/6,'yearly':1/12}[t.frequency]||0),0);const monthlyBills=bills.filter(b=>b.active).reduce((s,b)=>s+Number(b.expected_amount||0)*({'monthly':1,'quarterly':1/3,'yearly':1/12}[b.frequency]||0),0);$('monthSpend').textContent=money(month);$('yearSpend').textContent=money(year);$('monthProjection').textContent=money(monthlyRecurring+monthlyBills);$('yearProjection').textContent=money((monthlyRecurring+monthlyBills)*12);$('recentIssues').innerHTML=issues.slice(0,5).map(issueCard).join('')||'<div class="empty">No issues yet.</div>';}

async function renderUsers(){if(!admin())return;const r=await sb.from('profiles').select('*').order('created_at');if(r.error){error(r.error);return;}profiles=r.data||[];$('usersList').innerHTML=profiles.map(p=>`<div class="item"><div class="item-main"><div class="item-title">${esc(p.full_name||p.email)}</div><div class="item-desc">${esc(p.email||'')}</div></div><div class="item-actions"><select onchange="changeRole('${p.id}',this.value)" ${p.id===session.user.id?'disabled':''}>${['owner','property manager','caretaker','contractor','reporter'].map(x=>`<option ${p.role===x?'selected':''}>${x}</option>`).join('')}</select>${p.id!==session.user.id?`<button class="danger" onclick="removeUser('${p.id}')">Remove</button>`:''}</div></div>`).join('');}
async function changeRole(id,role){const r=await sb.from('profiles').update({role}).eq('id',id);if(r.error)error(r.error);else{toast('Role updated');renderUsers();}}
async function removeUser(id){if(prompt('To remove this profile, type REMOVE')!=='REMOVE')return;const r=await sb.from('profiles').delete().eq('id',id);if(r.error)error(r.error);else{toast('User removed from this property');renderUsers();}}

boot();
