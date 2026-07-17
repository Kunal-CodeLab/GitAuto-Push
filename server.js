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

// Helper to get stored GitHub PAT token from server-side config file
function getStoredToken() {
  try {
    const configPath = path.join(__dirname, 'config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return config.githubToken || '';
    }
  } catch (e) {}
  return '';
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
    prePushCmd
  } = req.query;

  let tokenVal = token;
  if (!tokenVal || tokenVal.trim() === '' || tokenVal === '••••••••••••••••••••') {
    tokenVal = getStoredToken();
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

      const finalArgs = (cmd === 'git') ? ['-c', 'credential.helper=', ...args] : args;
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
          sendLog('[INFO] No .gitignore file detected. Creating a standard .gitignore file to exclude node_modules, build directories, and environment/log files...');
          const STANDARD_GITIGNORE = `# ==========================================\n` +
            `# UNIVERSAL GITIGNORE (COVERS WEB, .NET, ANDROID, PYTHON, GAMES & MORE)\n` +
            `# ==========================================\n\n` +
            `# --- OS & System Files ---\n` +
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
            `client_secret.json\n\n` +
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
            `.settings/\n\n` +
            `# --- Web & Node.js Build Outputs ---\n` +
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
            `pnpm-debug.log*\n\n` +
            `# --- Python Build & Virtual Envs ---\n` +
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
            `.tox/\n\n` +
            `# --- .NET Build Outputs (C# / F#) ---\n` +
            `[Bb]in/\n` +
            `[Oo]bj/\n` +
            `[Rr]elease/\n` +
            `[Dd]ebug/\n` +
            `*.userprefs\n` +
            `*.usertasks\n` +
            `*.pdb\n\n` +
            `# --- Java, Kotlin & Gradle Build Outputs ---\n` +
            `.gradle/\n` +
            `/build/\n` +
            `!/src/**/build/\n` +
            `.gradletasknamecache\n` +
            `/target/\n` +
            `pom.xml.tag\n` +
            `pom.xml.releaseBackup\n` +
            `pom.xml.next\n` +
            `release.properties\n` +
            `*.class\n\n` +
            `# --- Android Build Outputs ---\n` +
            `*.dex\n` +
            `/captures/\n` +
            `.externalNativeBuild/\n` +
            `.cxx/\n` +
            `local.properties\n\n` +
            `# --- Flutter Build Outputs ---\n` +
            `.dart_tool/\n` +
            `.packages\n` +
            `.flutter-plugins\n` +
            `.flutter-plugins-dependencies\n` +
            `.pub-cache/\n` +
            `.pub/\n\n` +
            `# --- Unity & Game Dev Build Outputs ---\n` +
            `/[Ll]ibrary/\n` +
            `/[Tt]emp/\n` +
            `/[Oo]bj/\n` +
            `/[Bb]uild/\n` +
            `/[Bb]uilds/\n` +
            `/[Ll]ogs/\n` +
            `/[MemoryCaptures]/\n` +
            `Assets/AssetStoreTools*\n\n` +
            `# --- Logs & Databases ---\n` +
            `*.log\n` +
            `*.sqlite\n` +
            `*.sqlite3\n` +
            `*.db\n` +
            `*.mdb\n` +
            `*.ldf\n` +
            `*.sql\n` +
            `*.dmp\n`;
          fs.writeFileSync(gitignorePath, STANDARD_GITIGNORE, 'utf8');
        } else {
          sendLog('[INFO] Found existing .gitignore. Skipping creation.');
        }
      }

      // --- STEP 3: Stage Files ---
      sendStep('stage', 'running');
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
      
      // Format remote URL with token if provided
      let remoteUrlWithAuth = repoUrl.trim();
      if (tokenVal && tokenVal.trim()) {
        const cleanToken = tokenVal.trim();
        const rawUrl = repoUrl.trim();
        if (rawUrl.startsWith('https://')) {
          remoteUrlWithAuth = `https://${cleanToken}@` + rawUrl.substring(8);
        } else if (rawUrl.startsWith('http://')) {
          remoteUrlWithAuth = `http://${cleanToken}@` + rawUrl.substring(7);
        }
      }

      // Check if origin exists
      const hasOrigin = runCmdSync('git remote get-url origin', resolvedPath);
      if (hasOrigin) {
        sendLog('Remote "origin" already exists. Updating URL...');
        await runCommand('git', ['remote', 'set-url', 'origin', `"${remoteUrlWithAuth}"`], 'remote');
      } else {
        sendLog('Adding new remote "origin"...');
        await runCommand('git', ['remote', 'add', 'origin', `"${remoteUrlWithAuth}"`], 'remote');
      }
      
      // Print masked remote URL to logs
      const maskedUrl = tokenVal ? repoUrl : remoteUrlWithAuth;
      sendLog(`Configured remote URL: ${maskedUrl}`);
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
          const remoteBranchExists = runCmdSync(`git ls-remote --heads origin ${targetBranch}`, resolvedPath);
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

  execute();
});

// Endpoint to create a repository on GitHub
app.post('/api/create-repo', (req, res) => {
  const { token, repoName, isPrivate } = req.body;

  let tokenVal = token;
  if (!tokenVal || tokenVal.trim() === '' || tokenVal === '••••••••••••••••••••') {
    tokenVal = getStoredToken();
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
  logCallback
}) {
  const resolvedPath = path.resolve(dirPath);
  const targetBranch = branch ? branch.trim() : 'main';
  let msg = commitMessage ? commitMessage.trim() : 'Backup sync';

  let tokenVal = token;
  if (!tokenVal || tokenVal.trim() === '' || tokenVal === '••••••••••••••••••••') {
    tokenVal = getStoredToken();
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
      log('Creating default .gitignore...');
      fs.writeFileSync(gitignorePath, 'node_modules/\ndist/\nbuild/\n.env\n', 'utf8');
    }
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
  
  // 7. Remote setup
  let remoteUrlWithAuth = repoUrl.trim();
  if (tokenVal && tokenVal.trim()) {
    const cleanToken = tokenVal.trim();
    if (remoteUrlWithAuth.startsWith('https://')) {
      remoteUrlWithAuth = `https://${cleanToken}@` + remoteUrlWithAuth.substring(8);
    }
  }
  try {
    execSync('git remote get-url origin', { cwd: resolvedPath });
    execSync(`git remote set-url origin "${remoteUrlWithAuth}"`, { cwd: resolvedPath });
  } catch (e) {
    execSync(`git remote add origin "${remoteUrlWithAuth}"`, { cwd: resolvedPath });
  }
  
  // 8. Fetch & Pull Sync
  log('Checking remote changes...');
  try {
    execSync('git -c credential.helper= fetch origin', { cwd: resolvedPath });
    const remoteExists = execSync(`git -c credential.helper= ls-remote --heads origin ${targetBranch}`, { cwd: resolvedPath, encoding: 'utf8' }).trim();
    if (remoteExists) {
      const behind = execSync(`git rev-list --count HEAD..origin/${targetBranch}`, { cwd: resolvedPath, encoding: 'utf8' }).trim();
      if (behind && parseInt(behind) > 0) {
        log(`Pulling remote updates (${behind} commits)...`);
        execSync(`git -c credential.helper= pull --rebase origin ${targetBranch}`, { cwd: resolvedPath });
      }
    }
  } catch (err) {
    log(`[WARNING] Fetch/Pull Sync skipped: ${err.message}`);
  }
  
  // 9. Push
  log('Pushing to GitHub...');
  const pushCmd = `git -c credential.helper= push -u origin ${targetBranch} ${forcePush === 'true' || forcePush === true ? '--force' : ''}`;
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
  
  const runSync = async () => {
    const watcherObj = backupWatchers.get(watcherId);
    if (watcherObj) watcherObj.status = 'syncing';
    addLog('Change detected. Running sync backup...');
    try {
      await runGitPushPipeline({
        ...params,
        logCallback: (msg) => addLog(msg)
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
    if (
      normalizedName.includes('.git/') ||
      normalizedName === '.git' ||
      normalizedName.includes('node_modules/') ||
      normalizedName.startsWith('node_modules') ||
      normalizedName.includes('/node_modules/') ||
      normalizedName.includes('dist/') ||
      normalizedName.startsWith('dist') ||
      normalizedName.includes('build/') ||
      normalizedName.startsWith('build') ||
      normalizedName.includes('.next/') ||
      normalizedName.startsWith('.next')
    ) {
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
  const { dirPath, repoUrl, token, branch, commitMessage, forcePush, createGitignore, prePushCmd, autoCommitMsg } = req.body;
  
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
  const { token, repoUrl, title, body, head, base } = req.body;
  
  let tokenVal = token;
  if (!tokenVal || tokenVal.trim() === '' || tokenVal === '••••••••••••••••••••') {
    tokenVal = getStoredToken();
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
