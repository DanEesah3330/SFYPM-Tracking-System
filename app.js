/* app.js = the LOGIC. The design is in index.html, the data is in data.js.
   Pattern: a function finds an element by its id and puts data inside it. */

/* ---------- 1. Small helpers ---------- */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = d => { const date = d ? new Date(d) : null; return date && Number.isFinite(+date) ? date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : d ? 'N/A' : 'None'; };
const now = () => new Date().toISOString();
const setText = (id, v) => { $(id).textContent = v; };
const newest = (a, b) => (b.submitted_at || '').localeCompare(a.submitted_at || '');
const byDue = (a, b) => (Date.parse(a.due_date) || Infinity) - (Date.parse(b.due_date) || Infinity);

// Colours of the status labels
const BADGE = { 'Pending Review': 'bg-amber-100 text-amber-800', 'Revision Requested': 'bg-orange-100 text-orange-800', Approved: 'bg-emerald-100 text-emerald-800', Rejected: 'bg-red-100 text-red-800', 'Not Started': 'bg-stone-200 text-stone-700', 'In Progress': 'bg-sky-100 text-sky-800', 'On Track': 'bg-sky-100 text-sky-800', 'Ahead of Schedule': 'bg-emerald-100 text-emerald-800', 'Behind Schedule': 'bg-red-100 text-red-800', Completed: 'bg-emerald-100 text-emerald-800' };
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
  const empty = { 'c-projects': 'No student records are registered yet.', 'students-body': 'No students have registered yet.', 'supervisors-body': 'No supervisors have registered yet.', 'assign-body': 'No active supervisor assignments yet.', 'assign-history-body': 'No ended assignments yet.', 's-students': 'No students or projects are currently assigned to you.', 'reviewed-body': 'No reviewed topics yet.' };
  $(id).innerHTML = rows.length ? rows.map(r => '<tr>' + r.map(c => `<td>${c}</td>`).join('') + '</tr>').join('') : `<tr><td colspan="9" class="text-ink/50">${empty[id] || 'Nothing here yet.'}</td></tr>`;
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

let fileDbPromise;
function fileDatabase() {
  if (!('indexedDB' in window)) return Promise.reject(Error('This browser does not support local file storage.'));
  if (!fileDbPromise) fileDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open('fyp-prototype-files', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('documents');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(Error('Could not open local file storage.'));
  });
  return fileDbPromise;
}
async function storeFile(storageRef, file) {
  const database = await fileDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('documents', 'readwrite');
    transaction.objectStore('documents').put(file, storageRef);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(Error('The selected file could not be saved in this browser.'));
    transaction.onabort = () => reject(Error('The selected file could not be saved in this browser.'));
  });
}
async function getStoredFile(storageRef) {
  const database = await fileDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction('documents').objectStore('documents').get(storageRef);
    request.onsuccess = () => request.result ? resolve(request.result) : reject(Error('The stored file is unavailable in this browser.'));
    request.onerror = () => reject(Error('Could not read the stored file.'));
  });
}
async function removeStoredFile(storageRef) {
  const database = await fileDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('documents', 'readwrite');
    transaction.objectStore('documents').delete(storageRef);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(Error('Could not clean up the local file.'));
  });
}
function renderDocuments(box, project) {
  const documents = DB.get('documents', { project_id: project.project_id }).sort((a, b) => (b.uploaded_at || '').localeCompare(a.uploaded_at || ''));
  box.innerHTML = documents.length ? documents.map(record => {
    const user = DB.get('users', { user_id: record.uploader_id })[0], profile = user && DB.get(user.role + 's', { user_id: user.user_id })[0];
    const action = record.storage_ref ? `<button data-act="downloadDoc" data-id="${esc(record.document_id)}" class="text-brand underline">Open / download</button>` : '<span class="text-xs text-amber-700">File content unavailable; this is legacy filename-only metadata.</span>';
    return `<div class="py-2 border-t border-stone-100 text-sm flex flex-wrap items-center justify-between gap-2"><div class="min-w-0"><p class="break-all">${esc(record.original_file_name || record.file_name)}</p><p class="text-xs text-ink/50">Uploaded ${fmt(record.uploaded_at)} by ${esc(profile?.name || user?.email || 'Unknown user')}</p></div>${action}</div>`;
  }).join('') : '<p class="py-2 text-sm text-ink/50">No documents have been uploaded.</p>';
}
function renderProgressHistory(box, milestone) {
  const updates = DB.get('progress', { milestone_id: milestone.milestone_id }).sort((a, b) => (a.recorded_at || '').localeCompare(b.recorded_at || ''));
  box.innerHTML = updates.length ? `<details class="mt-3 text-sm"><summary class="cursor-pointer text-brand">Progress history (${updates.length})</summary><ul class="mt-2 space-y-1">${updates.map(update => {
    const user = DB.get('users', { user_id: update.submitted_by })[0], profile = user && DB.get(user.role + 's', { user_id: user.user_id })[0];
    return `<li class="border-t border-stone-100 pt-2">${esc(String(update.actual_progress))}% by ${esc(profile?.name || 'Unknown user')} on ${fmt(update.recorded_at)}</li>`;
  }).join('')}</ul></details>` : '<p class="mt-2 text-xs text-ink/50">No progress updates submitted yet.</p>';
}

/* ---------- 2. Smart progress monitoring ---------- */
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
// Expected progress is undefined when either date is missing or invalid.
const expected = (m, p) => {
  const start = Date.parse(p?.created_at), due = Date.parse(m?.due_date);
  if (!Number.isFinite(start) || !Number.isFinite(due)) return null;
  return due <= start ? 100 : clamp((Date.now() - start) / (due - start) * 100, 0, 100);
};
const avg = (ms, f) => ms.length ? ms.reduce((total, m) => total + f(m), 0) / ms.length : null;
const shownPercent = value => value === null || !Number.isFinite(value) ? 'N/A' : `${Math.round(value * 10) / 10}%`;
const validProgressValues = ms => ms.length > 0 && ms.every(m => Number.isFinite(+m.progress) && +m.progress >= 0 && +m.progress <= 100);
function pstatus(p, ms) {
  if (!p || !ms.length) return 'Not Started';
  if (!validProgressValues(ms)) return 'N/A';
  if (ms.every(m => +m.progress === 0)) return 'Not Started';
  if (ms.every(m => m.progress >= 100)) return 'Completed';
  const expectedValues = ms.map(m => expected(m, p));
  if (expectedValues.some(value => value === null)) return 'N/A';
  const diff = avg(ms, m => +m.progress) - avg(ms, m => expected(m, p));
  return diff > 5 ? 'Ahead of Schedule' : diff < -5 ? 'Behind Schedule' : 'On Track';
}
const msOf = p => DB.get('milestones', { project_id: p.project_id }).sort(byDue);
const latestTopic = sid => DB.get('topic_submissions', { student_id: sid }).sort(newest)[0];
const msData = (m, p) => ({ id: m.milestone_id, title: m.title, due: 'Due ' + fmt(m.due_date), progress: m.progress, status: m.status || (+m.progress >= 100 ? 'Completed' : +m.progress > 0 ? 'In Progress' : 'Not Started'), meta: `Actual ${shownPercent(+m.progress)}, expected ${shownPercent(expected(m, p))}` });

/* ---------- 3. Moving between screens and pages ---------- */
const S = { user: null, profile: null, page: null };
const FIRST = { coordinator: 'c-dash', supervisor: 's-dash', student: 'st-dash' };

// ROLE-BASED ACCESS: which pages each role may open
const PAGES = {
  coordinator: ['c-dash', 'c-students', 'c-sups', 'c-assign'],
  supervisor: ['s-dash', 's-topics', 's-projects', 'notes'],
  student: ['st-dash', 'st-topic', 'st-work', 'notes']
};
// ...and which role may use each button or form (anything not listed is open to all logged-in users)
const ALLOW = {
  endAssignment: 'coordinator', changeAssignment: 'coordinator', editUser: 'coordinator', assign: 'coordinator',
  review: 'supervisor', addMs: 'supervisor', addFb: 'supervisor',
  submitTopic: 'student', resubmit: 'student', setProgress: 'student', upload: 'student', editOwnName: 'student',
  downloadDoc: ['student', 'supervisor']
};
function can(name) {
  const allowed = ALLOW[name];
  if (allowed && !(Array.isArray(allowed) ? allowed.includes(S.user?.role) : S.user?.role === allowed)) throw Error('Your role is not allowed to do this.');
}

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
  S.page = name;
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
    const st = DB.get('students'), sups = DB.get('supervisors'), assigned = new Set(activeAssignments().map(a => a.student_id));
    setText('n-students', st.length); setText('n-sups', sups.length); setText('n-assigned', assigned.size); setText('n-waiting', st.length - assigned.size);
    fillTable('c-projects', st.map(s => {
      const a = activeAssignments().find(a => a.student_id === s.student_id), sp = a && DB.get('supervisors', { supervisor_id: a.supervisor_id })[0];
      const t = latestTopic(s.student_id), p = DB.get('projects', { student_id: s.student_id })[0];
      const ms = p ? msOf(p) : [], monitored = p && t?.status === 'Approved';
      return [`${esc(s.name)}<span class="block text-xs text-ink/60">${esc(s.reg_number)}</span>`, sp ? `${esc(sp.name)}<span class="block text-xs text-ink/60">${esc(sp.designation || 'Designation not set')}</span>` : 'Not Assigned', t ? esc(t.topic_title) : 'No topic submitted', t ? badgeHtml(t.status) : 'N/A', monitored ? badgeHtml(pstatus(p, ms)) : 'N/A'];
    }));
  },
  'c-students': () => people('student'),
  'c-sups': () => people('supervisor'),
  'c-assign'() {
    const act = activeAssignments(), st = DB.get('students').filter(s => !act.some(a => a.student_id === s.student_id) && isActiveUser(s.user_id, 'student'));
    const sp = DB.get('supervisors').filter(s => isActiveUser(s.user_id, 'supervisor'));
    const opts = (rows, id, label) => '<option value="">Choose</option>' + rows.map(r => `<option value="${esc(r[id])}">${esc(r.name)}${label ? ` (${esc(r[label] || 'Designation not set')})` : ''}</option>`).join('');
    $('as-student').innerHTML = opts(st, 'student_id'); $('as-sup').innerHTML = opts(sp, 'supervisor_id', 'designation');
    fillTable('assign-body', act.map(a => {
      const student = DB.get('students', { student_id: a.student_id })[0], supervisor = DB.get('supervisors', { supervisor_id: a.supervisor_id })[0];
      const options = '<option value="">Choose supervisor</option>' + sp.filter(s => s.supervisor_id !== a.supervisor_id).map(s => `<option value="${esc(s.supervisor_id)}">${esc(s.name)} (${esc(s.designation || 'Designation not set')})</option>`).join('');
      return [`${esc(student?.name)}<span class="block text-xs text-ink/60">${esc(student?.reg_number)}</span>`, `${esc(supervisor?.name)}<span class="block text-xs text-ink/60">${esc(supervisor?.designation || 'Designation not set')}</span>`, fmt(a.assigned_at), `<div class="flex flex-col gap-2 min-w-36"><select class="inp !mt-0" aria-label="Change supervisor for ${esc(student?.name)}">${options}</select><button data-act="changeAssignment" data-id="${esc(a.assignment_id)}" class="text-brand underline">Change supervisor</button><button data-act="endAssignment" data-id="${esc(a.assignment_id)}" class="text-red-700 underline">End assignment</button></div>`];
    }));
    fillTable('assign-history-body', DB.get('supervisor_assignments').filter(a => a.assignment_status !== 'Active').sort((a, b) => (b.ended_at || '').localeCompare(a.ended_at || '')).map(a => {
      const student = DB.get('students', { student_id: a.student_id })[0], supervisor = DB.get('supervisors', { supervisor_id: a.supervisor_id })[0];
      return [esc(student?.name), esc(student?.reg_number), `${esc(supervisor?.name)} (${esc(supervisor?.designation || 'Designation not set')})`, fmt(a.assigned_at), fmt(a.ended_at)];
    }));
  },
  // ----- Supervisor -----
  's-dash'() {
    const me = S.profile.supervisor_id, assignments = activeAssignments().filter(a => a.supervisor_id === me);
    const sts = [...new Map(assignments.map(a => [a.student_id, DB.get('students', { student_id: a.student_id })[0]]).filter(([, student]) => student).map(([id, student]) => [id, student])).values()];
    const ps = projectsForSupervisor(me), topics = sts.map(student => latestTopic(student.student_id)).filter(topic => topic?.status === 'Pending Review' && topic.supervisor_id === me);
    setText('n-mystudents', sts.length); setText('n-topics', topics.length); setText('n-projects', ps.length);
    fillTable('s-students', sts.map(student => {
      const topic = latestTopic(student.student_id), project = ps.find(record => record.student_id === student.student_id), milestones = project ? msOf(project) : [];
      const actual = validProgressValues(milestones) ? avg(milestones, milestone => +milestone.progress) : null;
      return [esc(student.name), esc(student.reg_number), topic ? esc(topic.topic_title) : 'No topic submitted', topic ? badgeHtml(topic.status) : 'N/A', project ? esc(project.title) : 'No approved project', project ? badgeHtml(pstatus(project, milestones)) : 'N/A', shownPercent(actual)];
    }));
  },
  's-topics'() {
    const me = S.profile.supervisor_id, assignedIds = new Set(activeAssignments().filter(a => a.supervisor_id === me).map(a => a.student_id));
    const all = DB.get('topic_submissions').filter(t => assignedIds.has(t.student_id)).sort(newest), name = id => DB.get('students', { student_id: id })[0]?.name;
    const pending = [...assignedIds].map(latestTopic).filter(t => t?.status === 'Pending Review' && t.supervisor_id === me), pendingIds = new Set(pending.map(t => t.submission_id));
    const done = all.filter(t => !pendingIds.has(t.submission_id));
    $('review-list').innerHTML = ''; pending.forEach(t => $('review-list').append(cloneTpl('tpl-review', { ...t, id: t.submission_id, meta: `${name(t.student_id)}, submitted ${fmt(t.submitted_at)}`, feedback: undefined })));
    $('review-empty').classList.toggle('hidden', pending.length > 0);
    fillTable('reviewed-body', done.map(t => [esc(name(t.student_id)), esc(t.topic_title), badgeHtml(t.status), fmt(t.reviewed_at)]));
  },
  's-projects'() {
    const ps = projectsForSupervisor(S.profile.supervisor_id); $('p-list').innerHTML = ''; $('p-empty').classList.toggle('hidden', ps.length > 0);
    ps.forEach(p => {
      const ms = msOf(p), n = cloneTpl('tpl-project', { id: p.project_id, project_title: p.title, student: DB.get('students', { student_id: p.student_id })[0]?.name, status: pstatus(p, ms) });
      slot(n, 'ms').innerHTML = ''; ms.length ? ms.forEach(m => {
        const node = cloneTpl('tpl-ms', msData(m, p));
        renderProgressHistory(slot(node, 'history'), m);
        slot(n, 'ms').append(node);
      }) : (slot(n, 'ms').innerHTML = '<p class="text-sm text-ink/50 py-3">No milestones yet.</p>');
      renderDocuments(slot(n, 'docs'), p);
      lines(slot(n, 'fb'), DB.get('feedback', { project_id: p.project_id }).map(f => ({ text: f.comment, date: fmt(f.created_at) })));
      $('p-list').append(n);
    });
  },
  // ----- Student -----
  'st-dash'() {
    const c = ctx(), t = c.topics[0];
    setText('sd-welcome', 'Welcome, ' + S.profile.name.split(' ')[0]);
    setText('sd-email', S.user.email); setText('sd-gender', S.profile.gender || 'Not provided'); setText('sd-reg', S.profile.reg_number); setText('sd-student-dept', S.profile.department); setText('sd-level', S.profile.level);
    setText('sd-sup', c.sup ? c.sup.name : 'Not yet assigned'); setText('sd-designation', c.sup ? c.sup.designation || 'Academic designation not set' : ''); setText('sd-dept', c.sup ? c.sup.department : 'The coordinator will assign a supervisor.');
    setText('sd-topic', t ? t.topic_title : 'No topic submitted yet'); $('sd-topic-badge').innerHTML = t ? badgeHtml(t.status) : '';
    $('sd-prog-badge').innerHTML = c.p ? badgeHtml(pstatus(c.p, c.ms)) : '<span class="text-sm">Starts after your topic is approved.</span>';
    const hasMilestones = c.ms.length > 0, actual = validProgressValues(c.ms) ? avg(c.ms, m => +m.progress) : null;
    const expectedValues = c.p && hasMilestones ? c.ms.map(m => expected(m, c.p)) : [];
    const exp = expectedValues.length && expectedValues.every(value => value !== null) ? avg(c.ms, m => expected(m, c.p)) : null;
    $('sd-progress-metrics').classList.toggle('hidden', !hasMilestones);
    setText('sd-actual-txt', actual === null ? 'N/A' : Math.round(actual * 10) / 10); setText('sd-exp-txt', exp === null ? 'N/A' : Math.round(exp * 10) / 10);
    $('sd-actual-bar').style.width = (actual ?? 0) + '%'; $('sd-exp-bar').style.width = (exp ?? 0) + '%';
    $('sd-milestones').innerHTML = '';
    c.ms.length ? c.ms.forEach(m => {
      const node = cloneTpl('tpl-ms', msData(m, c.p), { edit: true });
      renderProgressHistory(slot(node, 'history'), m); $('sd-milestones').append(node);
    }) : ($('sd-milestones').innerHTML = '<p class="text-sm text-ink/50">No milestones have been added yet.</p>');
  },
  'st-topic'() {
    const c = ctx(), latest = c.topics[0], canStart = !latest, canRevise = latest?.status === 'Revision Requested' && !DB.get('topic_submissions', { previous_submission_id: latest.submission_id }).length;
    $('t-nosup').classList.toggle('hidden', !!c.sup); $('t-formcard').classList.toggle('hidden', !c.sup || (!canStart && !canRevise));
    const form = $('t-submit-form'); form.dataset.form = canRevise ? 'resubmit' : 'submitTopic';
    $('t-form-title').textContent = canRevise ? 'Revise your project topic' : 'Submit a project topic';
    $('t-submit-button').textContent = canRevise ? 'Resubmit topic' : 'Submit topic';
    if (canRevise) form.dataset.id = latest.submission_id; else delete form.dataset.id;
    $('t-list').innerHTML = ''; c.topics.forEach((topic, index) => $('t-list').append(cloneTpl('tpl-topic', { ...topic, id: topic.submission_id, meta: 'Submitted ' + fmt(topic.submitted_at), feedback: topic.supervisor_feedback, revision: index === 0 && topic.status === 'Revision Requested' })));
  },
  'st-work'() {
    const c = ctx(); $('w-empty').classList.toggle('hidden', !!c.p); $('w-content').classList.toggle('hidden', !c.p); if (!c.p) return;
    setText('w-title', c.p.title); $('w-badge').textContent = pstatus(c.p, c.ms); $('w-badge').className = badgeClass($('w-badge').textContent);
    $('w-ms').innerHTML = ''; c.ms.length ? c.ms.forEach(m => {
      const node = cloneTpl('tpl-ms', msData(m, c.p), { edit: true });
      renderProgressHistory(slot(node, 'history'), m); $('w-ms').append(node);
    }) : ($('w-ms').innerHTML = '<p class="text-sm text-ink/50 py-3">Your supervisor has not added milestones yet.</p>');
    renderDocuments($('w-docs'), c.p);
    lines($('w-fb'), DB.get('feedback', { project_id: c.p.project_id }).map(f => ({ text: f.comment, date: fmt(f.created_at) })));
  },
  notes() {
    lines($('notes-list'), DB.get('notifications', { user_id: S.user.user_id }).sort((a, b) => b.created_at.localeCompare(a.created_at)).map(n => ({ text: n.message, date: fmt(n.created_at) })));
  }
};

function people(k) {
  const st = k === 'student';
  fillTable(k + 's-body', DB.get(k + 's').map(r => {
    const id = r[PK[k + 's']];
    return st
      ? [`<button data-act="viewUser" data-type="students" data-id="${esc(id)}" class="text-brand underline">${esc(r.name)}</button>`, esc(r.reg_number), esc(r.department), esc(r.level), `<button data-act="editUser" data-type="students" data-id="${esc(id)}" class="text-brand underline">Edit</button>`]
      : [`<button data-act="viewUser" data-type="supervisors" data-id="${esc(id)}" class="text-brand underline">${esc(r.name)}</button>`, esc(r.designation || 'Not specified'), esc(r.staff_id), esc(r.department), `<button data-act="editUser" data-type="supervisors" data-id="${esc(id)}" class="text-brand underline">Edit</button>`];
  }));
}
function isActiveUser(userId, role) { const user = DB.get('users', { user_id: userId })[0]; return !!user && user.role === role && user.active !== false; }
function activeAssignments() {
  return DB.get('supervisor_assignments', { assignment_status: 'Active' }).filter(a =>
    DB.get('students', { student_id: a.student_id }).some(s => isActiveUser(s.user_id, 'student')) &&
    DB.get('supervisors', { supervisor_id: a.supervisor_id }).some(s => isActiveUser(s.user_id, 'supervisor'))
  );
}
function myStudents() {
  return activeAssignments().filter(a => a.supervisor_id === S.profile.supervisor_id).map(a => DB.get('students', { student_id: a.student_id })[0]).filter(Boolean);
}
function projectsForSupervisor(supervisorId) {
  const studentIds = new Set(activeAssignments().filter(a => a.supervisor_id === supervisorId).map(a => a.student_id));
  return DB.get('projects').filter(project => studentIds.has(project.student_id) && latestTopic(project.student_id)?.status === 'Approved');
}
function ctx() {   // everything a student needs: supervisor, topics, project, milestones
  const id = S.profile.student_id, a = activeAssignments().find(assignment => assignment.student_id === id);
  const topics = DB.get('topic_submissions', { student_id: id }).sort(newest), project = DB.get('projects', { student_id: id })[0];
  const p = topics[0]?.status === 'Approved' ? project : null;
  return { sup: a && DB.get('supervisors', { supervisor_id: a.supervisor_id })[0], topics, p, ms: p ? msOf(p) : [] };
}

/* ---------- 5. Buttons (data-act) ---------- */
const ACT = {
  hmenu: () => $('mnav').classList.toggle('hidden'),
  menu: () => { $('side').classList.toggle('hidden'); $('side').classList.toggle('flex'); },
  fill: d => { $('l-email').value = d.e; $('l-pass').value = 'demo1234'; },
  reset: () => DB.reset(),
  showpass: () => { const i = $('l-pass'); i.type = i.type === 'password' ? 'text' : 'password'; },
  logout: () => { SS.removeItem('fyp_uid'); S.user = S.profile = null; show('home'); },
  endAssignment: d => {
    if (!confirm('End this supervisor assignment? The assignment will remain in history.')) return;
    const assignment = DB.get('supervisor_assignments', { assignment_id: d.id, assignment_status: 'Active' })[0];
    if (!assignment) throw Error('This assignment is no longer active.');
    DB.set('supervisor_assignments', d.id, { assignment_status: 'Inactive', ended_at: now() }); toast('Assignment ended'); showPage('c-assign');
  },
  changeAssignment: (d, button) => {
    const nextId = button.parentElement.querySelector('select').value;
    const current = DB.get('supervisor_assignments', { assignment_id: d.id, assignment_status: 'Active' })[0];
    if (!current || !nextId) throw Error('Choose an active supervisor first.');
    const next = DB.get('supervisors', { supervisor_id: nextId })[0];
    if (!next || !isActiveUser(next.user_id, 'supervisor')) throw Error('That supervisor is not eligible.');
    if (!confirm('Change this student\'s supervisor? The previous assignment will remain in history.')) return;
    DB.set('supervisor_assignments', d.id, { assignment_status: 'Inactive', ended_at: now() });
    DB.add('supervisor_assignments', { student_id: current.student_id, supervisor_id: nextId, assigned_at: now(), assignment_status: 'Active' });
    DB.get('projects', { student_id: current.student_id }).forEach(project => DB.set('projects', project.project_id, { supervisor_id: nextId }));
    DB.get('topic_submissions', { student_id: current.student_id, status: 'Pending Review' }).forEach(topic => DB.set('topic_submissions', topic.submission_id, { supervisor_id: nextId }));
    notify(userOf('students', 'student_id', current.student_id), 'Your assigned supervisor has changed.');
    notify(userOf('supervisors', 'supervisor_id', nextId), 'A student has been assigned to you.');
    toast('Supervisor changed'); showPage('c-assign');
  },
  viewUser: d => {
    const profile = DB.get(d.type, { [PK[d.type]]: d.id })[0], user = profile && DB.get('users', { user_id: profile.user_id })[0];
    if (!profile || !user) throw Error('This registered profile could not be found.');
    const details = d.type === 'students'
      ? `Name: ${profile.name}\nEmail: ${user.email}\nGender: ${profile.gender || 'Not provided'}\nRegistration number: ${profile.reg_number}\nDepartment: ${profile.department}\nLevel: ${profile.level}`
      : `Name: ${profile.name}\nEmail: ${user.email}\nGender: ${profile.gender || 'Not provided'}\nDesignation: ${profile.designation || 'Not specified'}\nStaff ID: ${profile.staff_id}\nDepartment: ${profile.department}`;
    alert(details);
  },
  editUser: d => {
    const profile = DB.get(d.type, { [PK[d.type]]: d.id })[0]; if (!profile) throw Error('This profile could not be found.');
    const name = prompt('Full name', profile.name); if (name === null) return; if (!name.trim()) throw Error('Name is required.');
    const department = prompt('Department', profile.department); if (department === null) return; if (!department.trim()) throw Error('Department is required.');
    const patch = { name: name.trim(), department: department.trim() };
    if (d.type === 'students') {
      const registration = prompt('Registration number', profile.reg_number); if (registration === null) return;
      const level = prompt('Level', profile.level); if (level === null) return;
      patch.reg_number = registration.trim(); patch.level = level.trim();
    } else {
      const staffId = prompt('Staff ID', profile.staff_id); if (staffId === null) return;
      const designation = prompt('Academic designation', profile.designation || 'Lecturer'); if (designation === null) return;
      patch.staff_id = staffId.trim(); patch.designation = designation.trim();
    }
    DB.set(d.type, d.id, patch); toast('Profile updated'); showPage(d.type === 'students' ? 'c-students' : 'c-sups');
  },
  editOwnName: () => {
    const name = prompt('Your name', S.profile.name); if (name === null) return; if (!name.trim()) throw Error('Name is required.');
    DB.set(S.user.role + 's', S.profile[PK[S.user.role + 's']], { name: name.trim() }); S.profile = DB.get(S.user.role + 's', { user_id: S.user.user_id })[0];
    setText('who', `${S.profile.name} (${S.user.role})`); toast('Name updated');
  },
  async downloadDoc(d) {
    const metadata = DB.get('documents', { document_id: d.id })[0], project = metadata && DB.get('projects', { project_id: metadata.project_id })[0];
    if (!metadata?.storage_ref || !project) throw Error('The stored document is unavailable.');
    const allowed = S.user.role === 'student'
      ? project.student_id === S.profile.student_id
      : projectsForSupervisor(S.profile.supervisor_id).some(record => record.project_id === project.project_id);
    if (!allowed) throw Error('You are not assigned to this document.');
    const file = await getStoredFile(metadata.storage_ref), url = URL.createObjectURL(file), link = document.createElement('a');
    link.href = url; link.download = metadata.original_file_name || metadata.file_name; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000); toast('Download started');
  },
  readAll: () => { DB.get('notifications', { user_id: S.user.user_id, is_read: false }).forEach(n => DB.set('notifications', n.notification_id, { is_read: true })); showPage('notes'); }
};

/* ---------- 6. Forms (data-form). Each one gets the form values in "d" ---------- */
const FORM = {
  async login(d) {
    const err = $('login-error'); err.classList.add('hidden');
    const u = DB.get('users').find(u => u.email === d.email.trim().toLowerCase());
    const valid = u && (u.password_hash ? await verifyPassword(d.password, u.password_salt, u.password_hash) : u.password === d.password);
    if (!valid || u.active === false) { err.textContent = 'Wrong email or password, or this account is inactive.'; err.classList.remove('hidden'); return; }
    if (u.password !== undefined) { const credentials = await passwordRecord(d.password); DB.set('users', u.user_id, { password: undefined, ...credentials }); }
    $('l-pass').value = ''; enter(u); toast('Welcome, ' + (S.profile?.name || u.email));
  },
  async registerStudent(d) { await registerPerson('student', { name: d.name, email: d.email, password: d.password, gender: d.gender, reg_number: d.reg_number, department: d.department, level: d.level }); },
  async registerSupervisor(d) {
    const designation = d.designation === 'Other' ? d.custom_designation.trim() : d.designation;
    if (!designation) throw Error('Enter your academic designation.');
    await registerPerson('supervisor', { name: d.name, email: d.email, password: d.password, gender: d.gender, staff_id: d.staff_id, department: d.department, designation });
  },
  assign(d) {
    if (!DB.get('students', { student_id: d.student_id }).some(s => isActiveUser(s.user_id, 'student'))) throw Error('Select an active registered student.');
    if (!DB.get('supervisors', { supervisor_id: d.supervisor_id }).some(s => isActiveUser(s.user_id, 'supervisor'))) throw Error('Select an active registered supervisor.');
    if (activeAssignments().some(a => a.student_id === d.student_id)) throw Error('This student already has an active supervisor.');
    DB.add('supervisor_assignments', { student_id: d.student_id, supervisor_id: d.supervisor_id, assigned_at: now(), assignment_status: 'Active' });
    notify(userOf('students', 'student_id', d.student_id), 'A supervisor has been assigned to you.');
    notify(userOf('supervisors', 'supervisor_id', d.supervisor_id), 'A new student has been assigned to you.');
    toast('Supervisor assigned'); showPage('c-assign');
  },
  submitTopic(d) {
    const c = ctx(); if (!c.sup || !isActiveUser(c.sup.user_id, 'supervisor')) throw Error('An active supervisor must be assigned before you submit a topic.');
    if (c.topics.length) throw Error('A new topic cannot be submitted unless the previous review permits revision.');
    DB.add('topic_submissions', { student_id: S.profile.student_id, supervisor_id: c.sup.supervisor_id, topic_title: d.topic_title, description: d.description, status: 'Pending Review', supervisor_feedback: '', submitted_at: now(), reviewed_at: null });
    notify(c.sup.user_id, `${S.profile.name} submitted a topic for review.`); toast('Topic submitted'); showPage('st-topic');
  },
  resubmit(d, id) {
    const previous = DB.get('topic_submissions', { submission_id: id, student_id: S.profile.student_id, status: 'Revision Requested' })[0];
    if (!previous) throw Error('This topic is not eligible for revision.');
    if (DB.get('topic_submissions', { previous_submission_id: id }).length) throw Error('A revision has already been submitted for this review.');
    const supervisor = ctx().sup;
    if (!supervisor || !isActiveUser(supervisor.user_id, 'supervisor')) throw Error('An active supervisor must be assigned before resubmitting.');
    DB.add('topic_submissions', { student_id: previous.student_id, supervisor_id: supervisor.supervisor_id, topic_title: d.topic_title, description: d.description, status: 'Pending Review', supervisor_feedback: '', submitted_at: now(), reviewed_at: null, previous_submission_id: id });
    notify(ctx().sup?.user_id, `${S.profile.name} resubmitted a revised topic.`); toast('Topic resubmitted'); showPage('st-topic');
  },
  review(d, id) {
    if (!['Approved', 'Revision Requested', 'Rejected'].includes(d.decision)) throw Error('Choose a valid review decision.');
    if (d.decision !== 'Approved' && !d.feedback.trim()) throw Error(d.decision === 'Rejected' ? 'Enter a reason for rejecting this topic.' : 'Enter feedback for the revision.');
    const t = DB.get('topic_submissions', { submission_id: id, supervisor_id: S.profile.supervisor_id, status: 'Pending Review' })[0];
    if (!t) throw Error('This topic is no longer waiting for your review.');
    DB.set('topic_submissions', id, { status: d.decision, supervisor_feedback: d.feedback, reviewed_at: now() });
    if (d.decision === 'Approved' && !DB.get('projects', { student_id: t.student_id }).length)
      DB.add('projects', { student_id: t.student_id, supervisor_id: t.supervisor_id, title: t.topic_title, description: t.description, status: 'Active', created_at: now() });
    notify(userOf('students', 'student_id', t.student_id), `Your topic "${t.topic_title}" is now: ${d.decision}.`);
    toast('Decision saved'); showPage('s-topics');
  },
  addMs(d, id) {
    const p = DB.get('projects', { project_id: id })[0];
    if (!p || latestTopic(p.student_id)?.status !== 'Approved' || !projectsForSupervisor(S.profile.supervisor_id).some(project => project.project_id === id)) throw Error('Only the assigned Supervisor can add milestones to an approved project.');
    const title = d.title.trim(), due = Date.parse(d.due_date);
    if (!title || !Number.isFinite(due)) throw Error('Enter a milestone title and valid deadline.');
    if (DB.get('milestones', { project_id: id }).some(m => m.title.trim().toLowerCase() === title.toLowerCase() && Date.parse(m.due_date) === due)) throw Error('This milestone and deadline already exist.');
    DB.add('milestones', { project_id: id, title, description: '', status: 'Not Started', progress: 0, due_date: new Date(due).toISOString() });
    notify(userOf('students', 'student_id', p.student_id), `New milestone: ${d.title} (due ${fmt(d.due_date)}).`); toast('Milestone added'); showPage('s-projects');
  },
  addFb(d, id) {
    const p = DB.get('projects', { project_id: id })[0];
    if (!p || !projectsForSupervisor(S.profile.supervisor_id).some(project => project.project_id === id)) throw Error('You can only provide feedback on a project assigned to you.');
    DB.add('feedback', { project_id: id, supervisor_id: S.profile.supervisor_id, comment: d.comment, created_at: now() });
    notify(userOf('students', 'student_id', p.student_id), 'Your supervisor left new feedback.'); toast('Feedback sent'); showPage('s-projects');
  },
  setProgress(d, id) {
    const m = DB.get('milestones', { milestone_id: id })[0], p = m && DB.get('projects', { project_id: m.project_id })[0], v = Number(d.progress);
    if (!m || !p || p.student_id !== S.profile.student_id || ctx().p?.project_id !== p.project_id) throw Error('You can only update milestones on your own active project.');
    if (d.progress.trim() === '' || !Number.isInteger(v) || v < 0 || v > 100) throw Error('Progress must be a whole number from 0 to 100.');
    if (+m.progress === v) throw Error('Progress is unchanged; submit a different percentage.');
    const recordedAt = now(), expectedProgress = expected(m, p);
    DB.add('progress', { milestone_id: id, submitted_by: S.user.user_id, expected_progress: expectedProgress, actual_progress: v, recorded_at: recordedAt });
    DB.set('milestones', id, { progress: v, status: v >= 100 ? 'Completed' : v > 0 ? 'In Progress' : 'Not Started', updated_at: recordedAt });
    const assigned = activeAssignments().find(a => a.student_id === p.student_id), supervisor = assigned && DB.get('supervisors', { supervisor_id: assigned.supervisor_id })[0];
    notify(supervisor?.user_id, `${S.profile.name} updated "${m.title}" to ${v}%.`); toast('Progress saved'); showPage(S.page === 'st-dash' ? 'st-dash' : 'st-work');
  },
  async upload(d) {
    const p = ctx().p, file = d.file;
    if (!p || p.student_id !== S.profile.student_id || !file || !file.size) throw Error('Choose a non-empty file for your own active project.');
    const types = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };
    const extension = file.name.split('.').pop().toLowerCase(), contentType = types[extension];
    if (!contentType) throw Error('Unsupported file type. Upload PDF, Word, PowerPoint, JPG, JPEG, or PNG files.');
    if (file.type && file.type !== contentType && file.type !== 'application/octet-stream' && !(extension === 'jpg' && file.type === 'image/pjpeg')) throw Error('The file type does not match its filename extension.');
    if (file.size > 10 * 1024 * 1024) throw Error('File is larger than the 10 MB limit.');
    const storageRef = crypto.randomUUID(), uploadedAt = now();
    await storeFile(storageRef, file);
    try {
      DB.add('documents', { project_id: p.project_id, original_file_name: file.name, file_name: file.name, uploaded_at: uploadedAt, uploader_id: S.user.user_id, content_type: contentType, storage_ref: storageRef });
    } catch (error) {
      await removeStoredFile(storageRef);
      throw error;
    }
    const assigned = activeAssignments().find(a => a.student_id === p.student_id), supervisor = assigned && DB.get('supervisors', { supervisor_id: assigned.supervisor_id })[0];
    notify(supervisor?.user_id, `${S.profile.name} uploaded ${file.name}.`); toast('Document uploaded to this browser'); showPage('st-work');
  },
  async downloadDoc(d) {
    const metadata = DB.get('documents', { document_id: d.id })[0], project = metadata && DB.get('projects', { project_id: metadata.project_id })[0];
    if (!metadata || !project) throw Error('Document details are unavailable.');
    const allowed = S.user.role === 'student'
      ? project.student_id === S.profile.student_id
      : projectsForSupervisor(S.profile.supervisor_id).some(record => record.project_id === project.project_id);
    if (!allowed) throw Error('You are not assigned to this document.');
    const file = await getStoredFile(metadata.storage_ref), url = URL.createObjectURL(file), link = document.createElement('a');
    link.href = url; link.download = metadata.original_file_name || metadata.file_name; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000); toast('Download started');
  }
};
async function passwordRecord(password) {
  if (!crypto?.subtle) throw Error('Secure password hashing is unavailable. Open this prototype through localhost or a secure browser context.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' }, key, 256);
  return { password_salt: Array.from(salt, b => b.toString(16).padStart(2, '0')).join(''), password_hash: Array.from(new Uint8Array(bits), b => b.toString(16).padStart(2, '0')).join('') };
}
async function verifyPassword(password, saltHex, expectedHex) {
  if (!crypto?.subtle || !saltHex || !expectedHex) return false;
  const salt = Uint8Array.from(saltHex.match(/.{2}/g) || [], b => parseInt(b, 16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' }, key, 256);
  const actual = Array.from(new Uint8Array(bits), b => b.toString(16).padStart(2, '0')).join('');
  return actual === expectedHex;
}
async function registerPerson(role, details) {
  if (!['Male', 'Female', 'Prefer not to say'].includes(details.gender)) throw Error('Choose a gender option to continue.');
  const email = details.email.trim().toLowerCase();
  if (DB.get('users').some(u => u.email.toLowerCase() === email)) throw Error('This email is already registered.');
  const duplicateField = role === 'student' ? 'reg_number' : 'staff_id';
  if (DB.get(role + 's').some(p => p[duplicateField].toLowerCase() === details[duplicateField].trim().toLowerCase())) throw Error(`This ${role === 'student' ? 'registration number' : 'staff ID'} is already registered.`);
  const credentials = await passwordRecord(details.password);
  const user = DB.add('users', { email, role, active: true, ...credentials });
  const { password, ...profile } = details;
  DB.add(role + 's', { user_id: user.user_id, ...profile });
  toast('Registration complete. You can now log in.'); show('login');
}
async function upgradeLegacyPasswords() {
  for (const user of DB.get('users').filter(u => u.password !== undefined)) {
    const credentials = await passwordRecord(user.password);
    DB.set('users', user.user_id, { password: undefined, ...credentials });
  }
  for (const topic of DB.get('topic_submissions', { status: 'Pending' })) DB.set('topic_submissions', topic.submission_id, { status: 'Pending Review' });
}

/* ---------- 7. Listen for clicks and form submits ---------- */
async function run(fn) { try { await fn(); } catch (e) { toast(e.message || String(e), true); console.error(e); } }
document.addEventListener('click', e => {
  const scr = e.target.closest('[data-screen]'); if (scr) { e.preventDefault(); show(scr.dataset.screen); return; }
  const go = e.target.closest('[data-go]'); if (go) { run(() => showPage(go.dataset.go)); return; }
  const b = e.target.closest('[data-act]'); if (b) run(async () => { can(b.dataset.act); await ACT[b.dataset.act](b.dataset, b); });
});
document.addEventListener('submit', e => {
  const f = e.target.closest('[data-form]'); if (!f) return; e.preventDefault();
  const id = f.dataset.id || f.closest('[data-id]')?.dataset.id;
  run(() => { can(f.dataset.form); FORM[f.dataset.form](Object.fromEntries(new FormData(f, e.submitter)), id); });
});
document.addEventListener('change', e => {
  if (e.target.name === 'designation') $('custom-designation-wrap')?.classList.toggle('hidden', e.target.value !== 'Other');
});

/* ---------- 8. Start ---------- */
async function start() {
  try { await upgradeLegacyPasswords(); } catch (error) { console.error(error); }
  const savedId = SS.getItem('fyp_uid');
  const savedUser = savedId && DB.get('users', { user_id: savedId })[0];
  savedUser && savedUser.active !== false ? enter(savedUser) : show('home');
}
start();
