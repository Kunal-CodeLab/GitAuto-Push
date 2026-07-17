# GitAuto Push - Zero-Friction Git Automation Tool

[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D%2014.0.0-green.svg)](https://nodejs.org/)
[![Developer](https://img.shields.io/badge/Made%20By-Kunal%20Choudhary-cyan.svg)](#author)

GitAuto Push is a professional, developer-focused automation tool designed to streamline local workspace Git operations and repository synchronization. Built with a responsive glassmorphic dark interface and backed by an optimized Node.js server, GitAuto Push handles repository initialization, configuration, change tracking, and remote publishing from a single dashboard.

---

## Key Features

The capabilities of GitAuto Push are structured into four core developer-focused modules:

### 1. Automation & Watchdog Sync

* **Continuous Watchdog Sync (CPU Optimized)**
  Background file watcher automatically commits and syncs changes to remote repositories. Utilizes consolidated ignore rules to maintain zero idle CPU consumption.

* **Concurrent Task Execution Queue**
  Processes manual git push commands and automatic watchdog sync events through an async serialization queue, eliminating `.git/index.lock` write collisions.

* **Dynamic Commit Message Generation**
  Analyzes porcelain statuses dynamically to compile descriptive, file-specific commit summaries automatically.

* **Pre-Push Validation Checks**
  Executes testing or linting commands (like `npm test`, `pytest`) before pushing to prevent shipping broken code.

---

### 2. Smart Gitignore Engine

* **Smart Tech-Stack Auto-Detection**
  Inspects local folder structures dynamically for indicator files (such as `package.json`, `requirements.txt`, `pubspec.yaml`, `build.gradle`, `Assets`, `csproj`) to generate precise, custom-tailored `.gitignore` configurations matching only the active framework.

* **Automated Security Scan & Hardening**
  Scans the directory prior to staging for sensitive files (such as `.pem`, `.key`, `.db`, `.sqlite`, `.sqlite3` files or filenames containing credentials, secret, token, password, config) and automatically appends them to `.gitignore` to prevent accidental remote exposure.

* **Clean Global Ignore Blocks**
  Consolidates and dynamically compiles global defaults (like `.DS_Store`, `Thumbs.db`, `desktop.ini`, `ehthumbs.db`, `.vscode/`, `.idea/`, `.vs/`, `*.suo`, `*.log`) to ignore system editor changes, keeping CPU usage low and avoiding false-positive background backup commits.

* **Interactive .gitignore Editor & Preview UI**
  Integrates a "Preview / Edit" trigger modal in Step 4 that allows developer inspection, editing, and live saving of `.gitignore` configurations directly from the frontend dashboard.

---

### 3. Security & Token Protection

* **Token Leak Prevention (Credential Helper)**
  Injects tokens dynamically using command configuration arguments (`-c credential.helper`) during Git operations instead of saving plaintext credentials inside local `.git/config` remote origin URLs.

* **Secure Token Storage**
  Persists sensitive developer tokens in server-side configuration files protected by gitignore overrides, using front-end masking.

* **Multi-Account Profile Management**
  Configures multiple GitHub profiles (such as `Kunal-CodeLab`, `CoderKunal02`) and securely maps tokens server-side.

* **Repository Creation Modal**
  Prompts users with a popup selection overlay to instantly provision new repositories under any stored GitHub profile.

---

### 4. Developer Experience & Alerts

* **Local Workspace Scanner**
  Scans folders instantly to detect Git status, active branch, commit history, and track unstaged file modifications.

* **Custom Git Identity Override**
  Allows setting custom author names and emails locally to prevent credential mismatches on shared systems.

* **Safe Remote Syncing**
  Pulls and rebases updates automatically before pushing, auto-aborting on merge conflicts.

* **Conflict Alerts & Desktop Notifications**
  Displays glowing alert states in the UI and sends browser desktop notifications when background tasks encounter merge conflicts.

---

## Technical Stack

- **Frontend**: Responsive HTML5, Vanilla JavaScript, CSS3 HSL styling with micro-animations.
- **Backend**: Node.js, Express web server, Server-Sent Events (SSE) live progress streams.
- **Git Hook Engine**: Custom async process wrappers mapping local shell binaries.

---

## Installation & Setup

### Prerequisites

Ensure the following tools are installed:
- **Node.js** (v14.0.0 or higher)
- **Git** command-line utility

### Installation

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/Kunal-CodeLab/GitAuto-Push.git
   cd GitAuto-Push
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Configure Profiles**:
   Add profile tokens inside the server-side configuration file `config.json`:
   ```json
   {
     "githubAccounts": {
       "Kunal-CodeLab": "your-pat-token-here",
       "CoderKunal02": "your-pat-token-here"
     }
   }
   ```

4. **Start the Server**:
   ```bash
   npm start
   ```
   Or for development mode:
   ```bash
   npm run dev
   ```

5. **Access the Application**:
   Navigate to:
   ```
   http://localhost:5005
   ```

---

## Usage Guide

1. **Scan Directory**: Provide the absolute folder path and click **Scan Folder**.
2. **Select Profile**: Choose a pre-configured GitHub profile from the dropdown in Step 4. The raw token field will automatically be masked and secured.
3. **Preview/Edit Ignore List**: Click the **Preview / Edit** button next to the Gitignore checkbox to inspect and modify the generated gitignore rules.
4. **Setup Remote**: Provide the repository remote target. Alternatively, click **Or Create New Repo on GitHub** to trigger the account selector modal and create a new repository instantly.
5. **Push Changes**: Choose manual or auto-generated commit messages, run pre-push test checks if necessary, and click **Run Git Push Automation**.
6. **Create PR**: After push completion, click the option in the success screen to automatically create a Pull Request to merge features into the default branch.

---

## Personal Access Token (PAT) Configuration

To generate credentials:
1. Navigate to **GitHub Settings** > **Developer Settings** > **Personal Access Tokens** > **Tokens (classic)**.
2. Click **Generate new token (classic)**.
3. Grant **`repo`** (and optionally **`workflow`**) scopes.
4. Save the generated key and copy it into the app settings or `config.json`.

---

## Author

Designed, built, and maintained by **Kunal Choudhary**.

---

## License

This project is licensed under the [MIT License](LICENSE).
