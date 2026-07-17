const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { spawn, execSync, exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 5005;

// Disable interactive Git prompts and credential manager popups globally
process.env.GIT_TERMINAL_PROMPT = '0';
process.env.GCM_INTERACTIVE = 'never';

// Global map to hold active backup watchers
const backupWatchers = new Map();

// Lightweight task queue to serialize Git operations and prevent locks (.git/index.lock)
class GitQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
  }

  enqueue(taskFn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ taskFn, resolve, reject });
      this.processNext();
    });
  }

  async processNext() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;
    const { taskFn, resolve, reject } = this.queue.shift();

    try {
      const result = await taskFn();
      resolve(result);
    } catch (err) {
      reject(err);
    } finally {
      this.processing = false;
      setImmediate(() => this.processNext());
    }
  }
}

const gitQueue = new GitQueue();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper to run commands synchronously and get output (useful for quick checks)
function runCmdSync(cmd, cwd = process.cwd()) {
  try {
    return execSync(cmd, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
  } catch (error) {
    return '';
  }
}

// Helper to check if Git is installed
function checkGitInstalled() {
  try {
    execSync('git --version');
    return true;
  } catch (e) {
    return false;
  }
}

// Helper to run commands asynchronously and get output
function runCmdAsync(cmd, cwd = process.cwd()) {
  return new Promise((resolve) => {
    exec(cmd, { cwd, encoding: 'utf8' }, (error, stdout) => {
      resolve(error ? '' : stdout.trim());
    });
  });
}

// Helper to check if Git is installed asynchronously
function checkGitInstalledAsync() {
  return new Promise((resolve) => {
    exec('git --version', (error) => {
      resolve(!error);
    });
  });
}

// Helper to get stored GitHub PAT token from server-side config file based on account name
function getStoredTokenForAccount(accountName, fallbackToken) {
  try {
    const configPath = path.join(__dirname, 'config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (accountName && config.githubAccounts && config.githubAccounts[accountName]) {
        return config.githubAccounts[accountName];
      }
      if (config.githubAccounts) {
        const accounts = Object.keys(config.githubAccounts);
        if (accounts.length > 0) {
          if (fallbackToken && fallbackToken !== '••••••••••••••••••••' && fallbackToken.trim() !== '') {
            return fallbackToken;
          }
          return config.githubAccounts[accountName || accounts[0]] || '';
        }
      }
      return config.githubToken || '';
    }
  } catch (e) {}
  return fallbackToken || '';
}

// Helper to compile gitignore rules into regular expressions
function compileGitignoreRules(resolvedPath) {
  const gitignorePath = path.join(resolvedPath, '.gitignore');
  const rules = [];
  
  const parseRule = (line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) return;

    let pattern = trimmed;
    const isRootRelative = pattern.startsWith('/');
    if (isRootRelative) {
      pattern = pattern.substring(1);
    }

    const isDirOnly = pattern.endsWith('/');
    if (isDirOnly) {
      pattern = pattern.slice(0, -1);
    }

    let regexParts = pattern
      .replace(/[-\/\\^$*+?.()|[\]{}]/g, (match) => {
        if (match === '*') return '.*';
        if (match === '?') return '.';
        if (match === '/') return '\\/';
        return '\\' + match;
      });

    let regexStr = '';
    if (isRootRelative) {
      regexStr = '^' + regexParts;
    } else {
      regexStr = '(^|\\/)' + regexParts;
    }
    regexStr += '(\\/|$)';

    try {
      rules.push({
        raw: trimmed,
        regex: new RegExp(regexStr)
      });
    } catch (e) {
      // Ignore invalid regex
    }
  };

  // Default rules that we always ignore globally (OS and IDEs)
  const defaultRules = [
    '.git/',
    'node_modules/',
    'dist/',
    'build/',
    '.next/',
    '.DS_Store',
    'Thumbs.db',
    'desktop.ini',
    'ehthumbs.db',
    '.vscode/',
    '.idea/',
    '.vs/',
    '*.suo',
    '*.log'
  ];
  defaultRules.forEach(parseRule);

  if (fs.existsSync(gitignorePath)) {
    try {
      const content = fs.readFileSync(gitignorePath, 'utf8');
      const lines = content.split(/\r?\n/);
      lines.forEach(parseRule);
    } catch (e) {
      console.error('Failed to read gitignore for rules:', e);
    }
  }

  return rules;
}

// Helper to dynamically detect tech stack of a directory
function detectTechStack(resolvedPath) {
  const stack = [];
  try {
    // 1. Node.js / Web
    if (fs.existsSync(path.join(resolvedPath, 'package.json')) || fs.existsSync(path.join(resolvedPath, 'package-lock.json'))) {
      stack.push('node');
    }
    
    // 2. Python
    if (fs.existsSync(path.join(resolvedPath, 'requirements.txt')) || 
        fs.existsSync(path.join(resolvedPath, 'Pipfile')) || 
        fs.existsSync(path.join(resolvedPath, 'pyproject.toml')) || 
        (fs.existsSync(resolvedPath) && fs.readdirSync(resolvedPath).some(file => file.endsWith('.py')))) {
      stack.push('python');
    }
    
    // 3. Flutter
    if (fs.existsSync(path.join(resolvedPath, 'pubspec.yaml')) || fs.existsSync(path.join(resolvedPath, '.metadata'))) {
      stack.push('flutter');
    }
    
    // 4. Java / Gradle / Maven
    if (fs.existsSync(path.join(resolvedPath, 'pom.xml')) || 
        fs.existsSync(path.join(resolvedPath, 'build.gradle')) || 
        fs.existsSync(path.join(resolvedPath, 'gradlew')) || 
        fs.existsSync(path.join(resolvedPath, 'settings.gradle'))) {
      stack.push('java');
    }
    
    // 5. Unity
    if (fs.existsSync(path.join(resolvedPath, 'Assets')) && fs.existsSync(path.join(resolvedPath, 'ProjectSettings'))) {
      stack.push('unity');
    }

    // 6. .NET / C#
    if (fs.existsSync(resolvedPath) && fs.readdirSync(resolvedPath).some(file => file.endsWith('.csproj') || file.endsWith('.sln'))) {
      stack.push('dotnet');
    }
  } catch (e) {
    console.error('Error detecting tech stack:', e);
  }
  return stack;
}

// Helper to construct customized gitignore rules based on detected stack
function buildGitignoreContent(resolvedPath) {
  const GITIGNORE_SECTIONS = {
    header: `# ==========================================\n` +
            `# AUTOMATICALLY GENERATED GITIGNORE (GITAUTO PUSH)\n` +
            `# ==========================================\n\n`,
    system: `# --- OS & System Files ---\n` +
            `.DS_Store\n` +
            `.DS_Store?\n` +
            `._*\n` +
            `.Spotlight-V100\n` +
            `.Trashes\n` +
            `ehthumbs.db\n` +
            `Thumbs.db\n` +
            `desktop.ini\n` +
            `$RECYCLE.BIN/\n\n` +
            `# --- Environment & Secret Keys (Credentials) ---\n` +
            `.env\n` +
            `.env.local\n` +
            `.env.development.local\n` +
            `.env.test.local\n` +
            `.env.production.local\n` +
            `.env*.local\n` +
            `*.pem\n` +
            `*.key\n` +
            `*.pub\n` +
            `*.pfx\n` +
            `*.p12\n` +
            `*.cer\n` +
            `*.crt\n` +
            `*.der\n` +
            `credentials.json\n` +
            `client_secret.json\n` +
            `config.json\n\n` +
            `# --- IDEs, Editors & User Settings ---\n` +
            `.vscode/\n` +
            `!.vscode/extensions.json\n` +
            `!.vscode/launch.json\n` +
            `!.vscode/tasks.json\n` +
            `!.vscode/settings.json\n` +
            `.idea/\n` +
            `*.iws\n` +
            `*.suo\n` +
            `*.ntvs*\n` +
            `*.njsproj\n` +
            `*.swp\n` +
            `*.swo\n` +
            `*.user\n` +
            `*.userosscache\n` +
            `*.sln.docstates\n` +
            `.vs/\n` +
            `.history/\n` +
            `.project\n` +
            `.classpath\n` +
            `.settings/\n\n`,
    node:   `# --- Web & Node.js Build Outputs ---\n` +
            `node_modules/\n` +
            `jspm_packages/\n` +
            `web_modules/\n` +
            `bower_components/\n` +
            `dist/\n` +
            `build/\n` +
            `out/\n` +
            `.next/\n` +
            `.nuxt/\n` +
            `.cache/\n` +
            `.eslintcache\n` +
            `.stylelintcache\n` +
            `.parcel-cache\n` +
            `.yarn-cache/\n` +
            `.pnpm-store/\n` +
            `npm-debug.log*\n` +
            `yarn-debug.log*\n` +
            `yarn-error.log*\n` +
            `pnpm-debug.log*\n\n`,
    python: `# --- Python Build & Virtual Envs ---\n` +
            `__pycache__/\n` +
            `*.py[cod]\n` +
            `*$py.class\n` +
            `.Python\n` +
            `env/\n` +
            `venv/\n` +
            `.venv/\n` +
            `ENV/\n` +
            `env.bak/\n` +
            `venv.bak/\n` +
            `pip-log.txt\n` +
            `pip-delete-this-directory.txt\n` +
            `.ipynb_checkpoints\n` +
            `.mypy_cache/\n` +
            `.pytest_cache/\n` +
            `.tox/\n\n`,
    dotnet: `# --- .NET Build Outputs (C# / F#) ---\n` +
            `[Bb]in/\n` +
            `[Oo]bj/\n` +
            `[Rr]elease/\n` +
            `[Dd]ebug/\n` +
            `*.userprefs\n` +
            `*.usertasks\n` +
            `*.pdb\n\n`,
    java:   `# --- Java, Kotlin & Gradle Build Outputs ---\n` +
            `.gradle/\n` +
            `/build/\n` +
            `!/src/**/build/\n` +
            `.gradletasknamecache\n` +
            `/target/\n` +
            `pom.xml.tag\n` +
            `pom.xml.releaseBackup\n` +
            `pom.xml.next\n` +
            `release.properties\n` +
            `*.class\n\n`,
    flutter:`# --- Flutter Build Outputs ---\n` +
            `.dart_tool/\n` +
            `.packages\n` +
            `.flutter-plugins\n` +
            `.flutter-plugins-dependencies\n` +
            `.pub-cache/\n` +
            `.pub/\n\n`,
    unity:  `# --- Unity & Game Dev Build Outputs ---\n` +
            `/[Ll]ibrary/\n` +
            `/[Tt]emp/\n` +
            `/[Oo]bj/\n` +
            `/[Bb]uild/\n` +
            `/[Bb]uilds/\n` +
            `/[Ll]ogs/\n` +
            `/[MemoryCaptures]/\n` +
            `Assets/AssetStoreTools*\n\n`,
    logs:   `# --- Logs & Databases ---\n` +
            `*.log\n` +
            `*.sqlite\n` +
            `*.sqlite3\n` +
            `*.db\n` +
            `*.mdb\n` +
            `*.ldf\n` +
            `*.sql\n` +
            `*.dmp\n`
  };

  let content = GITIGNORE_SECTIONS.header + GITIGNORE_SECTIONS.system;
  const detectedStack = detectTechStack(resolvedPath);
  
  if (detectedStack.length === 0) {
    // Fallback: Node.js (highly common)
    content += GITIGNORE_SECTIONS.node;
  } else {
    detectedStack.forEach(stackKey => {
      if (GITIGNORE_SECTIONS[stackKey]) {
        content += GITIGNORE_SECTIONS[stackKey];
      }
    });
  }
  content += GITIGNORE_SECTIONS.logs;
  return { content, stack: detectedStack };
}

// Helper function to recursively find and auto-ignore sensitive files
function performSecurityHardening(resolvedPath, logFn) {
  const gitignorePath = path.join(resolvedPath, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    return;
  }

  try {
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
    const existingRules = gitignoreContent.split(/\r?\n/).map(line => line.trim());

    // Helper to recursively list all files in directory up to depth 4
    const getFiles = (dir, depth = 0) => {
      if (depth > 4) return [];
      let results = [];
      try {
        const list = fs.readdirSync(dir);
        list.forEach(file => {
          const fullPath = path.join(dir, file);
          const stat = fs.statSync(fullPath);
          const relativePath = path.relative(resolvedPath, fullPath).replace(/\\/g, '/');

          // Skip default directories
          if (
            file === '.git' ||
            file === 'node_modules' ||
            file === 'dist' ||
            file === 'build' ||
            file === '.next'
          ) {
            return;
          }

          if (stat && stat.isDirectory()) {
            results = results.concat(getFiles(fullPath, depth + 1));
          } else {
            results.push({ name: file, relPath: relativePath });
          }
        });
      } catch (e) {
        // Skip unreadable files or folders
      }
      return results;
    };

    const allFiles = getFiles(resolvedPath);
    const sensitiveFilesToIgnore = [];

    const sensitiveExtensions = ['.key', '.pem', '.db', '.sqlite', '.sqlite3', '.pfx', '.p12'];
    const sensitiveKeywords = ['secret', 'config', 'token', 'password', 'credential'];
    const codeExtensions = ['.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.cs', '.cpp', '.c', '.h', '.html', '.css', '.md'];

    allFiles.forEach(file => {
      const ext = path.extname(file.name).toLowerCase();
      const fullNameLower = file.name.toLowerCase();

      // Don't auto-ignore core code files to avoid breaking projects
      if (codeExtensions.includes(ext)) {
        return;
      }

      let isSensitive = false;

      // Check extensions
      if (sensitiveExtensions.includes(ext)) {
        isSensitive = true;
      }

      // Check keywords
      if (!isSensitive) {
        isSensitive = sensitiveKeywords.some(keyword => {
          return fullNameLower.includes(keyword);
        });
      }

      if (isSensitive) {
        // Check if it's already ignored in some form in .gitignore
        const isAlreadyIgnored = existingRules.some(rule => {
          if (!rule || rule.startsWith('#')) return false;
          return rule === file.relPath || rule === file.name || rule === `*${ext}`;
        });

        if (!isAlreadyIgnored) {
          sensitiveFilesToIgnore.push(file.relPath);
        }
      }
    });

    if (sensitiveFilesToIgnore.length > 0) {
      logFn(`[SECURITY] Auto-detected ${sensitiveFilesToIgnore.length} sensitive file(s) that might leak: ${sensitiveFilesToIgnore.join(', ')}`);
      logFn(`[SECURITY] Automatically appending these paths to .gitignore for leak prevention.`);
      
      let appendStr = '\n\n# --- Auto-detected Sensitive Credentials & Database Files ---\n';
      sensitiveFilesToIgnore.forEach(relPath => {
        appendStr += `${relPath}\n`;
      });
      
      fs.appendFileSync(gitignorePath, appendStr, 'utf8');
    }
  } catch (err) {
    console.error('Error during security scan:', err);
  }
}

// Helper to generate rule-based commit message suggestions
function generateSuggestedCommitMessage(fileChanges, hasCommits) {
  if (!hasCommits) {
    return 'Initial commit via GitAuto Push';
  }
  if (!fileChanges || fileChanges.total === 0) {
    return 'Minor updates';
  }
  
  const modifiedNames = [];
  const addedNames = [];
  const deletedNames = [];
  
  fileChanges.files.forEach(file => {
    const baseName = path.basename(file.path);
    if (file.code.includes('M')) {
      modifiedNames.push(baseName);
    } else if (file.code.includes('??') || file.code.includes('A')) {
      addedNames.push(baseName);
    } else if (file.code.includes('D')) {
      deletedNames.push(baseName);
    }
  });
  
  let parts = [];
  if (modifiedNames.length > 0) {
    const listStr = modifiedNames.slice(0, 2).join(', ');
    const extra = modifiedNames.length > 2 ? ` (+${modifiedNames.length - 2} more)` : '';
    parts.push(`modify ${listStr}${extra}`);
  }
  if (addedNames.length > 0) {
    const listStr = addedNames.slice(0, 2).join(', ');
    const extra = addedNames.length > 2 ? ` (+${addedNames.length - 2} more)` : '';
    parts.push(`add ${listStr}${extra}`);
  }
  if (deletedNames.length > 0) {
    const listStr = deletedNames.slice(0, 2).join(', ');
    const extra = deletedNames.length > 2 ? ` (+${deletedNames.length - 2} more)` : '';
    parts.push(`delete ${listStr}${extra}`);
  }
  
  if (parts.length === 0) {
    return `Update project files (${fileChanges.total} changes)`;
  }
  
  const desc = parts.join('; ');
  return desc.charAt(0).toUpperCase() + desc.slice(1);
}

// Endpoint to check path details
app.post('/api/check-path', async (req, res) => {
  const { dirPath } = req.body;

  if (!dirPath) {
    return res.status(400).json({ error: 'Directory path is required' });
  }

  // Resolve environment variables if any (e.g. %USERPROFILE%)
  let resolvedPath = dirPath.trim();
  if (resolvedPath.startsWith('%')) {
    const envVar = resolvedPath.split('\\')[0].replace(/%/g, '');
    if (process.env[envVar]) {
      resolvedPath = resolvedPath.replace(`%${envVar}%`, process.env[envVar]);
    }
  }

  // Check if directory exists
  if (!fs.existsSync(resolvedPath)) {
    return res.json({ exists: false });
  }

  const stat = fs.statSync(resolvedPath);
  if (!stat.isDirectory()) {
    return res.status(400).json({ error: 'Path exists but is not a directory' });
  }

  const isGitRepo = fs.existsSync(path.join(resolvedPath, '.git'));
  
  // Get Git configs asynchronously (non-blocking)
  const globalName = await runCmdAsync('git config --global user.name');
  const globalEmail = await runCmdAsync('git config --global user.email');
  
  let localName = '';
  let localEmail = '';
  let currentBranch = '';
  let hasCommits = false;
  let remoteUrl = '';
  let fileChanges = { modified: 0, untracked: 0, deleted: 0, total: 0, files: [] };

  if (isGitRepo) {
    localName = await runCmdAsync('git config --local user.name', resolvedPath);
    localEmail = await runCmdAsync('git config --local user.email', resolvedPath);
    currentBranch = (await runCmdAsync('git branch --show-current', resolvedPath)) || 'main';
    
    // Auto-detect Remote URL
    remoteUrl = await runCmdAsync('git remote get-url origin', resolvedPath);
    if (remoteUrl) {
      // Mask credentials/PAT if they are embedded in remote URL
      remoteUrl = remoteUrl.replace(/https?:\/\/[^@\n]+@/g, 'https://');
    }

    // Get live file changes status preview
    const statusOutput = await runCmdAsync('git status --porcelain', resolvedPath);
    if (statusOutput) {
      const lines = statusOutput.split('\n');
      lines.forEach(line => {
        if (!line || line.trim() === '') return;
        fileChanges.total++;
        const code = line.substring(0, 2);
        const filePath = line.substring(3).trim();
        
        if (fileChanges.files.length < 10) {
          fileChanges.files.push({ code: code.trim(), path: filePath });
        }
        
        if (code.includes('M')) {
          fileChanges.modified++;
        } else if (code.includes('??')) {
          fileChanges.untracked++;
        } else if (code.includes('D')) {
          fileChanges.deleted++;
        }
      });
    }

    // Check if repo has any commits asynchronously
    hasCommits = await new Promise((resolve) => {
      exec('git rev-parse --verify HEAD', { cwd: resolvedPath }, (error) => {
        resolve(!error);
      });
    });
  }

  return res.json({
    exists: true,
    isGitRepo,
    resolvedPath,
    globalConfig: {
      name: globalName || 'Not configured',
      email: globalEmail || 'Not configured'
    },
    localConfig: {
      name: localName || null,
      email: localEmail || null
    },
    currentBranch: currentBranch || 'main',
    hasCommits,
    suggestedCommitMessage: generateSuggestedCommitMessage(fileChanges, hasCommits),
    remoteUrl: remoteUrl || null,
    fileChanges
  });
});

// Stream operations progress via Server-Sent Events (SSE)
app.get('/api/git-push', (req, res) => {
  const {
    dirPath,
    repoUrl,
    email,
    username,
    token,
    commitMessage,
    branch,
    forcePush,
    createGitignore,
    prePushCmd,
    githubAccount
  } = req.query;

  let tokenVal = token;
  if (!tokenVal || tokenVal.trim() === '' || tokenVal === '••••••••••••••••••••' || githubAccount !== 'custom') {
    tokenVal = getStoredTokenForAccount(githubAccount, token);
  }

  // Set SSE Headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  const sendEvent = (type, data) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  };

  const sendLog = (text) => {
    sendEvent('log', { text });
  };

  const sendStep = (stepName, status, errorMsg = '') => {
    sendEvent('step', { name: stepName, status, error: errorMsg });
  };

  if (!dirPath || !repoUrl) {
    sendEvent('complete', { status: 'failed', message: 'Missing directory path or repository URL' });
    res.end();
    return;
  }

  if (!checkGitInstalled()) {
    sendEvent('complete', { status: 'failed', message: 'Git is not installed or not in PATH' });
    res.end();
    return;
  }

  // Resolve directory path
  let resolvedPath = dirPath.trim();
  if (resolvedPath.startsWith('%')) {
    const envVar = resolvedPath.split('\\')[0].replace(/%/g, '');
    if (process.env[envVar]) {
      resolvedPath = resolvedPath.replace(`%${envVar}%`, process.env[envVar]);
    }
  }

  if (!fs.existsSync(resolvedPath)) {
    sendEvent('complete', { status: 'failed', message: `Directory does not exist: ${resolvedPath}` });
    res.end();
    return;
  }
  
  // Helper function to run command as promise with live stdout/stderr
  const runCommand = (cmd, args, stepName) => {
    return new Promise((resolve, reject) => {
      sendLog(`$ git ${args.join(' ')}`);
      
      // Mask token in output for logs
      const maskToken = (str) => {
        if (!tokenVal) return str;
        return str.replace(new RegExp(tokenVal, 'g'), 'ghp_******');
      };

      const finalArgs = (cmd === 'git')
        ? (tokenVal
            ? ['-c', 'credential.helper=', '-c', `credential.helper="!echo username=token; echo password=${tokenVal.trim()}; #"`, ...args]
            : ['-c', 'credential.helper=', ...args])
        : args;
      const proc = spawn(cmd, finalArgs, { cwd: resolvedPath, shell: true });
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        sendLog(maskToken(chunk));
      });

      proc.stderr.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;
        sendLog(maskToken(chunk));
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject({ code, stdout, stderr });
        }
      });

      proc.on('error', (err) => {
        reject({ code: -1, stdout: '', stderr: err.message });
      });
    });
  };

  // Run the sequence of automation steps
  async function execute() {
    let credOpts = '-c credential.helper=';
    if (tokenVal && tokenVal.trim()) {
      credOpts = `-c credential.helper= -c credential.helper="!echo username=token; echo password=${tokenVal.trim()}; #"`;
    }
    try {
      // --- PRE-PUSH QUALITY CHECKS ---
      if (prePushCmd && prePushCmd.trim()) {
        sendLog(`[INFO] Running Pre-Push Validation Command: "${prePushCmd.trim()}"`);
        try {
          execSync(prePushCmd.trim(), { cwd: resolvedPath, stdio: 'pipe' });
          sendLog(`[INFO] Pre-Push validation checks passed!`);
        } catch (cmdErr) {
          const errMsg = cmdErr.stderr || cmdErr.stdout || cmdErr.message || '';
          sendLog(`[ERROR] Pre-Push validation checks failed: ${errMsg}`);
          sendEvent('complete', { status: 'failed', message: 'Pre-Push checks failed. Aborting push.' });
          res.end();
          return;
        }
      }

      const isGitRepo = fs.existsSync(path.join(resolvedPath, '.git'));
      const targetBranch = branch ? branch.trim() : 'main';
      let msg = commitMessage ? commitMessage.trim() : 'Initial commit via GitAuto Push';

      // --- STEP 1: Init Git ---
      sendStep('init', 'running');
      if (!isGitRepo) {
        sendLog('Initializing a new local Git repository...');
        await runCommand('git', ['init'], 'init');
        sendStep('init', 'success');
      } else {
        sendLog('Git repository already initialized. Skipping init.');
        sendStep('init', 'success');
      }

      // --- STEP 2: Configure Local Identity ---
      sendStep('config', 'running');
      if (username && username.trim()) {
        sendLog(`Setting local username to: ${username}`);
        await runCommand('git', ['config', '--local', 'user.name', `"${username.trim()}"`], 'config');
      }
      if (email && email.trim()) {
        sendLog(`Setting local email to: ${email}`);
        await runCommand('git', ['config', '--local', 'user.email', `"${email.trim()}"`], 'config');
      }
      
      // Display configured identity in logs
      const localUser = runCmdSync('git config user.name', resolvedPath);
      const localEmail = runCmdSync('git config user.email', resolvedPath);
      sendLog(`Active Git Identity for this repository: Name="${localUser}", Email="${localEmail}"`);
      sendStep('config', 'success');

      // --- STEP 2.5: Auto Create .gitignore ---
      if (createGitignore === 'true') {
        const gitignorePath = path.join(resolvedPath, '.gitignore');
        if (!fs.existsSync(gitignorePath)) {
          const { content: customGitignore, stack } = buildGitignoreContent(resolvedPath);
          sendLog(`[INFO] No .gitignore detected. Auto-detected project stacks: ${stack.join(', ') || 'none (defaulted to Web)'}.`);
          sendLog('Creating a customized, clean .gitignore file...');
          fs.writeFileSync(gitignorePath, customGitignore, 'utf8');
        } else {
          sendLog('[INFO] Found existing .gitignore. Skipping creation.');
        }
      }

      // --- STEP 3: Stage Files ---
      sendStep('stage', 'running');
      try {
        performSecurityHardening(resolvedPath, sendLog);
      } catch (secErr) {
        sendLog(`[WARNING] Security hardening scan encountered a warning: ${secErr.message || secErr}`);
      }
      sendLog('Staging all files in the directory...');
      await runCommand('git', ['add', '.'], 'stage');
      sendStep('stage', 'success');

      // --- STEP 4: Commit Changes ---
      sendStep('commit', 'running');
      sendLog('Committing staged changes...');
      try {
        if (req.query.autoCommitMsg === 'true') {
          const statusOutput = runCmdSync('git status --porcelain', resolvedPath);
          if (statusOutput) {
            const tempFileChanges = { modified: 0, untracked: 0, deleted: 0, total: 0, files: [] };
            const lines = statusOutput.split('\n');
            lines.forEach(line => {
              if (!line || line.trim() === '') return;
              tempFileChanges.total++;
              const code = line.substring(0, 2);
              const filePath = line.substring(3).trim();
              tempFileChanges.files.push({ code: code.trim(), path: filePath });
            });
            let hasCommits = false;
            try {
              execSync('git rev-parse --verify HEAD', { cwd: resolvedPath, stdio: 'ignore' });
              hasCommits = true;
            } catch (e) {
              hasCommits = false;
            }
            msg = generateSuggestedCommitMessage(tempFileChanges, hasCommits);
          } else {
            msg = 'Minor updates';
          }
          sendLog(`Auto-generated commit message: "${msg}"`);
        }
        await runCommand('git', ['commit', '-m', `"${msg}"`], 'commit');
        sendStep('commit', 'success');
      } catch (err) {
        // If nothing to commit, it's not a terminal error
        if (err.stdout.includes('nothing to commit') || err.stderr.includes('nothing to commit') ||
            err.stdout.includes('working tree clean') || err.stderr.includes('working tree clean')) {
          sendLog('Warning: Nothing to commit, working tree is clean. Proceeding...');
          sendStep('commit', 'success');
        } else {
          throw err;
        }
      }

      // --- STEP 5: Rename Branch ---
      sendStep('branch', 'running');
      sendLog(`Renaming current branch to: ${targetBranch}`);
      await runCommand('git', ['branch', '-M', targetBranch], 'branch');
      sendStep('branch', 'success');

      // --- STEP 6: Configure Remote ---
      sendStep('remote', 'running');
      
      const cleanRemoteUrl = repoUrl.trim();

      // Check if origin exists
      const hasOrigin = runCmdSync('git remote get-url origin', resolvedPath);
      if (hasOrigin) {
        sendLog('Remote "origin" already exists. Updating URL...');
        await runCommand('git', ['remote', 'set-url', 'origin', `"${cleanRemoteUrl}"`], 'remote');
      } else {
        sendLog('Adding new remote "origin"...');
        await runCommand('git', ['remote', 'add', 'origin', `"${cleanRemoteUrl}"`], 'remote');
      }
      
      sendLog(`Configured remote URL: ${cleanRemoteUrl}`);
      sendStep('remote', 'success');

      // --- REMOTE SYNC CHECK (FETCH & REBASE PULL) ---
      let hasCommits = false;
      if (isGitRepo) {
        try {
          execSync('git rev-parse --verify HEAD', { cwd: resolvedPath, stdio: 'ignore' });
          hasCommits = true;
        } catch (e) {
          hasCommits = false;
        }
      }

      if (isGitRepo && hasCommits) {
        sendLog('Checking for remote updates before pushing...');
        try {
          await runCommand('git', ['fetch', 'origin'], 'remote');
          const remoteBranchExists = runCmdSync(`git ${credOpts} ls-remote --heads origin ${targetBranch}`, resolvedPath);
          if (remoteBranchExists) {
            const behindCount = runCmdSync(`git rev-list --count HEAD..origin/${targetBranch}`, resolvedPath);
            if (behindCount && parseInt(behindCount) > 0) {
              sendLog(`Local branch is behind origin by ${behindCount} commit(s). Automatically running git pull --rebase...`);
              try {
                await runCommand('git', ['pull', '--rebase', 'origin', targetBranch], 'remote');
                sendLog('Successfully pulled and rebased remote changes.');
              } catch (pullErr) {
                sendLog('[WARNING] Auto-pull failed (likely due to merge conflicts). Aborting rebase to keep local repository clean...');
                runCmdSync('git rebase --abort', resolvedPath);
                throw new Error('Merge conflict detected. Try checking "Force Push" to overwrite remote or resolve conflicts manually.');
              }
            } else {
              sendLog('Local branch is up-to-date with remote origin.');
            }
          } else {
            sendLog('Remote branch does not exist yet. Pushing new branch...');
          }
        } catch (syncErr) {
          sendLog(`[INFO] Sync check warning: ${syncErr.message || syncErr}. Continuing push...`);
        }
      }

      // --- STEP 7: Push to GitHub ---
      sendStep('push', 'running');
      sendLog(`Pushing branch "${targetBranch}" to remote...`);
      
      const pushArgs = ['push', '-u', 'origin', targetBranch];
      if (forcePush === 'true') {
        sendLog('Force-push enabled. Using --force...');
        pushArgs.push('--force');
      }

      try {
        await runCommand('git', pushArgs, 'push');
        sendStep('push', 'success');
        sendEvent('complete', { status: 'success', message: 'Successfully initialized, committed, and pushed!' });
      } catch (err) {
        // Handle common push issues
        let suggestion = '';
        const stderrMsg = err.stderr || '';
        
        if (stderrMsg.includes('rejected') || stderrMsg.includes('fetch first')) {
          suggestion = '\n[TIP] The remote repository contains changes you do not have locally. Try checking the "Force Push" option to overwrite the remote branch, or manually pull files first.';
        } else if (stderrMsg.includes('Permission to') || stderrMsg.includes('Could not read from remote repository') || stderrMsg.includes('403') || stderrMsg.includes('401')) {
          suggestion = '\n[TIP] Authentication failed. Please verify that your GitHub repository URL is correct and check if your Personal Access Token (PAT) has the required "repo" scope/permissions.';
        } else if (stderrMsg.includes('not found') || stderrMsg.includes('Repository not found')) {
          suggestion = '\n[TIP] Repository not found. Make sure you created the repository on GitHub before attempting to push, and verify the spelling of the URL.';
        }
        
        sendLog(`Push error: ${stderrMsg}${suggestion}`);
        throw err;
      }

    } catch (error) {
      sendLog(`Failed at step execution: ${error.stderr || error.message || error}`);
      // Send error to the active step
      sendEvent('complete', { status: 'failed', message: `Execution failed. Check details in logs.` });
    } finally {
      res.end();
    }
  }

  sendLog('Waiting for repository lock (queued)...');
  gitQueue.enqueue(async () => {
    sendLog('Lock acquired. Starting Git Push Automation...');
    await execute();
  }).catch(err => {
    // Already handled inside execute()
  });
});

// GET /api/gitignore/preview
app.get('/api/gitignore/preview', (req, res) => {
  const { dirPath } = req.query;
  if (!dirPath) {
    return res.status(400).json({ error: 'Directory path is required' });
  }

  const resolvedPath = path.resolve(dirPath);
  const gitignorePath = path.join(resolvedPath, '.gitignore');

  if (fs.existsSync(gitignorePath)) {
    try {
      const content = fs.readFileSync(gitignorePath, 'utf8');
      return res.json({ content, isNew: false, stack: detectTechStack(resolvedPath) });
    } catch (e) {
      return res.status(500).json({ error: `Failed to read existing .gitignore: ${e.message}` });
    }
  } else {
    // Generate stack-based template
    const { content, stack } = buildGitignoreContent(resolvedPath);
    return res.json({ content, isNew: true, stack });
  }
});

// POST /api/gitignore/save
app.post('/api/gitignore/save', (req, res) => {
  const { dirPath, content } = req.body;
  if (!dirPath || content === undefined) {
    return res.status(400).json({ error: 'Directory path and content are required' });
  }

  const resolvedPath = path.resolve(dirPath);
  const gitignorePath = path.join(resolvedPath, '.gitignore');

  try {
    fs.writeFileSync(gitignorePath, content, 'utf8');
    return res.json({ success: true, message: 'Successfully saved .gitignore configuration!' });
  } catch (e) {
    return res.status(500).json({ error: `Failed to save .gitignore: ${e.message}` });
  }
});

// Endpoint to create a repository on GitHub
app.post('/api/create-repo', (req, res) => {
  const { token, repoName, isPrivate, githubAccount } = req.body;

  let tokenVal = token;
  if (!tokenVal || tokenVal.trim() === '' || tokenVal === '••••••••••••••••••••' || githubAccount !== 'custom') {
    tokenVal = getStoredTokenForAccount(githubAccount, token);
  }

  if (!tokenVal) {
    return res.status(400).json({ error: 'GitHub Personal Access Token (PAT) is required' });
  }
  if (!repoName) {
    return res.status(400).json({ error: 'Repository name is required' });
  }

  const https = require('https');
  const postData = JSON.stringify({
    name: repoName.trim(),
    private: isPrivate === true || isPrivate === 'true'
  });

  const options = {
    hostname: 'api.github.com',
    port: 443,
    path: '/user/repos',
    method: 'POST',
    headers: {
      'Authorization': `token ${tokenVal.trim()}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'GitAutoPush-App',
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const request = https.request(options, (apiRes) => {
    let rawData = '';
    apiRes.on('data', (chunk) => {
      rawData += chunk;
    });
    apiRes.on('end', () => {
      try {
        const parsed = JSON.parse(rawData);
        if (apiRes.statusCode === 201) {
          return res.json({
            success: true,
            cloneUrl: parsed.clone_url,
            htmlUrl: parsed.html_url
          });
        } else {
          return res.status(apiRes.statusCode).json({
            error: parsed.message || `GitHub returned error status: ${apiRes.statusCode}`,
            errors: parsed.errors
          });
        }
      } catch (err) {
        return res.status(500).json({ error: `Failed to parse GitHub response: ${err.message}` });
      }
    });
  });

  request.on('error', (err) => {
    return res.status(500).json({ error: `Connection to GitHub API failed: ${err.message}` });
  });

  request.write(postData);
  request.end();
});

// Helper for background git operations without Server-Sent Events
async function runGitPushPipeline({
  dirPath,
  repoUrl,
  token,
  commitMessage,
  branch,
  forcePush,
  createGitignore,
  prePushCmd,
  autoCommitMsg,
  githubAccount,
  logCallback
}) {
  const resolvedPath = path.resolve(dirPath);
  const targetBranch = branch ? branch.trim() : 'main';
  let msg = commitMessage ? commitMessage.trim() : 'Backup sync';

  let tokenVal = token;
  if (!tokenVal || tokenVal.trim() === '' || tokenVal === '••••••••••••••••••••' || githubAccount !== 'custom') {
    tokenVal = getStoredTokenForAccount(githubAccount, token);
  }

  const log = (txt) => { if (logCallback) logCallback(txt); };
  
  // 1. Pre-push Command Validation
  if (prePushCmd && prePushCmd.trim()) {
    log(`Running Pre-Push check: "${prePushCmd}"`);
    execSync(prePushCmd.trim(), { cwd: resolvedPath, stdio: 'pipe' });
  }
  
  // 2. Git init if not repo
  const isGitRepo = fs.existsSync(path.join(resolvedPath, '.git'));
  if (!isGitRepo) {
    log('Initializing git repository...');
    execSync('git init', { cwd: resolvedPath });
  }
  
  // 3. Create .gitignore if selected
  if (createGitignore === 'true' || createGitignore === true) {
    const gitignorePath = path.join(resolvedPath, '.gitignore');
    if (!fs.existsSync(gitignorePath)) {
      const { content: customGitignore, stack } = buildGitignoreContent(resolvedPath);
      log(`No .gitignore detected. Creating custom .gitignore for stacks: ${stack.join(', ') || 'none (defaulted to Web)'}...`);
      fs.writeFileSync(gitignorePath, customGitignore, 'utf8');
    }
  }
  
  // 3.5. Automated Security Scan (Credentials Prevention)
  try {
    performSecurityHardening(resolvedPath, log);
  } catch (secErr) {
    log(`[WARNING] Security hardening scan skipped: ${secErr.message}`);
  }
  
  // 4. Git add
  log('Staging files...');
  execSync('git add .', { cwd: resolvedPath });
  
  // 5. Commit
  log('Committing changes...');
  try {
    if (autoCommitMsg === 'true' || autoCommitMsg === true) {
      const statusOutput = runCmdSync('git status --porcelain', resolvedPath);
      if (statusOutput) {
        const tempFileChanges = { modified: 0, untracked: 0, deleted: 0, total: 0, files: [] };
        const lines = statusOutput.split('\n');
        lines.forEach(line => {
          if (!line || line.trim() === '') return;
          tempFileChanges.total++;
          const code = line.substring(0, 2);
          const filePath = line.substring(3).trim();
          tempFileChanges.files.push({ code: code.trim(), path: filePath });
        });
        let hasCommits = false;
        try {
          execSync('git rev-parse --verify HEAD', { cwd: resolvedPath, stdio: 'ignore' });
          hasCommits = true;
        } catch (e) {
          hasCommits = false;
        }
        msg = generateSuggestedCommitMessage(tempFileChanges, hasCommits);
      } else {
        msg = 'Minor updates';
      }
      log(`Auto-generated commit message: "${msg}"`);
    }
    execSync(`git commit -m "${msg.replace(/"/g, '\\"')}"`, { cwd: resolvedPath });
  } catch (err) {
    if (err.stdout && (err.stdout.includes('nothing to commit') || err.stdout.includes('clean'))) {
      log('Nothing to commit, working tree clean.');
    } else if (err.message && (err.message.includes('nothing to commit') || err.message.includes('clean'))) {
      log('Nothing to commit, working tree clean.');
    } else {
      throw err;
    }
  }
  
  // 6. Branch
  execSync(`git branch -M ${targetBranch}`, { cwd: resolvedPath });
  
  // 7. Remote setup (Clean URL without token)
  const cleanRemoteUrl = repoUrl.trim();
  try {
    execSync('git remote get-url origin', { cwd: resolvedPath });
    execSync(`git remote set-url origin "${cleanRemoteUrl}"`, { cwd: resolvedPath });
  } catch (e) {
    execSync(`git remote add origin "${cleanRemoteUrl}"`, { cwd: resolvedPath });
  }
  
  let credOpts = '-c credential.helper=';
  if (tokenVal && tokenVal.trim()) {
    credOpts = `-c credential.helper= -c credential.helper="!echo username=token; echo password=${tokenVal.trim()}; #"`;
  }
  
  // 8. Fetch & Pull Sync
  log('Checking remote changes...');
  try {
    execSync(`git ${credOpts} fetch origin`, { cwd: resolvedPath });
    const remoteExists = execSync(`git ${credOpts} ls-remote --heads origin ${targetBranch}`, { cwd: resolvedPath, encoding: 'utf8' }).trim();
    if (remoteExists) {
      const behind = execSync(`git rev-list --count HEAD..origin/${targetBranch}`, { cwd: resolvedPath, encoding: 'utf8' }).trim();
      if (behind && parseInt(behind) > 0) {
        log(`Pulling remote updates (${behind} commits)...`);
        execSync(`git ${credOpts} pull --rebase origin ${targetBranch}`, { cwd: resolvedPath });
      }
    }
  } catch (err) {
    log(`[WARNING] Fetch/Pull Sync skipped: ${err.message}`);
  }
  
  // 9. Push
  log('Pushing to GitHub...');
  const pushCmd = `git ${credOpts} push -u origin ${targetBranch} ${forcePush === 'true' || forcePush === true ? '--force' : ''}`;
  execSync(pushCmd, { cwd: resolvedPath });
  log('Sync completed successfully!');
}

function startWatcher(params) {
  const { dirPath, watcherId } = params;
  
  stopWatcher(watcherId);
  
  const resolvedPath = path.resolve(dirPath);
  let debounceTimer = null;
  const logHistory = [];
  const addLog = (msg) => {
    const logStr = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logHistory.push(logStr);
    if (logHistory.length > 50) logHistory.shift();
  };
  
  addLog(`Started continuous sync backup monitor for path: ${dirPath}`);
  
  // Compile ignore rules from .gitignore dynamically on startup
  const gitignoreRules = compileGitignoreRules(resolvedPath);
  addLog(`Loaded ${gitignoreRules.length} file watching ignore rules (including defaults).`);

  const runSync = async () => {
    const watcherObj = backupWatchers.get(watcherId);
    if (watcherObj) watcherObj.status = 'syncing';
    addLog('Change detected. Waiting in queue for repository lock...');
    try {
      await gitQueue.enqueue(async () => {
        addLog('Lock acquired. Running background sync...');
        await runGitPushPipeline({
          ...params,
          logCallback: (msg) => addLog(msg)
        });
      });
      if (watcherObj) watcherObj.status = 'active';
    } catch (err) {
      let isConflict = false;
      const errMsg = err.stderr || err.message || '';
      if (errMsg.includes('conflict') || errMsg.includes('CONFLICT') || errMsg.includes('merge failed')) {
        isConflict = true;
      }
      addLog(`[ERROR] Sync failed: ${errMsg}`);
      if (watcherObj) {
        watcherObj.status = isConflict ? 'conflict' : 'error';
      }
    }
  };
  
  const fsWatcher = fs.watch(resolvedPath, { recursive: true }, (eventType, filename) => {
    if (!filename) return;
    
    // Normalize path separators to forward slashes for checking
    const normalizedName = filename.replace(/\\/g, '/');
    
    // Check path against compiled ignore rules
    const shouldIgnore = gitignoreRules.some(rule => rule.regex.test(normalizedName));
    if (shouldIgnore) {
      return;
    }
    
    addLog(`File changed: ${filename}`);
    
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      runSync();
    }, 15000); // 15 seconds debounce
  });
  
  backupWatchers.set(watcherId, {
    watcher: fsWatcher,
    dirPath,
    params,
    logHistory,
    status: 'active',
    startedAt: new Date()
  });
}

function stopWatcher(watcherId) {
  if (backupWatchers.has(watcherId)) {
    const item = backupWatchers.get(watcherId);
    if (item.watcher) {
      item.watcher.close();
    }
    backupWatchers.delete(watcherId);
    return true;
  }
  return false;
}

// POST /api/backup/start
app.post('/api/backup/start', (req, res) => {
  const { dirPath, repoUrl, token, branch, commitMessage, forcePush, createGitignore, prePushCmd, autoCommitMsg, githubAccount } = req.body;
  
  if (!dirPath || !repoUrl) {
    return res.status(400).json({ error: 'Directory path and repo URL are required' });
  }
  
  const watcherId = path.resolve(dirPath).replace(/[^a-zA-Z0-9]/g, '_');
  
  try {
    startWatcher({
      dirPath,
      repoUrl,
      token,
      branch: branch || 'main',
      commitMessage: commitMessage || 'Backup sync',
      forcePush: forcePush === true || forcePush === 'true',
      createGitignore: createGitignore === true || createGitignore === 'true',
      prePushCmd,
      autoCommitMsg: autoCommitMsg === true || autoCommitMsg === 'true',
      githubAccount,
      watcherId
    });
    
    return res.json({ success: true, watcherId, message: 'Continuous sync started' });
  } catch (err) {
    return res.status(500).json({ error: `Failed to start watcher: ${err.message}` });
  }
});

// POST /api/backup/stop
app.post('/api/backup/stop', (req, res) => {
  const { dirPath } = req.body;
  if (!dirPath) {
    return res.status(400).json({ error: 'Directory path is required' });
  }
  const watcherId = path.resolve(dirPath).replace(/[^a-zA-Z0-9]/g, '_');
  const stopped = stopWatcher(watcherId);
  return res.json({ success: stopped, message: stopped ? 'Continuous sync stopped' : 'Sync was not active for this path' });
});

// GET /api/backup/status
app.get('/api/backup/status', (req, res) => {
  const { dirPath } = req.query;
  if (!dirPath) {
    const list = [];
    backupWatchers.forEach((value, key) => {
      list.push({
        watcherId: key,
        dirPath: value.dirPath,
        startedAt: value.startedAt,
        status: value.status || 'active',
        logs: value.logHistory
      });
    });
    return res.json({ activeBackups: list });
  }
  
  const watcherId = path.resolve(dirPath).replace(/[^a-zA-Z0-9]/g, '_');
  if (backupWatchers.has(watcherId)) {
    const item = backupWatchers.get(watcherId);
    return res.json({
      active: true,
      watcherId,
      dirPath: item.dirPath,
      startedAt: item.startedAt,
      status: item.status || 'active',
      logs: item.logHistory
    });
  } else {
    return res.json({ active: false });
  }
});

// POST /api/create-pr
app.post('/api/create-pr', (req, res) => {
  const { token, repoUrl, title, body, head, base, githubAccount } = req.body;
  
  let tokenVal = token;
  if (!tokenVal || tokenVal.trim() === '' || tokenVal === '••••••••••••••••••••' || githubAccount !== 'custom') {
    tokenVal = getStoredTokenForAccount(githubAccount, token);
  }

  if (!tokenVal || !repoUrl || !title || !head || !base) {
    return res.status(400).json({ error: 'Token, repoUrl, title, head, and base branch are required' });
  }
  
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/.]+)/);
  if (!match) {
    return res.status(400).json({ error: 'Invalid GitHub repository URL. Must be in the format: https://github.com/owner/repo' });
  }
  
  const owner = match[1];
  const repo = match[2];
  
  const https = require('https');
  const postData = JSON.stringify({
    title: title.trim(),
    body: body ? body.trim() : 'Auto-created PR via GitAuto Push',
    head: head.trim(),
    base: base.trim()
  });
  
  const options = {
    hostname: 'api.github.com',
    port: 443,
    path: `/repos/${owner}/${repo}/pulls`,
    method: 'POST',
    headers: {
      'Authorization': `token ${tokenVal.trim()}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'GitAutoPush-App',
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };
  
  const request = https.request(options, (apiRes) => {
    let rawData = '';
    apiRes.on('data', (chunk) => {
      rawData += chunk;
    });
    apiRes.on('end', () => {
      try {
        const parsed = JSON.parse(rawData);
        if (apiRes.statusCode === 201) {
          return res.json({
            success: true,
            htmlUrl: parsed.clone_url || parsed.html_url,
            number: parsed.number
          });
        } else {
          return res.status(apiRes.statusCode).json({
            error: parsed.message || `GitHub returned error status: ${apiRes.statusCode}`,
            errors: parsed.errors
          });
        }
      } catch (err) {
        return res.status(500).json({ error: `Failed to parse GitHub response: ${err.message}` });
      }
    });
  });
  
  request.on('error', (err) => {
    return res.status(500).json({ error: `Connection to GitHub API failed: ${err.message}` });
  });
  
  request.write(postData);
  request.end();
});

// Settings: Save Token on Server (Secure storage)
app.post('/api/settings/token', (req, res) => {
  const { token } = req.body;
  try {
    const configPath = path.join(__dirname, 'config.json');
    let config = {};
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
    config.githubToken = token ? token.trim() : '';
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: `Failed to save token: ${err.message}` });
  }
});

// Settings: Check if Token exists on Server
app.get('/api/settings/token-check', (req, res) => {
  try {
    const configPath = path.join(__dirname, 'config.json');
    let hasToken = false;
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      hasToken = !!config.githubToken;
    }
    res.json({ hasToken });
  } catch (err) {
    res.json({ hasToken: false });
  }
});

// Settings: Delete Token on Server
app.post('/api/settings/token-delete', (req, res) => {
  try {
    const configPath = path.join(__dirname, 'config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      config.githubToken = '';
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: `Failed to delete token: ${err.message}` });
  }
});

app.listen(PORT, () => {
  console.log(`GitAuto Push server is running at http://localhost:${PORT}`);
});
