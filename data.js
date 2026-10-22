/* data.js = the DATABASE of the prototype.
   Everything is saved in the browser (localStorage), so refreshing keeps your data.
   Later, only this file is replaced by Supabase. app.js will stay almost the same. */

const day = n => new Date(Date.now() + n * 864e5).toISOString();   // today +/- n days
const dept = "Software Engineering";

// Starting data. All demo passwords: demo1234
const SEED = {
  users: [
    { user_id: "u1", email: "coordinator@buk.edu.ng", password: "demo1234", role: "coordinator" },
    { user_id: "u2", email: "supervisor@buk.edu.ng", password: "demo1234", role: "supervisor" },
    { user_id: "u3", email: "supervisor2@buk.edu.ng", password: "demo1234", role: "supervisor" },
    { user_id: "u4", email: "student@buk.edu.ng", password: "demo1234", role: "student" },
    { user_id: "u5", email: "student2@buk.edu.ng", password: "demo1234", role: "student" },
    { user_id: "u6", email: "student3@buk.edu.ng", password: "demo1234", role: "student" }
  ],
  coordinators: [{ coordinator_id: "c1", user_id: "u1", name: "Dr. Aisha Bello", staff_id: "SE/C/001", department: dept }],
  supervisors: [
    { supervisor_id: "sp1", user_id: "u2", name: "Dr. Musa Danladi", staff_id: "SE/S/014", department: dept },
    { supervisor_id: "sp2", user_id: "u3", name: "Dr. Hauwa Garba", staff_id: "SE/S/022", department: dept }
  ],
  students: [
    { student_id: "st1", user_id: "u4", name: "Ibrahim Sani", reg_number: "BUK/21/SEN/1001", department: dept, level: "400" },
    { student_id: "st2", user_id: "u5", name: "Zainab Umar", reg_number: "BUK/21/SEN/1002", department: dept, level: "400" },
    { student_id: "st3", user_id: "u6", name: "Abdullahi Lawal", reg_number: "BUK/21/SEN/1003", department: dept, level: "400" }
  ],
  supervisor_assignments: [
    { assignment_id: "a1", student_id: "st1", supervisor_id: "sp1", assigned_at: day(-40), assignment_status: "Active" },
    { assignment_id: "a2", student_id: "st2", supervisor_id: "sp1", assigned_at: day(-40), assignment_status: "Active" }
  ],
  topic_submissions: [
    { submission_id: "t1", student_id: "st1", supervisor_id: "sp1", topic_title: "Online Result Verification System", description: "A web system for checking student results.", status: "Approved", supervisor_feedback: "Good topic.", submitted_at: day(-35), reviewed_at: day(-33) },
    { submission_id: "t2", student_id: "st2", supervisor_id: "sp1", topic_title: "Hostel Allocation System", description: "Allocates hostel rooms to students online.", status: "Pending", supervisor_feedback: "", submitted_at: day(-1), reviewed_at: null }
  ],
  projects: [
    { project_id: "p1", student_id: "st1", supervisor_id: "sp1", title: "Online Result Verification System", description: "A web system for checking student results.", status: "Active", created_at: day(-30) }
  ],
  milestones: [
    { milestone_id: "m1", project_id: "p1", title: "Chapters 1 to 3", description: "", status: "Completed", progress: 100, due_date: day(-10) },
    { milestone_id: "m2", project_id: "p1", title: "System design", description: "", status: "In Progress", progress: 60, due_date: day(15) },
    { milestone_id: "m3", project_id: "p1", title: "Implementation", description: "", status: "In Progress", progress: 35, due_date: day(45) }
  ],
  progress: [],
  documents: [],
  feedback: [{ feedback_id: "f1", project_id: "p1", supervisor_id: "sp1", comment: "Chapter 3 is clear. Start the database design early.", created_at: day(-9) }],
  notifications: []
};

// The name of the ID column in each table (same names as in supabase-schema.sql)
const PK = { users: "user_id", students: "student_id", supervisors: "supervisor_id", coordinators: "coordinator_id", supervisor_assignments: "assignment_id", projects: "project_id", topic_submissions: "submission_id", milestones: "milestone_id", progress: "progress_id", documents: "document_id", feedback: "feedback_id", notifications: "notification_id" };

// Some browsers block storage when a file is opened straight from the computer.
// If that happens, the app still works, but the data is lost when you refresh.
function safeStore(kind) {
  try { const s = window[kind]; s.setItem("__t", "1"); s.removeItem("__t"); return s; }
  catch (e) { const m = {}; return { getItem: k => m[k] ?? null, setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; }
}
const LS = safeStore("localStorage"), SS = safeStore("sessionStorage");

let mem = JSON.parse(LS.getItem("fyp_demo") || "null") || structuredClone(SEED);
const save = () => LS.setItem("fyp_demo", JSON.stringify(mem));

// The 4 functions app.js uses to talk to the database:
const DB = {
  // get("students")  or  get("students", { student_id: "st1" })
  get(table, match = {}) { return mem[table].filter(r => Object.keys(match).every(k => r[k] === match[k])); },
  // add("milestones", { title: "..." })  -> saves a new row and gives it an ID
  add(table, row) { const r = { [PK[table]]: crypto.randomUUID(), ...row }; mem[table].push(r); save(); return r; },
  // set("projects", id, { status: "Done" })  -> changes some fields of one row
  set(table, id, patch) { Object.assign(mem[table].find(r => r[PK[table]] === id), patch); save(); },
  // clears everything and starts again from SEED
  reset() { LS.removeItem("fyp_demo"); location.reload(); }
};
