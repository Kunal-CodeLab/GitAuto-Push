# 🚀 GitAuto Push — Zero-Friction Git Automation Tool

[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D%2014.0.0-green.svg)](https://nodejs.org/)
[![Developer](https://img.shields.io/badge/Made%20By-Kunal%20Choudhary-cyan.svg)](#-author)

**GitAuto Push** is a premium, developer-focused automation tool designed to eliminate the friction of managing Git repositories. Built with a stunning dark glassmorphic user interface and powered by a robust Node.js backend, GitAuto Push handles repository initialization, configuration, file tracking, change detection, and pushing to remote repositories—all from a single, unified dashboard.

---

## ✨ Key Features

- 📂 **Local Workspace Scanner**: Scan any folder instantly. Detects whether it is already a Git repository, shows current branch name, checks repository commit history, and tracks pending file modifications, additions, and deletions in real-time.
- ⚙️ **Custom local Git Identity Override**: Easily set custom name and email configurations locally for a project, avoiding common Gmail or account mismatches on shared systems without altering global configurations.
- 📁 **Universal `.gitignore` Auto-Generator**: Automatically creates a highly comprehensive, pre-configured `.gitignore` file mapping environments for Node.js, Python, .NET, Java, Unity, Flutter, system logs, IDE profiles, and security files if one is missing.
- 🪄 **Smart Commit Message Engine**: Analyzes your workspace's porcelain status and suggests descriptive, rule-based commit messages (e.g. `Modify index.html; add style.css`) automatically.
- 🔄 **Safe Remote Syncing (Fetch & Rebase)**: Performs automatic fetch checks before pushing. If the local repository is behind the remote, it executes an automated `git pull --rebase` to merge changes smoothly, auto-aborting on merge conflicts to keep code safe.
- 🛠️ **Quality Validation Pipeline (Pre-push Check)**: Enable and run automated tests or quality validation commands (like `npm test`, `pytest`, `eslint .`) before pushing to verify builds never break.
- 🔐 **Secure PAT Integration**: Input and store Personal Access Tokens (PATs) securely in local browser storage to bypass command-line authentication prompts during push operations.
- 🌍 **GitHub Repository Creator**: Create a brand new public or private repository on GitHub directly from the app interface using GitHub REST API.
- 🔀 **Automated Pull Request (PR) Generator**: Generate a new PR directly from your pushed branches to merge into base branches without opening the browser.
- 🛡️ **Watchdog Mode (Continuous Backup & Sync)**: Monitor local folders continuously in the background. Watches for file modifications and automatically stages, commits, and pushes changes to keep remote backups in sync.
- 📜 **Server-Sent Events (SSE) Live Terminal Logs**: Stream live console execution logs in real-time to a simulated retro CRT terminal on the dashboard.

---

## 🛠️ Technology Stack

- **Frontend**: Responsive HTML5, Vanilla JavaScript, CSS3 custom HSL styling with glassmorphism, dynamic neon indicators, and micro-animations.
- **Backend**: Node.js, Express web server, Server-Sent Events (SSE) log stream, child process spawners.
- **Git Operations**: System git shell hooks, rebase loops, and standard repository controls.

---

## 🚀 Getting Started

### Prerequisites

Make sure you have the following installed on your machine:
- **Node.js** (v14.0.0 or higher)
- **Git** command-line interface

### Installation

1. **Clone or Download the Project**:
   ```bash
   git clone https://github.com/Kunal-CodeLab/GitAuto-Push.git
   cd GitAuto-Push
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Start the Application**:
   ```bash
   npm start
   ```
   Or for hot-reloading development:
   ```bash
   npm run dev
   ```

4. **Access the Web Dashboard**:
   Open your browser and navigate to:
   ```
   http://localhost:5005
   ```

---

## 📖 How to Use

1. **Scan Local Directory**: Paste the absolute path of the directory you wish to track (e.g. `C:\Users\Username\Projects\my-app`) and click **Scan Folder**.
2. **Setup Repository**: If the project lacks a `.git` folder, the tool will initialize it. You can toggle auto-creating a `.gitignore` if needed.
3. **Set Remote GitHub URL**: Input your remote repository URL.
   - *Optional:* If you do not have a repository, click **[+] Or Create New Repo on GitHub**, fill in the token, name, and privacy type, and create it instantly.
4. **Setup Authentication**: Paste your Personal Access Token (PAT) for GitHub. Check **Remember token securely** to save it locally.
5. **Git Push**:
   - Check/update Git Custom Credentials if you want local project authorship overrides.
   - Type a custom commit message or click the **🪄 Suggest Message** button.
   - Check **Run test checks** and input a command (like `npm test`) if you want build validation.
   - Click **Run Git Push Automation**.
6. **Create PR**: Once a push succeeds, a success popup will offer to open the repository on GitHub or create a **Pull Request (PR)** directly.

---

## 📝 GitHub Personal Access Token (PAT) Guide

To use token authentication and bypass browser popup logins:
1. Log in to [GitHub.com](https://github.com).
2. Go to **Settings** &rarr; **Developer Settings** &rarr; **Personal Access Tokens** &rarr; **Tokens (classic)**.
3. Click **Generate new token (classic)**.
4. Set a name, expiration, and select the **`repo`** scope (full control of repositories).
5. Click **Generate Token** and copy the code (begins with `ghp_`).
6. Paste the token into the GitAuto Push interface.

---

## 🤝 Author

Designed, built, and maintained by **Kunal Choudhary**.

Feel free to open issues or pull requests to improve the tool!

---

## 📄 License

This project is open-source and licensed under the [MIT License](LICENSE).
