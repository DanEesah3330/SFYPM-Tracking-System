/* app.js = the LOGIC. The design is in index.html, the data is in data.js.
   Pattern: a function finds an element by its id and puts data inside it. */

/* ---------- 1. Small helpers ---------- */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = d => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'None';
const now = () => new Date().toISOString();
const setText = (id, v) => { $(id).textContent = v; };
const newest = (a, b) => (b.submitted_at || '').localeCompare(a.submitted_at || '');
const byDue = (a, b) => new Date(a.due_date) - new Date(b.due_date);

// Colours of the status labels
const BADGE = { Pending: 'bg-amber-100 text-amber-800', 'Revision Requested': 'bg-orange-100 text-orange-800', Approved: 'bg-emerald-100 text-emerald-800', Rejected: 'bg-red-100 text-red-800', 'On Track': 'bg-sky-100 text-sky-800', 'Ahead of Schedule': 'bg-emerald-100 text-emerald-800', 'Behind Schedule': 'bg-red-100 text-red-800', Completed: 'bg-emerald-100 text-emerald-800' };
const badgeClass = v => 'px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ' + (BADGE[v] || 'bg-stone-200 text-stone-700');
const badgeHtml = v => `<span class="${badgeClass(v)}">${esc(v)}</span>`;

// Show a small message at the bottom of the screen
function toast(msg, bad) {
  const t = document.createElement('div');
  t.className = 'px-4 py-3 rounded shadow text-sm text-white ' + (bad ? 'bg-red-700' : 'bg-ink');
  t.textContent = msg; $('toast').append(t); setTimeout(() => t.remove(), 3800);
}

// Put rows into a table body. rows = [[cell, cell], [cell, cell]]
function fillTable(id, rows) {
  $(id).innerHTML = rows.length ? rows.map(r => '<tr>' + r.map(c => `<td>${c}</td>`).join('') + '</tr>').join('') : '<tr><td colspan="9" class="text-ink/50">Nothing here yet.</td></tr>';
}

// Copy a <template> from index.html and fill it with data (see the notes above the templates)
function cloneTpl(tplId, data, opts = {}) {
  const n = $(tplId).content.firstElementChild.cloneNode(true);
  n.querySelectorAll('[data-f]').forEach(e => { e.textContent = data[e.dataset.f] ?? ''; });
  n.querySelectorAll('[data-badge]').forEach(e => { e.textContent = data[e.dataset.badge]; e.className = badgeClass(data[e.dataset.badge]); });
  n.querySelectorAll('[data-w]').forEach(e => { e.style.width = data[e.dataset.w] + '%'; });
  n.querySelectorAll('[data-show]').forEach(e => { if (!data[e.dataset.show]) e.remove(); });
  n.querySelectorAll('[data-edit]').forEach(e => { if (!opts.edit) e.remove(); });
  n.querySelectorAll('input[name],textarea[name]').forEach(i => { if (data[i.name] !== undefined) i.value = data[i.name]; });
  const range = n.querySelector('input[type=range]'); if (range) range.nextElementSibling.textContent = range.value + '%';
  n.dataset.id = data.id || '';
  return n;
}
const slot = (node, name) => node.querySelector(`[data-slot=${name}]`);
const lines = (box, items) => { box.innerHTML = ''; items.length ? items.forEach(i => box.append(cloneTpl('tpl-line', i))) : (box.innerHTML = '<p class="text-sm text-ink/50">Nothing here yet.</p>'); };

function notify(userId, message) { if (userId) DB.add('notifications', { user_id: userId, message, is_read: false, created_at: now() }); }
const userOf = (table, key, id) => DB.get(table, { [key]: id })[0]?.user_id;

/* ---------- 2. Smart progress monitoring ---------- */
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
// Expected progress = how much of the time (project start to deadline) has passed
const expected = (m, p) => { const s = +new Date(p.created_at), e = +new Date(m.due_date); return e <= s ? 100 : Math.round(clamp((Date.now() - s) / (e - s), 0, 1) * 100); };
const avg = (ms, f) => ms.length ? Math.round(ms.reduce((a, m) => a + f(m), 0) / ms.length) : 0;
function pstatus(p, ms) {
  if (!ms.length) return 'Not Started';
  if (ms.every(m => m.progress >= 100)) return 'Completed';
  const diff = avg(ms, m => m.progress) - avg(ms, m => expected(m, p));
  return diff > 5 ? 'Ahead of Schedule' : diff < -5 ? 'Behind Schedule' : 'On Track';
}
const msOf = p => DB.get('milestones', { project_id: p.project_id }).sort(byDue);
const latestTopic = sid => DB.get('topic_submissions', { student_id: sid }).sort(newest)[0];
const msData = (m, p) => ({ id: m.milestone_id, title: m.title, due: 'Due ' + fmt(m.due_date), progress: m.progress, meta: `Actual ${m.progress}%, expected ${expected(m, p)}%` });

/* ---------- 3. Moving between screens and pages ---------- */
const S = { user: null, profile: null };
const FIRST = { coordinator: 'c-dash', supervisor: 's-dash', student: 'st-dash' };

// ROLE-BASED ACCESS: which pages each role may open
const PAGES = {
  coordinator: ['c-dash', 'c-students', 'c-sups', 'c-assign'],
  supervisor: ['s-dash', 's-topics', 's-projects', 'notes'],
  student: ['st-dash', 'st-topic', 'st-work', 'notes']
};
// ...and which role may use each button or form (anything not listed is open to all logged-in users)
const ALLOW = {
  unassign: 'coordinator', edit: 'coordinator', addStudent: 'coordinator', addSupervisor: 'coordinator', assign: 'coordinator',
  review: 'supervisor', addMs: 'supervisor', addFb: 'supervisor',
  submitTopic: 'student', resubmit: 'student', setProgress: 'student', upload: 'student'
};
function can(name) { if (ALLOW[name] && S.user?.role !== ALLOW[name]) throw Error('Your role is not allowed to do this.'); }

function show(screen) {   // home, login or dashboard
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('hidden', s.id !== screen));
  window.scrollTo(0, 0);
}

function showPage(name) { // one page inside the dashboard
  if (!S.user) { show('login'); return; }
  if (!PAGES[S.user.role].includes(name)) { toast('You do not have access to that page.', true); name = FIRST[S.user.role]; }
  document.querySelectorAll('[data-page]').forEach(p => p.classList.toggle('hidden', p.dataset.page !== name));
  document.querySelectorAll('#side [data-go]').forEach(b => b.classList.toggle('bg-white/15', b.dataset.go === name));
  if (window.innerWidth < 768) { $('side').classList.add('hidden'); $('side').classList.remove('flex'); }
  const n = DB.get('notifications', { user_id: S.user.user_id, is_read: false }).length;
  document.querySelectorAll('.unread').forEach(e => { e.textContent = n || ''; e.className = 'unread' + (n ? ' ml-1 px-1.5 rounded-full bg-amber-400 text-ink text-xs' : ''); });
  RENDER[name]();
  window.scrollTo(0, 0);
}

function enter(user) {    // open the dashboard for this user
  S.user = user; S.profile = DB.get(user.role + 's', { user_id: user.user_id })[0];
  SS.setItem('fyp_uid', user.user_id);
  setText('who', `${S.profile?.name || user.email} (${user.role})`);
  document.querySelectorAll('nav[data-role]').forEach(n => { const mine = n.dataset.role === user.role; n.classList.toggle('hidden', !mine); n.classList.toggle('flex', mine); });
  show('dashboard'); showPage(FIRST[user.role]);
}

/* ---------- 4. What each page shows ---------- */
const RENDER = {
  // ----- Coordinator -----
  'c-dash'() {
    const st = DB.get('students'), act = DB.get('supervisor_assignments', { assignment_status: 'Active' });
    setText('n-students', st.length); setText('n-sups', DB.get('supervisors').length); setText('n-assigned', act.length); setText('n-waiting', st.length - act.length);
    fillTable('c-projects', st.map(s => {
      const a = act.find(a => a.student_id === s.student_id), sp = a && DB.get('supervisors', { supervisor_id: a.supervisor_id })[0];
      const t = latestTopic(s.student_id), p = DB.get('projects', { student_id: s.student_id })[0];
      return [esc(s.name), sp ? esc(sp.name) : 'Not assigned', t ? badgeHtml(t.status) : 'No topic', p ? badgeHtml(pstatus(p, msOf(p))) : 'None'];
    }));
  },
  'c-students': () => people('student'),
  'c-sups': () => people('supervisor'),
  'c-assign'() {
    const act = DB.get('supervisor_assignments', { assignment_status: 'Active' }), st = DB.get('students'), sp = DB.get('supervisors');
    const opts = (rows, id) => '<option value="">Choose</option>' + rows.map(r => `<option value="${r[id]}">${esc(r.name)}</option>`).join('');
    $('as-student').innerHTML = opts(st, 'student_id'); $('as-sup').innerHTML = opts(sp, 'supervisor_id');
    fillTable('assign-body', act.map(a => [esc(st.find(s => s.student_id === a.student_id)?.name), esc(sp.find(s => s.supervisor_id === a.supervisor_id)?.name), fmt(a.assigned_at), `<button data-act="unassign" data-id="${a.assignment_id}" class="text-red-700 underline">Remove</button>`]));
  },
  // ----- Supervisor -----
  's-dash'() {
    const me = S.profile.supervisor_id, ps = DB.get('projects', { supervisor_id: me }), sts = myStudents();
    setText('n-mystudents', sts.length); setText('n-topics', DB.get('topic_submissions', { supervisor_id: me, status: 'Pending' }).length); setText('n-projects', ps.length);
    fillTable('s-students', sts.map(s => { const t = latestTopic(s.student_id), p = ps.find(p => p.student_id === s.student_id); return [esc(s.name), t ? badgeHtml(t.status) : 'No topic', p ? badgeHtml(pstatus(p, msOf(p))) : 'None']; }));
  },
  's-topics'() {
    const all = DB.get('topic_submissions', { supervisor_id: S.profile.supervisor_id }).sort(newest), name = id => DB.get('students', { student_id: id })[0]?.name;
    const pending = all.filter(t => t.status === 'Pending'), done = all.filter(t => t.status !== 'Pending');
    $('review-list').innerHTML = ''; pending.forEach(t => $('review-list').append(cloneTpl('tpl-review', { ...t, id: t.submission_id, meta: `${name(t.student_id)}, submitted ${fmt(t.submitted_at)}`, feedback: undefined })));
    $('review-empty').classList.toggle('hidden', pending.length > 0);
    fillTable('reviewed-body', done.map(t => [esc(name(t.student_id)), esc(t.topic_title), badgeHtml(t.status), fmt(t.reviewed_at)]));
  },
  's-projects'() {
    const ps = DB.get('projects', { supervisor_id: S.profile.supervisor_id }); $('p-list').innerHTML = ''; $('p-empty').classList.toggle('hidden', ps.length > 0);
    ps.forEach(p => {
      const ms = msOf(p), n = cloneTpl('tpl-project', { id: p.project_id, project_title: p.title, student: DB.get('students', { student_id: p.student_id })[0]?.name, status: pstatus(p, ms) });
      slot(n, 'ms').innerHTML = ''; ms.length ? ms.forEach(m => slot(n, 'ms').append(cloneTpl('tpl-ms', msData(m, p)))) : (slot(n, 'ms').innerHTML = '<p class="text-sm text-ink/50 py-3">No milestones yet.</p>');
      lines(slot(n, 'docs'), DB.get('documents', { project_id: p.project_id }).map(d => ({ text: d.file_name, date: 'Uploaded ' + fmt(d.uploaded_at) })));
      lines(slot(n, 'fb'), DB.get('feedback', { project_id: p.project_id }).map(f => ({ text: f.comment, date: fmt(f.created_at) })));
      $('p-list').append(n);
    });
  },
  // ----- Student -----
  'st-dash'() {
    const c = ctx(), t = c.topics[0];
    setText('sd-welcome', 'Welcome, ' + S.profile.name.split(' ')[0]);
    setText('sd-sup', c.sup ? c.sup.name : 'Not yet assigned'); setText('sd-dept', c.sup ? c.sup.department : 'The coordinator will assign a supervisor.');
    setText('sd-topic', t ? t.topic_title : 'No topic submitted yet'); $('sd-topic-badge').innerHTML = t ? badgeHtml(t.status) : '';
    $('sd-prog-badge').innerHTML = c.p ? badgeHtml(pstatus(c.p, c.ms)) : '<span class="text-sm">Starts after your topic is approved.</span>';
    const a = avg(c.ms, m => m.progress), e = c.p ? avg(c.ms, m => expected(m, c.p)) : 0;
    setText('sd-actual-txt', a); setText('sd-exp-txt', e); $('sd-actual-bar').style.width = a + '%'; $('sd-exp-bar').style.width = e + '%';
  },
  'st-topic'() {
    const c = ctx(), busy = c.topics.some(t => ['Pending', 'Approved', 'Revision Requested'].includes(t.status));
    $('t-nosup').classList.toggle('hidden', !!c.sup); $('t-formcard').classList.toggle('hidden', !c.sup || busy);
    $('t-list').innerHTML = ''; c.topics.forEach(t => $('t-list').append(cloneTpl('tpl-topic', { ...t, id: t.submission_id, meta: 'Submitted ' + fmt(t.submitted_at), feedback: t.supervisor_feedback, revision: t.status === 'Revision Requested' })));
  },
  'st-work'() {
    const c = ctx(); $('w-empty').classList.toggle('hidden', !!c.p); $('w-content').classList.toggle('hidden', !c.p); if (!c.p) return;
    setText('w-title', c.p.title); $('w-badge').textContent = pstatus(c.p, c.ms); $('w-badge').className = badgeClass($('w-badge').textContent);
    $('w-ms').innerHTML = ''; c.ms.length ? c.ms.forEach(m => $('w-ms').append(cloneTpl('tpl-ms', msData(m, c.p), { edit: true }))) : ($('w-ms').innerHTML = '<p class="text-sm text-ink/50 py-3">Your supervisor has not added milestones yet.</p>');
    lines($('w-docs'), DB.get('documents', { project_id: c.p.project_id }).map(d => ({ text: d.file_name, date: 'Uploaded ' + fmt(d.uploaded_at) })));
    lines($('w-fb'), DB.get('feedback', { project_id: c.p.project_id }).map(f => ({ text: f.comment, date: fmt(f.created_at) })));
  },
  notes() {
    lines($('notes-list'), DB.get('notifications', { user_id: S.user.user_id }).sort((a, b) => b.created_at.localeCompare(a.created_at)).map(n => ({ text: n.message, date: fmt(n.created_at) })));
  }
};

function people(k) {   // students or supervisors table
  const st = k === 'student';
  fillTable(k + 's-body', DB.get(k + 's').map(r => [esc(r.name), esc(st ? r.reg_number : r.staff_id), esc(r.department), `<button data-act="edit" data-t="${k}s" data-id="${r[PK[k + 's']]}" data-name="${esc(r.name)}" data-dep="${esc(r.department)}" class="text-brand underline">Edit</button>`]));
}
function myStudents() {
  return DB.get('supervisor_assignments', { supervisor_id: S.profile.supervisor_id, assignment_status: 'Active' }).map(a => DB.get('students', { student_id: a.student_id })[0]).filter(Boolean);
}
function ctx() {   // everything a student needs: supervisor, topics, project, milestones
  const id = S.profile.student_id, a = DB.get('supervisor_assignments', { student_id: id, assignment_status: 'Active' })[0];
  const p = DB.get('projects', { student_id: id })[0];
  return { sup: a && DB.get('supervisors', { supervisor_id: a.supervisor_id })[0], topics: DB.get('topic_submissions', { student_id: id }).sort(newest), p, ms: p ? msOf(p) : [] };
}

/* ---------- 5. Buttons (data-act) ---------- */
const ACT = {
  hmenu: () => $('mnav').classList.toggle('hidden'),
  menu: () => { $('side').classList.toggle('hidden'); $('side').classList.toggle('flex'); },
  fill: d => { $('l-email').value = d.e; $('l-pass').value = 'demo1234'; },
  reset: () => DB.reset(),
  showpass: () => { const i = $('l-pass'); i.type = i.type === 'password' ? 'text' : 'password'; },
  logout: () => { SS.removeItem('fyp_uid'); S.user = S.profile = null; show('home'); },
  unassign: d => { DB.set('supervisor_assignments', d.id, { assignment_status: 'Inactive' }); toast('Assignment removed'); showPage('c-assign'); },
  edit: d => {
    const n = prompt('Full name', d.name); if (n === null) return;
    const dp = prompt('Department', d.dep); if (dp === null) return;
    DB.set(d.t, d.id, { name: n, department: dp }); toast('Record updated'); showPage(S.user.role === 'coordinator' && d.t === 'students' ? 'c-students' : 'c-sups');
  },
  readAll: () => { DB.get('notifications', { user_id: S.user.user_id, is_read: false }).forEach(n => DB.set('notifications', n.notification_id, { is_read: true })); showPage('notes'); }
};

/* ---------- 6. Forms (data-form). Each one gets the form values in "d" ---------- */
const FORM = {
  login(d) {
    const err = $('login-error'); err.classList.add('hidden');
    const u = DB.get('users').find(u => u.email === d.email.trim().toLowerCase() && u.password === d.password);
    if (!u) { err.textContent = 'Wrong email or password. Check your details and try again.'; err.classList.remove('hidden'); return; }
    $('l-pass').value = ''; enter(u); toast('Welcome, ' + (S.profile?.name || u.email));
  },
  addStudent: (d) => addPerson('student', d),
  addSupervisor: (d) => addPerson('supervisor', d),
  assign(d) {
    if (DB.get('supervisor_assignments', { student_id: d.student_id, assignment_status: 'Active' }).length) throw Error('This student already has an active supervisor. Remove it first.');
    DB.add('supervisor_assignments', { student_id: d.student_id, supervisor_id: d.supervisor_id, assigned_at: now(), assignment_status: 'Active' });
    notify(userOf('students', 'student_id', d.student_id), 'A supervisor has been assigned to you.');
    notify(userOf('supervisors', 'supervisor_id', d.supervisor_id), 'A new student has been assigned to you.');
    toast('Supervisor assigned'); showPage('c-assign');
  },
  submitTopic(d) {
    const c = ctx(); if (!c.sup) throw Error('Supervisor not yet assigned.');
    DB.add('topic_submissions', { student_id: S.profile.student_id, supervisor_id: c.sup.supervisor_id, topic_title: d.topic_title, description: d.description, status: 'Pending', supervisor_feedback: '', submitted_at: now(), reviewed_at: null });
    notify(c.sup.user_id, `${S.profile.name} submitted a topic for review.`); toast('Topic submitted'); showPage('st-topic');
  },
  resubmit(d, id) {
    DB.set('topic_submissions', id, { topic_title: d.topic_title, description: d.description, status: 'Pending', submitted_at: now() });
    notify(ctx().sup?.user_id, `${S.profile.name} resubmitted a revised topic.`); toast('Topic resubmitted'); showPage('st-topic');
  },
  review(d, id) {
    if (d.decision !== 'Approved' && !d.feedback.trim()) throw Error(d.decision === 'Rejected' ? 'Enter a reason for rejecting this topic.' : 'Enter feedback for the revision.');
    const t = DB.get('topic_submissions', { submission_id: id })[0];
    DB.set('topic_submissions', id, { status: d.decision, supervisor_feedback: d.feedback, reviewed_at: now() });
    if (d.decision === 'Approved' && !DB.get('projects', { student_id: t.student_id }).length)
      DB.add('projects', { student_id: t.student_id, supervisor_id: t.supervisor_id, title: t.topic_title, description: t.description, status: 'Active', created_at: now() });
    notify(userOf('students', 'student_id', t.student_id), `Your topic "${t.topic_title}" is now: ${d.decision}.`);
    toast('Decision saved'); showPage('s-topics');
  },
  addMs(d, id) {
    const p = DB.get('projects', { project_id: id })[0];
    DB.add('milestones', { project_id: id, title: d.title, description: '', status: 'Not Started', progress: 0, due_date: new Date(d.due_date).toISOString() });
    notify(userOf('students', 'student_id', p.student_id), `New milestone: ${d.title} (due ${fmt(d.due_date)}).`); toast('Milestone added'); showPage('s-projects');
  },
  addFb(d, id) {
    const p = DB.get('projects', { project_id: id })[0];
    DB.add('feedback', { project_id: id, supervisor_id: S.profile.supervisor_id, comment: d.comment, created_at: now() });
    notify(userOf('students', 'student_id', p.student_id), 'Your supervisor left new feedback.'); toast('Feedback sent'); showPage('s-projects');
  },
  setProgress(d, id) {
    const m = DB.get('milestones', { milestone_id: id })[0], p = DB.get('projects', { project_id: m.project_id })[0], v = +d.progress;
    DB.set('milestones', id, { progress: v, status: v >= 100 ? 'Completed' : v > 0 ? 'In Progress' : 'Not Started' });
    DB.add('progress', { milestone_id: id, expected_progress: expected(m, p), actual_progress: v, recorded_at: now() });
    notify(userOf('supervisors', 'supervisor_id', p.supervisor_id), `${S.profile.name} updated "${m.title}" to ${v}%.`); toast('Progress saved'); showPage('st-work');
  },
  upload(d) {
    const p = ctx().p, file = d.file;  // the demo saves only the file name; Supabase Storage will save the real file
    DB.add('documents', { project_id: p.project_id, file_name: file.name, file_path: file.name, uploaded_at: now() });
    notify(userOf('supervisors', 'supervisor_id', p.supervisor_id), `${S.profile.name} uploaded ${file.name}.`); toast('Document uploaded'); showPage('st-work');
  }
};
function addPerson(role, d) {
  if (DB.get('users').some(u => u.email === d.email)) throw Error('This email is already registered.');
  const u = DB.add('users', { email: d.email, password: d.password, role });
  const { email, password, ...rest } = d; DB.add(role + 's', { user_id: u.user_id, ...rest });
  toast(role + ' added'); showPage(role === 'student' ? 'c-students' : 'c-sups');
}

/* ---------- 7. Listen for clicks and form submits ---------- */
function run(fn) { try { fn(); } catch (e) { toast(e.message || String(e), true); console.error(e); } }
document.addEventListener('click', e => {
  const scr = e.target.closest('[data-screen]'); if (scr) { e.preventDefault(); show(scr.dataset.screen); return; }
  const go = e.target.closest('[data-go]'); if (go) { run(() => showPage(go.dataset.go)); return; }
  const b = e.target.closest('[data-act]'); if (b) run(() => { can(b.dataset.act); ACT[b.dataset.act](b.dataset); });
});
document.addEventListener('submit', e => {
  const f = e.target.closest('[data-form]'); if (!f) return; e.preventDefault();
  const id = f.closest('[data-id]')?.dataset.id;   // the id of the topic or project this form belongs to
  run(() => { can(f.dataset.form); FORM[f.dataset.form](Object.fromEntries(new FormData(f, e.submitter)), id); });
});

/* ---------- 8. Start ---------- */
const savedId = SS.getItem('fyp_uid');
const savedUser = savedId && DB.get('users', { user_id: savedId })[0];
savedUser ? enter(savedUser) : show('home');
