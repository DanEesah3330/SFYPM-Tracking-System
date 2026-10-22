# Setup Guide: FYP Tracker (Version 2, frontend only)

A web prototype for the Student, Supervisor and Project Coordinator. Design: HTML and Tailwind CSS. Logic: JavaScript. Data: `data.js` for now, Supabase later.

## Folder structure

Keep it exactly like this. `data.js` and `app.js` must be inside a folder named `js`.

```
fyp-tracker-v2/
  index.html             all screens (home, login, dashboard) and the designs
  js/
    data.js              the database (demo data in the browser)
    app.js               the logic (what happens when you click or submit)
  supabase-schema.sql    database tables for later
  SETUP-GUIDE.md         this guide
```

## How to run

1. Open `index.html` in Chrome (double-click it). Do not double-click the `.js` files. They run by themselves when the page opens.
2. Click **Login**, then tap a demo account to fill the form. Password for all: `demo1234`.

| Role | Email |
|---|---|
| Coordinator | coordinator@buk.edu.ng |
| Supervisor | supervisor@buk.edu.ng |
| Student | student@buk.edu.ng |

Use "Reset demo data" on the login page to start again.

## If the Login button does nothing (step by step)

1. **Use a computer and Chrome.** Phones often cannot load local files properly. If you only have a phone, open `preview-single-file.html` instead.
2. **Check the folder.** It should look like this (the loader also accepts all three files in one folder):
   ```
   fyp-tracker-v2/
     index.html
     js/data.js
     js/app.js
   ```
3. **Open `index.html` by double-clicking it.** Do not open it from inside a chat or an email preview.
4. **Refresh without cache.** Press `Ctrl + Shift + R` (on Mac: `Cmd + Shift + R`) so Chrome uses the newest `index.html`.
5. **Read the red banner.** If a red bar appears at the bottom, it tells you the exact problem (file not found, or the error and line number).
6. **Still stuck?** Press `F12`, click the **Console** tab, and copy the red text. Send it with a screenshot.
7. **Use a local server (best way).** In VS Code, install the "Live Server" extension, right-click `index.html`, and choose "Open with Live Server".

If your browser blocks storage for local files, the app still works, but demo data resets when you refresh.

## How the three files are connected

- `index.html` has the design. Every important part has an **id** (for example `id="c-projects"` or `id="as-student"`).
- `app.js` finds a part by its id and puts data inside it: `$('c-projects')`.
- `data.js` gives app.js the data: `DB.get('students')`, `DB.add(...)`, `DB.set(...)`.

Buttons use `data-act="name"` and forms use `data-form="name"`. Each name matches a function in `app.js`, inside `ACT` (buttons) or `FORM` (forms).

## How to make changes

| I want to... | Where |
|---|---|
| Change text or a heading | `index.html`, edit the words |
| Change the colours | `tailwind.config` at the top of `index.html` (`brand`, `ink`, `paper`) |
| Change how all cards or buttons look | the `<style type="text/tailwindcss">` block at the top of `index.html` (`.card`, `.btn`, `.inp`) |
| Change the logo | the `<symbol id="logo">` block at the top of `<body>` |
| Add a field to a form | add an `<input name="...">` in `index.html`, then use `d.name` in the matching `FORM` function in `app.js` |
| Add a new page | add a `<section data-page="my-page" class="hidden">`, add a sidebar button with `data-go="my-page"`, and add `'my-page'() { ... }` inside `RENDER` in `app.js` |
| Change demo users or topics | `SEED` in `data.js` |
| Change the progress rule | `pstatus()` in `app.js` (the 5 means 5 percentage points) |

Templates (`<template id="tpl-...">`) are designs that JavaScript copies for each item, such as each topic or milestone. Edit the design there and every copy changes.

## Progress rule

Expected progress of a milestone is the share of time passed between the project start and its deadline. The average actual progress is compared with the average expected progress. More than 5 points above is Ahead of Schedule. More than 5 points below is Behind Schedule. Anything else is On Track. When all milestones are 100%, the project is Completed.

## Next step: Supabase

1. Create a Supabase project and run `supabase-schema.sql` in the SQL Editor.
2. Replace `data.js` with a Supabase version of `DB.get`, `DB.add` and `DB.set`. These will become `async`, so `app.js` will get `await` in front of each `DB` call. We will do this step by step.
3. Replace the demo login with Supabase Auth, and write Row Level Security rules for each role before real use.

## Known limits of the prototype

- Data is saved only in your browser, and passwords are plain text in the demo. This is for demo use only.
- Uploaded documents save only the file name.
- The `deadlines` table exists in the schema but has no screen yet.
- Notifications show inside the system only. There is no email.
