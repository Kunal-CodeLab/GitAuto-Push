# GitAuto Push - Zero-Friction Git Automation Tool

[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D%2014.0.0-green.svg)](https://nodejs.org/)
[![Developer](https://img.shields.io/badge/Made%20By-Kunal%20Choudhary-cyan.svg)](#author)

GitAuto Push is a professional, developer-focused automation tool designed to streamline local workspace Git operations and repository synchronization. Built with a responsive glassmorphic dark interface and backed by an optimized Node.js server, GitAuto Push handles repository initialization, configuration, change tracking, and remote publishing from a single dashboard.

---

## Key Features

- **Local Workspace Scanner**: Scans folders instantly to detect Git status, active branch, commit history, and track unstaged file modifications.
- **Custom Git Identity Override**: Allows setting custom author names and emails locally to prevent credential mismatches on shared systems.
- **Universal `.gitignore` Generator**: Automatically provisions pre-configured rules mapping Node.js, Python, .NET, Java, and other environments if missing.
- **Dynamic Commit Message Generation**: Analyzes porcelain statuses dynamically to compile descriptive, file-specific commit summaries automatically.
- **Multi-Account Profile Management**: Configures multiple GitHub profiles (e.g. Kunal-CodeLab, CoderKunal02) and securely maps tokens server-side.
- **Repository Creation Modal**: Prompts users with a popup selection overlay to instantly provision new repositories under any stored GitHub profile.
- **Pre-Push Validation Checks**: Executes testing or linting commands (like npm test, pytest) before pushing to prevent shipping broken code.
- **Continuous Watchdog Sync (CPU Optimized)**: Background file watcher automatically commits and syncs changes to remote repositories, optimized to ignore dependency and build directories (node_modules, dist, build, .next) for low CPU usage.
- **Safe Remote Syncing**: Pulls and rebases updates automatically before pushing, auto-aborting on merge conflicts.
- **Conflict Alerts & Desktop Notifications**: Displays glowing alert states in the UI and sends browser desktop notifications when background tasks encounter merge conflicts.
- **Non-Blocking Asynchronous Server**: All git execution pipelines run concurrently on asynchronous promises, ensuring the web interface remains fully responsive.
- **Secure Token Storage**: Persists sensitive developer tokens in server-side configuration files protected by gitignore overrides, using front-end masking.

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
3. **Setup Remote**: Provide the repository remote target. Alternatively, click **Or Create New Repo on GitHub** to trigger the account selector modal and create a new repository instantly.
4. **Push Changes**: Choose manual or auto-generated commit messages, run pre-push test checks if necessary, and click **Run Git Push Automation**.
5. **Create PR**: After push completion, click the option in the success screen to automatically create a Pull Request to merge features into the default branch.

---

## Personal Access Token (PAT) Configuration

To generate credentials:
1. Navigate to **GitHub Settings** > **Developer Settings** > **Personal Access Tokens** > **Tokens (classic)**.
2. Click **Generate new token (classic)**.
3. Grant **`repo`** (and optionally **`workflow`**) scopes.
4. Save the generated key and copy it into the app settings.

---

## Author

Designed, built, and maintained by **Kunal Choudhary**.

---

## License

This project is licensed under the [MIT License](LICENSE).
