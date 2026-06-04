# Striver's A2Z Sheet Notes Auto-Sync

Automatically saves your A2Z DSA sheet notes locally as markdown files as you write them.

---

## Disclaimer

This project stores notes created by the user. It does not download or redistribute TakeUForward content and is not affiliated with TakeUForward.

---

## How it works

```
You save a note on TUF → Browser extension intercepts it → Sends to local server → Written to your markdown files
```

Notes are saved as `.md` files, organized exactly like the website:

```
A2Z Sheet Notes/
├── 01. Learn the basics/
│   ├── 04. Know Basic Maths.md
│   ├── 05. Learn Basic Recursion.md
│   └── 06. Learn Basic Hashing.md
├── 02. Learn Important Sorting Techniques/
│   ├── 01. Sorting-I.md
│   └── 02. Sorting-II.md
├── 03. Solve Problems on Arrays/
│   ├── 01. Easy.md
│   ├── 02. Medium.md
│   └── 03. Hard.md
...
```

Each file contains one section per note you've written, with the problem name, difficulty, and LeetCode link as the header.

The server also **auto-refreshes the problem map every 24 hours** from TUF, so if problem IDs change it handles it automatically. If an unknown ID is received, the note is saved to an `_Unknown/` fallback folder so nothing is ever lost.

---

## Files

```
a2z-sheet-notes-server/
├── server.js               — local HTTP server
├── problem_map.json        — maps problem IDs to names/topics (auto-updated)
├── start-server.vbs        — silent background launcher for Windows startup
├── LICENSE
├── .gitignore 
│
├── striver-a2z-sheet-extension-firefox/
│   ├── manifest.json           — Firefox/Zen extension manifest (MV2)
│   └── content.js              — intercepts TUF note saves and forwards to server
│
├── striver-a2z-sheet-extension-chrome/
│   └── extension-chrome/
│       ├── manifest.json           — Chrome extension manifest (MV3)
│       ├── content-main.js         — intercepts TUF note saves (MAIN world)
│       ├── content-extension.js    — bridges to background via postMessage (ISOLATED world)
│       └── background.js           — service worker that calls the local server
```

---

## Browser compatibility

| Browser   | Extension to use                                    |
| --------- | --------------------------------------------------- |
| Zen       | Firefox (`striver-a2z-sheet-extension-firefox.zip`) |
| Firefox   | Firefox (`striver-a2z-sheet-extension-firefox.zip`) |
| Librewolf | Firefox (`striver-a2z-sheet-extension-firefox.zip`) |
| Chrome    | Chrome (`striver-a2z-sheet-extension-chrome.zip`)   |
| Brave     | Chrome (`striver-a2z-sheet-extension-chrome.zip`)   |
| Edge      | Chrome (`striver-a2z-sheet-extension-chrome.zip`)   |

### Why two separate extensions?

Firefox uses **Manifest V2** which allows a single `content.js` to inject scripts directly into the page and also talk to the local server — everything in one file.

Chrome uses **Manifest V3** which is more restrictive — it requires three separate files: one to intercept fetch (MAIN world), one to bridge messages (ISOLATED world), and a background service worker to call the local server.

---

## Setup (one time)

### Step 1: Install Node.js

Download and install from [nodejs.org](https://nodejs.org) (LTS version).

### Step 2: Clone the Repository

```bash
git clone https://github.com/hemakshsoni/strivers-a2z-dsa-sheet-notes-taker.git
```

### Step 3: Enter the folder

```bash
cd strivers-a2z-dsa-sheet-notes-taker
```

### Step 4: Configure the server

Open `server.js` and change line 10 to your actual notes folder path:

```js
const NOTES_PATH = "C:\\Users\\YourUsername\\TUF Notes";
```

> Note the double backslashes — required in JS strings on Windows.

### Step 5: Test the server

Open a terminal in the folder and run:

```bash
node server.js
```

You should see:

```
🚀 Striver's A2Z Sheet Notes server running on http://127.0.0.1:27182
📁 Notes path: C:\Users\YourUsername\TUF Notes
```

Press `Ctrl+C` to stop it for now.

### Step 6: Install the extension

#### Firefox / Zen / Librewolf

1. Go to `about:config` in your browser
2. Search for `xpinstall.signatures.required` and double-click to set it to `false`
3. Go to `about:addons` → gear icon ⚙️ → **Install Add-on From File**
4. Select `striver-a2z-sheet-extension-firefox.zip`
5. The extension is now permanently active ✅

#### Chrome / Brave / Edge

1. Extract the file `striver-a2z-sheet-extension-chrome.zip`. You will get a folder named `extension-chrome` after extraction.
2. Go to `chrome://extensions` (or `brave://extensions` / `edge://extensions`)
3. Enable **Developer mode** (toggle in the top right)
4. Click **"Load unpacked"**
5. Select the `extension-chrome` folder (not the zip)
6. The extension is now active ✅

---

## Auto-start server on Windows login

So the server runs silently in the background without any terminal window.

> Note: In place of `YOUR_FOLDER_PATH_HERE`, write your actual notes folder path wherever mentioned

### Step 1: Edit the VBS launcher

Open `start-server.vbs` file and modify the folder path to match your actual folder location:

```vbscript
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c cd /d YOUR_FOLDER_PATH_HERE && node server.js", 0, False
```

### Step 2: Add to Task Scheduler

1. Press `Win + S` → search **Task Scheduler** → open it
2. Click **"Create Basic Task"** on the right
3. Name: `A2Z Sheet Notes Server`
4. Trigger: **"When I log on"**
5. Action: **"Start a program"**
6. Program/script: `wscript.exe`
7. Add arguments: `YOUR_FOLDER_PATH_HERE`
8. Click Finish

### Step 3: Verify it works

Right-click the task → **"Run"**, then open Task Manager and confirm `node.exe` appears under background processes.

---

## Endpoints

| Endpoint   | Method | Description                         |
| ---------- | ------ | ----------------------------------- |
| `/note`    | POST   | Save a note (called by extension)   |
| `/refresh` | GET    | Force immediate problem map refresh |
| `/ping`    | GET    | Health check                        |

Visit `http://127.0.0.1:27182/ping` in your browser to confirm the server is running.

---

## Troubleshooting

**Toast says "⚠️ Server error"**
→ Check the terminal for error output. Most likely the `NOTES_PATH` in `server.js` is wrong.

**Toast says "❌ Local server not running"**
→ The extension can't reach the server. Make sure `node server.js` is running.

**Note saved but file not updating**
→ Check the terminal — if it says `Unknown problem ID`, visit `http://127.0.0.1:27182/refresh` to force a problem map update.

**Note saved to `_Unknown/` folder**
→ The problem ID wasn't found even after a refresh. The note is safe there — rename the file manually once TUF updates their data.

**Extension not intercepting (Firefox/Zen)**
→ Go to `about:addons` and confirm the extension is listed and enabled.

**Extension not intercepting (Chrome/Brave/Edge)**
→ Go to `chrome://extensions` and confirm the extension is enabled. Also check that Developer mode is still on.

**Server doesn't start on login**
→ Make sure `wscript.exe` is the program in Task Scheduler (not the `.vbs` directly), and the path to the `.vbs` file in the arguments is correct and quoted.
