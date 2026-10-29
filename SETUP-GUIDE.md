# Setup Guide: FYP Tracker (frontend prototype)

A web prototype for the Student, Supervisor and Project Coordinator. Design: HTML and Tailwind CSS. Logic: JavaScript. Data is stored in this browser; Supabase is not connected.

## Folder structure

The current workspace keeps the main scripts beside the HTML. The loader also accepts a `js` subfolder if the files are moved together.

```
SFYPM-Tracking-System/
  index.html
  app.js
  data.js
  preview-single-file.html
  SETUP-GUIDE.md
```

## How to run

1. Use a local server (recommended) so Web Crypto is available for password hashing. In VS Code, install/use the Live Server extension and open `index.html` with it.
2. Click **Login**, then tap a demo account to fill the form. Demo password: `demo1234`.
3. Use **Student registration** or **Supervisor registration** to create a prototype account.

| Role | Email |
|---|---|
| Coordinator | coordinator@buk.edu.ng |
| Supervisor | supervisor@buk.edu.ng |
| Student | student@buk.edu.ng |

Use "Reset demo data" on the login page to start again.

## If the Login button does nothing (step by step)

1. **Use a secure local server.** Open either HTML page through VS Code Live Server; registration and login use Web Crypto and may not work from a `file://` URL. The preview page is standalone but still uses browser storage.
2. **Check the folder.** The current root-level files should look like this:
   ```
  SFYPM-Tracking-System/
     index.html
    app.js
    data.js
    preview-single-file.html
   ```
3. **Open the page served by Live Server.** Do not open it from inside a chat or an email preview.
4. **Refresh without cache.** Press `Ctrl + Shift + R` (on Mac: `Cmd + Shift + R`) so Chrome uses the newest `index.html`.
5. **Read the red banner.** If a red bar appears at the bottom, it tells you the exact problem (file not found, or the error and line number).
6. **Still stuck?** Press `F12`, click the **Console** tab, and copy the red text. Send it with a screenshot.
7. **Use a local server (best way).** In VS Code, install the "Live Server" extension, right-click `index.html`, and choose "Open with Live Server".

If browser storage is blocked, the app can use temporary in-memory data that will not survive refresh. A secure browser context is required for registration and login. Older demo passwords are upgraded to PBKDF2 verifiers at startup when supported.

## How the three files are connected

- `index.html` has the design. Every important part has an **id** (for example `id="c-projects"` or `id="as-student"`).
- `app.js` finds a part by its id and puts data inside it: `$('c-projects')`.
- `data.js` gives app.js browser-stored data: `DB.get('students')`, `DB.add(...)`, `DB.set(...)`.

Buttons use `data-act="name"` and forms use `data-form="name"`. Each name matches a function in `app.js`, inside `ACT` (buttons) or `FORM` (forms).

## How to make changes

| I want to... | Where |
|---|---|
| Change text or a heading | `index.html`, edit the words |
| Change the colours | `tailwind.config` at the top of `index.html` (`brand`, `ink`, `paper`) |
| Change how all cards or buttons look | the `<style type="text/tailwindcss">` block at the top of `index.html` (`.card`, `.btn`, `.inp`) |
| Change the logo | the `<symbol id="logo">` block at the top of `<body>` |
| Add a profile field | add a named control in the registration form in `index.html`, validate and persist it in `FORM` in `app.js`, and display it in the appropriate profile details |
| Add a new page | add a `<section data-page="my-page" class="hidden">`, add a sidebar button with `data-go="my-page"`, and add `'my-page'() { ... }` inside `RENDER` in `app.js` |
| Change demo users or topics | `SEED` in `data.js` |
| Change the progress rule | `pstatus()` in `app.js` (the 5 means 5 percentage points) |

Templates (`<template id="tpl-...">`) are designs that JavaScript copies for each item, such as each topic or milestone. Edit the design there and every copy changes.

## Progress rule

Expected progress for each milestone is elapsed time from project start to its deadline, clamped to 0-100%. Overall actual and expected progress are unweighted milestone averages. A difference greater than 5 percentage points determines Ahead of Schedule or Behind Schedule; otherwise the project is On Track. With no milestones, status is Not Started and percentages are omitted. All milestones at 100% is Completed. Invalid/missing dates are shown as N/A when a comparison cannot be calculated. Milestone status (Not Started, In Progress, Completed) remains separate.

Each student progress submission is appended to the `progress` records with timestamp and submitting user, while the latest percentage is copied to the milestone for dashboard summaries. Supervisor project views show the progress history.

## Documents

The prototype stores document metadata in `localStorage` and file bytes in browser `IndexedDB`. It accepts PDF, DOC/DOCX, PPT/PPTX, JPG/JPEG, and PNG files up to 10 MB. Files can be opened/downloaded only in the same browser profile and origin where they were uploaded. Clearing browser site data, using another browser/device, or browser storage eviction can make the local file unavailable. Old demo records that contain only a filename are metadata, not uploaded files.

## Supabase boundary

No Supabase project is configured, and no SQL or migrations have been applied. Before production, connect Supabase Auth, persist profiles and academic records in database tables, and enforce role and record permissions with RLS and secure backend operations. Use a private Supabase Storage bucket with policies scoped to the student's project and currently assigned Supervisor; issue authorized access through authenticated storage operations or short-lived signed URLs. Do not expose service-role credentials. Browser-side role checks and IndexedDB files are prototype behavior only and are not shared or production authorization.

## Known limits of the prototype

- Data and registration accounts are saved only in this browser's `localStorage`; they are not shared across browsers or devices.
- Passwords use PBKDF2 verifiers in browser storage, but browser-only account or role management is not production-secure. Demo credentials are public and for demonstration only.
- Document metadata is in browser `localStorage` and document bytes are local to that browser in IndexedDB; only Supabase Storage can provide cross-device sharing. Old filename-only demo document entries have no retrievable file bytes.
- Account activation management, verified email ownership, password reset and production authorization require backend integration.
- The `deadlines` table exists in the schema but has no screen yet.
- Notifications show inside the system only. There is no email.
