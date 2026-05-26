# Polar Xpress Ops — Setup Guide

## Step 1: Open the App (Local)

Open `index.html` in Chrome or Safari. The first time you open it, it will ask you to set PINs for Pranav, Raj, and Tej.

**Set your PINs → Click "Set Up & Start"**

You're in. The app works fully offline from this point. To access from phone, follow Step 3.

---

## Step 2: Connect Google Sheets (Sync)

This lets all data sync to a Google Sheet so you can view it from anywhere and get daily summaries.

### 2a. Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) → click **+ New**
2. Name it: **Polar Xpress Ops Data**
3. Leave it blank — the app will create all the tabs automatically

### 2b. Set Up the Script

1. In the Google Sheet, click **Extensions → Apps Script**
2. Delete all the code in the editor
3. Open the file `Code.gs` from this folder
4. Copy everything and paste it into the Apps Script editor
5. Click **Save** (floppy disk icon)

### 2c. Deploy the Script

1. Click **Deploy → New Deployment**
2. Click the gear icon next to "Select type" → choose **Web App**
3. Set **Execute as**: Me (pranavuppal97@gmail.com)
4. Set **Who has access**: Anyone
5. Click **Deploy**
6. **Copy the Web App URL** — it looks like: `https://script.google.com/macros/s/ABC123.../exec`

### 2d. Paste URL into the App

1. Open the Polar Xpress Ops app
2. Go to **More → Settings**
3. Paste the URL under **Google Sheets Sync**
4. Click **Save URL**

All future entries will now sync to the Google Sheet automatically.

---

## Step 3: Put It on GitHub Pages (Access from Any Device)

### 3a. Create New Repo

1. Go to github.com → Log in as `pranavuppal97-jpg`
2. Click **+ New repository**
3. Name it: `polarxpress-ops`
4. Set it to **Private** (recommended) or Public
5. Click **Create repository**

### 3b. Upload Files

1. On the new repo page, click **uploading an existing file**
2. Drag and drop: `index.html`, `style.css`, `app.js`
3. Click **Commit changes**

### 3c. Enable GitHub Pages

1. In the repo, go to **Settings → Pages**
2. Under Source, select **Deploy from a branch**
3. Select **main** branch, **/ (root)** folder
4. Click **Save**
5. Wait ~1 min → your URL is: `https://pranavuppal97-jpg.github.io/polarxpress-ops/`

**Share this URL with Tej and Raj. Bookmark it on all phones.**

---

## Step 4: Optional — Daily Summary Email

To get a daily email summary (sales, reconciliation, expenses):

1. Open the Apps Script editor
2. Click **Triggers** (clock icon on left sidebar)
3. Click **+ Add Trigger**
4. Function: `sendDailySummary`
5. Event source: **Time-driven**
6. Type: **Day timer**
7. Time: **10pm to 11pm**
8. Click **Save**

You'll get an email every night with that day's totals.

---

## Daily Workflow

```
Morning:
  1. Open app → Clock in
  2. SOPs → Opening Checklist → check off items

During Day:
  → Sales happen via Petpooja

Evening:
  3. Petpooja → Settlement Summary → note the numbers
  4. App → Sales → Enter settlement data
  5. Count cash in drawer
  6. App → Cash Reconciliation → enter denominations
  7. Log any expenses from today
  8. Clock out all staff
  9. SOPs → Closing Checklist → check off items
```

---

## PINs & Access

| Staff | Role | Access |
|-------|------|--------|
| Pranav | Owner | Everything |
| Raj | Owner | Everything |
| Tej | Owner | Everything |
| New hires | Staff | Entry only (no financial summary, no settings) |

To add a new staff member: **Settings → + Add Staff Member**

---

## Troubleshooting

**"Saved locally — will sync when online"** — The Sheets URL isn't set yet, or there's no internet. Data is safe on the device. Set the URL in Settings and click "Sync".

**Wrong PIN** — Go to Settings → Edit the staff member → Change PIN.

**Need to correct today's sales** — Go to Sales → Change the date to today → Re-enter the numbers → Save (it overwrites).

**App lost all data** — Data is in localStorage. Don't clear browser data. Always keep Google Sheets as backup.
