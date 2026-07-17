document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const serverStatus = document.getElementById('server-status');
  const localPathInput = document.getElementById('local-path');
  const repoUrlInput = document.getElementById('repo-url');
  const btnScan = document.getElementById('btn-scan');
  const scanFeedback = document.getElementById('scan-feedback');
  
  const globalNameVal = document.getElementById('global-name-val');
  const globalEmailVal = document.getElementById('global-email-val');
  const overrideToggle = document.getElementById('override-identity-toggle');
  const identityFields = document.getElementById('identity-fields');
  const gitUsernameInput = document.getElementById('git-username');
  const gitEmailInput = document.getElementById('git-email');
  const saveIdentityToggle = document.getElementById('save-identity-toggle');
  
  const githubTokenInput = document.getElementById('github-token');
  const btnToggleToken = document.getElementById('btn-toggle-token');
  const commitMsgInput = document.getElementById('commit-msg');
  const branchNameInput = document.getElementById('branch-name');
  const gitignoreToggle = document.getElementById('gitignore-toggle');
  const forcePushToggle = document.getElementById('force-push-toggle');
  const autoCommitMsgToggle = document.getElementById('auto-commit-msg-toggle');
  const btnPushAction = document.getElementById('btn-push-action');
  const githubAccountSelect = document.getElementById('github-account-select');
  const repoAccountModal = document.getElementById('repo-account-modal');
  const btnCloseRepoAccount = document.getElementById('btn-close-repo-account');
  const btnChooseKunal = document.getElementById('btn-choose-kunal');
  const btnChooseCoder = document.getElementById('btn-choose-coder');
  
  const statPath = document.getElementById('stat-path');
  const statGitInit = document.getElementById('stat-git-init');
  const statBranch = document.getElementById('stat-branch');
  const statCommits = document.getElementById('stat-commits');
  
  const consoleLogs = document.getElementById('console-logs');
  const btnClearLogs = document.getElementById('btn-clear-logs');
  
  const patModal = document.getElementById('pat-modal');
  const helpPatLink = document.getElementById('help-pat-link');
  const btnCloseModal = document.getElementById('btn-close-modal');

  // New DOM Elements for Enhancements
  const recentFoldersList = document.getElementById('recent-folders-list');
  const saveTokenToggle = document.getElementById('save-token-toggle');
  const statChangesSummary = document.getElementById('stat-changes-summary');
  const statChangesList = document.getElementById('stat-changes-list');
  const successModal = document.getElementById('success-modal');
  const btnOpenGithub = document.getElementById('btn-open-github');
  const btnCloseSuccess = document.getElementById('btn-close-success');

  // Enhancements DOM
  const btnSuggestMessage = document.getElementById('btn-suggest-message');
  const btnToggleCreateRepo = document.getElementById('btn-toggle-create-repo');
  const createRepoFields = document.getElementById('create-repo-fields');
  const newRepoNameInput = document.getElementById('new-repo-name');
  const btnCreateRepoAction = document.getElementById('btn-create-repo-action');
  const createRepoFeedback = document.getElementById('create-repo-feedback');

  // Multi-Repo, Pre-Push, Backup and PR DOM
  const prepushToggle = document.getElementById('prepush-toggle');
  const prepushCommandGroup = document.getElementById('prepush-command-group');
  const prepushCmdInput = document.getElementById('prepush-cmd');
  const backupToggle = document.getElementById('backup-toggle');
  const backupConfigFields = document.getElementById('backup-config-fields');
  const backupDot = document.getElementById('backup-dot');
  const backupStatusText = document.getElementById('backup-status-text');
  const backupLogs = document.getElementById('backup-logs');
  const btnSuccessOpenPrModal = document.getElementById('btn-success-open-pr-modal');
  const prModal = document.getElementById('pr-modal');
  const btnClosePrModal = document.getElementById('btn-close-pr-modal');
  const prTitleInput = document.getElementById('pr-title');
  const prBodyInput = document.getElementById('pr-body');
  const prBaseInput = document.getElementById('pr-base');
  const prHeadInput = document.getElementById('pr-head');
  const btnCreatePrAction = document.getElementById('btn-create-pr-action');
  const prFeedback = document.getElementById('pr-feedback');

  let activeEventSource = null;
  let isPathScanned = false;
  let latestSuggestedMessage = '';
  let backupPollInterval = null;

  // Initialize
  checkServerConnection();
  loadRecentFolders();
  loadSavedToken();
  loadSavedIdentity();
  loadSavedAutoCommitSetting();
  loadSavedAccountSetting();

  function loadSavedAccountSetting() {
    try {
      const savedAccount = localStorage.getItem('selected_github_account') || 'Kunal-CodeLab';
      githubAccountSelect.value = savedAccount;
      handleAccountChange();
    } catch (e) {
      console.error('Error loading saved account setting:', e);
    }
  }

  function handleAccountChange() {
    const selected = githubAccountSelect.value;
    localStorage.setItem('selected_github_account', selected);
    
    const tokenGroup = document.querySelector('.token-group');
    if (selected === 'custom') {
      githubTokenInput.value = '';
      githubTokenInput.disabled = false;
      if (tokenGroup) tokenGroup.classList.remove('hidden');
    } else {
      githubTokenInput.value = '••••••••••••••••••••';
      githubTokenInput.disabled = true;
      if (tokenGroup) tokenGroup.classList.add('hidden');
    }
  }

  githubAccountSelect.addEventListener('change', handleAccountChange);

  function loadSavedAutoCommitSetting() {
    try {
      const isAuto = localStorage.getItem('auto_commit_msg') !== 'false';
      autoCommitMsgToggle.checked = isAuto;
      updateCommitMsgInputState();
    } catch (e) {
      console.error('Error loading auto-commit setting:', e);
    }
  }

  function updateCommitMsgInputState() {
    const isAuto = autoCommitMsgToggle.checked;
    commitMsgInput.disabled = isAuto;
    if (isAuto) {
      commitMsgInput.value = latestSuggestedMessage || 'Auto-generated based on changes';
      btnSuggestMessage.classList.add('hidden');
    } else {
      if (commitMsgInput.value === 'Auto-generated based on changes') {
        commitMsgInput.value = latestSuggestedMessage || 'Initial commit via GitAuto Push';
      }
      if (latestSuggestedMessage) {
        btnSuggestMessage.classList.remove('hidden');
      }
    }
  }

  autoCommitMsgToggle.addEventListener('change', () => {
    try {
      localStorage.setItem('auto_commit_msg', autoCommitMsgToggle.checked ? 'true' : 'false');
      updateCommitMsgInputState();
    } catch (e) {
      console.error('Error saving auto-commit setting:', e);
    }
  });

  // Recent folders history management and Sidebar rendering
  function loadRecentFolders() {
    try {
      const folders = JSON.parse(localStorage.getItem('recent_folders')) || [];
      recentFoldersList.innerHTML = '';
      
      const projectListEl = document.getElementById('project-list');
      if (projectListEl) {
        projectListEl.innerHTML = '';
      }

      if (folders.length === 0) {
        if (projectListEl) {
          projectListEl.innerHTML = '<p class="field-hint" style="text-align: center; margin-top: 1rem;">No workspaces scanned yet.</p>';
        }
        return;
      }

      // Check active backups to draw badges
      fetch('/api/backup/status')
        .then(res => res.json())
        .then(data => {
          const activeBackups = data.activeBackups || [];
          const activePaths = activeBackups.map(b => b.dirPath);
          
          folders.forEach(folder => {
            // datalist options
            const option = document.createElement('option');
            option.value = folder;
            recentFoldersList.appendChild(option);

            // sidebar items
            if (projectListEl) {
              const folderParts = folder.split(/[\\/]/).filter(Boolean);
              const folderName = folderParts.length > 0 ? folderParts[folderParts.length - 1] : folder;
              
              const isBackupActive = activePaths.includes(folder);
              const statusClass = isBackupActive ? 'backup-active' : 'synced';
              
              const item = document.createElement('div');
              item.className = 'project-item';
              if (localPathInput.value.trim() === folder) {
                item.classList.add('active');
              }
              
              item.innerHTML = `
                <div class="project-name" title="${folderName}">${folderName}</div>
                <div class="project-meta">
                  <span class="project-path" title="${folder}" style="max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${folder}</span>
                  <span class="project-status">
                    <span class="status-dot-mini ${statusClass}" title="${isBackupActive ? 'Continuous Backup Active' : 'Scan to check changes'}"></span>
                  </span>
                </div>
              `;
              
              item.addEventListener('click', () => {
                localPathInput.value = folder;
                document.querySelectorAll('.project-item').forEach(el => el.classList.remove('active'));
                item.classList.add('active');
                btnScan.click();
              });
              
              projectListEl.appendChild(item);
            }
          });
        })
        .catch(e => {
          folders.forEach(folder => {
            const option = document.createElement('option');
            option.value = folder;
            recentFoldersList.appendChild(option);

            if (projectListEl) {
              const folderParts = folder.split(/[\\/]/).filter(Boolean);
              const folderName = folderParts.length > 0 ? folderParts[folderParts.length - 1] : folder;
              
              const item = document.createElement('div');
              item.className = 'project-item';
              if (localPathInput.value.trim() === folder) {
                item.classList.add('active');
              }
              
              item.innerHTML = `
                <div class="project-name" title="${folderName}">${folderName}</div>
                <div class="project-meta">
                  <span class="project-path" title="${folder}" style="max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${folder}</span>
                  <span class="project-status">
                    <span class="status-dot-mini synced"></span>
                  </span>
                </div>
              `;
              item.addEventListener('click', () => {
                localPathInput.value = folder;
                document.querySelectorAll('.project-item').forEach(el => el.classList.remove('active'));
                item.classList.add('active');
                btnScan.click();
              });
              projectListEl.appendChild(item);
            }
          });
        });
        
    } catch (e) {
      console.error('Error loading recent folders:', e);
    }
  }

  function saveRecentFolder(folder) {
    if (!folder) return;
    try {
      let folders = JSON.parse(localStorage.getItem('recent_folders')) || [];
      folders = folders.filter(f => f !== folder);
      folders.unshift(folder);
      if (folders.length > 5) {
        folders = folders.slice(0, 5);
      }
      localStorage.setItem('recent_folders', JSON.stringify(folders));
      loadRecentFolders();
    } catch (e) {
      console.error('Error saving recent folder:', e);
    }
  }

  // Token storage management
  async function loadSavedToken() {
    try {
      const response = await fetch('/api/settings/token-check');
      const data = await response.json();
      if (data.hasToken) {
        saveTokenToggle.checked = true;
        githubTokenInput.value = '••••••••••••••••••••';
      } else {
        saveTokenToggle.checked = false;
        githubTokenInput.value = '';
      }
    } catch (e) {
      console.error('Error loading token:', e);
    }
  }

  async function handleTokenStorageChange() {
    try {
      const isSaved = saveTokenToggle.checked;
      if (isSaved) {
        const token = githubTokenInput.value.trim();
        if (token && token !== '••••••••••••••••••••') {
          await fetch('/api/settings/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
          });
        }
      } else {
        await fetch('/api/settings/token-delete', { method: 'POST' });
        githubTokenInput.value = '';
      }
    } catch (e) {
      console.error('Error saving token:', e);
    }
  }

  saveTokenToggle.addEventListener('change', handleTokenStorageChange);
  
  githubTokenInput.addEventListener('input', async () => {
    if (saveTokenToggle.checked) {
      const token = githubTokenInput.value.trim();
      if (token && token !== '••••••••••••••••••••') {
        try {
          await fetch('/api/settings/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
          });
        } catch (e) {
          console.error('Error updating token:', e);
        }
      }
    }
  });

  // Clear mask if user starts typing in a masked token field
  githubTokenInput.addEventListener('focus', () => {
    if (githubTokenInput.value === '••••••••••••••••••••') {
      githubTokenInput.value = '';
    }
  });

  // Identity storage management
  function loadSavedIdentity() {
    try {
      const savedUsername = localStorage.getItem('git_username');
      const savedEmail = localStorage.getItem('git_email');
      const isSaved = localStorage.getItem('save_identity_enabled') === 'true';
      
      saveIdentityToggle.checked = isSaved;
      if (isSaved) {
        if (savedUsername) gitUsernameInput.value = savedUsername;
        if (savedEmail) gitEmailInput.value = savedEmail;
      }
    } catch (e) {
      console.error('Error loading identity:', e);
    }
  }

  function handleIdentityStorageChange() {
    try {
      const isSaved = saveIdentityToggle.checked;
      localStorage.setItem('save_identity_enabled', isSaved ? 'true' : 'false');
      if (isSaved) {
        localStorage.setItem('git_username', gitUsernameInput.value.trim());
        localStorage.setItem('git_email', gitEmailInput.value.trim());
      } else {
        localStorage.removeItem('git_username');
        localStorage.removeItem('git_email');
      }
    } catch (e) {
      console.error('Error saving identity:', e);
    }
  }

  saveIdentityToggle.addEventListener('change', handleIdentityStorageChange);
  gitUsernameInput.addEventListener('input', () => {
    if (saveIdentityToggle.checked) {
      localStorage.setItem('git_username', gitUsernameInput.value.trim());
    }
  });
  gitEmailInput.addEventListener('input', () => {
    if (saveIdentityToggle.checked) {
      localStorage.setItem('git_email', gitEmailInput.value.trim());
    }
  });

  // Success Modal Close Triggers
  btnCloseSuccess.addEventListener('click', () => {
    successModal.classList.add('hidden');
  });

  successModal.addEventListener('click', (e) => {
    if (e.target === successModal) {
      successModal.classList.add('hidden');
    }
  });

  // 1. Check Server Connection & Load initial global git configurations
  async function checkServerConnection() {
    try {
      // Run quick scan with empty path just to verify server and fetch global configs
      const response = await fetch('/api/check-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dirPath: '.' })
      });
      const data = await response.json();
      
      serverStatus.classList.remove('disconnected');
      serverStatus.classList.add('connected');
      serverStatus.querySelector('.status-label').textContent = 'Server Connected';

      if (data.globalConfig) {
        globalNameVal.textContent = data.globalConfig.name || 'Not Configured';
        globalEmailVal.textContent = data.globalConfig.email || 'Not Configured';
      }
    } catch (error) {
      serverStatus.classList.remove('connected');
      serverStatus.classList.add('disconnected');
      serverStatus.querySelector('.status-label').textContent = 'Server Disconnected';
      appendLog('System Error: Cannot connect to the local automation backend. Make sure the Node server is running.');
    }
  }

  // 2. Scan Path Button handler
  btnScan.addEventListener('click', async () => {
    const dirPath = localPathInput.value.trim();
    if (!dirPath) {
      showScanFeedback('Please enter a directory path.', 'error');
      return;
    }

    showScanFeedback('Scanning path details...', 'info');
    btnScan.disabled = true;

    try {
      const response = await fetch('/api/check-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dirPath })
      });
      const data = await response.json();
      
      btnScan.disabled = false;

      if (data.error) {
        showScanFeedback(data.error, 'error');
        resetStatusGrid();
        disablePushButton(true);
        return;
      }

      if (!data.exists) {
        showScanFeedback('Directory does not exist! Please check the path.', 'error');
        resetStatusGrid();
        disablePushButton(true);
        return;
      }

      // Save folder to history
      if (data.resolvedPath) {
        saveRecentFolder(data.resolvedPath);
      }

      // Auto-detect and populate GitHub Remote URL
      if (data.remoteUrl) {
        repoUrlInput.value = data.remoteUrl;
      }

      // Update Path Scan Stats Grid
      isPathScanned = true;
      statPath.textContent = 'Yes (Valid)';
      statPath.style.color = 'var(--success-color)';
      
      statGitInit.textContent = data.isGitRepo ? 'Yes (.git folder found)' : 'No (Requires Init)';
      statGitInit.style.color = data.isGitRepo ? 'var(--success-color)' : 'var(--warning-color)';
      
      statBranch.textContent = data.currentBranch || 'main';
      statBranch.style.color = 'var(--secondary-color)';
      
      statCommits.textContent = data.hasCommits ? 'Yes' : 'No Commits Yet';
      statCommits.style.color = data.hasCommits ? 'var(--success-color)' : 'var(--warning-color)';
      
      // Update local file changes preview
      if (data.isGitRepo && data.fileChanges && data.fileChanges.total > 0) {
        const fc = data.fileChanges;
        let summaryText = `${fc.total} files changed`;
        const parts = [];
        if (fc.modified > 0) parts.push(`${fc.modified} modified`);
        if (fc.untracked > 0) parts.push(`${fc.untracked} untracked`);
        if (fc.deleted > 0) parts.push(`${fc.deleted} deleted`);
        if (parts.length > 0) {
          summaryText += ` (${parts.join(', ')})`;
        }
        statChangesSummary.textContent = summaryText;
        statChangesSummary.style.color = 'var(--warning-color)';

        // Build preview list
        statChangesList.innerHTML = '';
        fc.files.forEach(file => {
          const entry = document.createElement('div');
          entry.className = 'change-entry';
          
          const badge = document.createElement('span');
          badge.className = 'change-badge';
          let statusClass = 'untracked';
          if (file.code.includes('M')) statusClass = 'modified';
          else if (file.code.includes('D')) statusClass = 'deleted';
          
          badge.classList.add(statusClass);
          badge.textContent = file.code || '??';
          
          const pathEl = document.createElement('span');
          pathEl.className = 'change-path';
          pathEl.textContent = file.path;
          pathEl.title = file.path;

          entry.appendChild(badge);
          entry.appendChild(pathEl);
          statChangesList.appendChild(entry);
        });
        statChangesList.classList.remove('hidden');
      } else if (data.isGitRepo) {
        statChangesSummary.textContent = 'No changes (Working tree clean)';
        statChangesSummary.style.color = 'var(--success-color)';
        statChangesList.innerHTML = '';
        statChangesList.classList.add('hidden');
      } else {
        statChangesSummary.textContent = 'Requires git init to track changes';
        statChangesSummary.style.color = 'var(--text-muted)';
        statChangesList.innerHTML = '';
        statChangesList.classList.add('hidden');
      }

      // Auto-suggest commit message
      if (data.suggestedCommitMessage) {
        latestSuggestedMessage = data.suggestedCommitMessage;
      } else {
        latestSuggestedMessage = '';
      }
      updateCommitMsgInputState();

      // Guess repository name based on scanned path
      if (dirPath) {
        const pathParts = dirPath.split(/[\\/]/).filter(part => part.trim() !== '');
        if (pathParts.length > 0) {
          const folderName = pathParts[pathParts.length - 1];
          // Clean folder name to be a valid GitHub repo name
          newRepoNameInput.value = folderName.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-');
        }
      }

      showScanFeedback('Folder scanned successfully. Ready to push!', 'success');

      // Autofill overrides if they exist locally
      if (data.isGitRepo) {
        if (data.localConfig.name || data.localConfig.email) {
          overrideToggle.checked = true;
          identityFields.classList.remove('hidden');
          gitUsernameInput.value = data.localConfig.name || '';
          gitEmailInput.value = data.localConfig.email || '';
        }
      }

      // Enable push button if repository inputs are filled
      validateInputs();

      // Check if continuous sync is active for this scanned folder
      checkBackupStatusForPath(data.resolvedPath);

    } catch (error) {
      btnScan.disabled = false;
      showScanFeedback('Failed to contact server to scan path.', 'error');
      resetStatusGrid();
      disablePushButton(true);
    }
  });

  // Suggest Commit Message Handler
  btnSuggestMessage.addEventListener('click', () => {
    if (latestSuggestedMessage) {
      commitMsgInput.value = latestSuggestedMessage;
    }
  });

  // Toggle repo creation fields
  btnToggleCreateRepo.addEventListener('click', () => {
    const isHidden = createRepoFields.classList.contains('hidden');
    if (isHidden) {
      createRepoFields.classList.remove('hidden');
      btnToggleCreateRepo.querySelector('span').textContent = '[-] Cancel Create New Repo';
    } else {
      createRepoFields.classList.add('hidden');
      btnToggleCreateRepo.querySelector('span').textContent = '[+] Or Create New Repo on GitHub';
      hideCreateRepoFeedback();
    }
  });

  function showCreateRepoFeedback(message, type) {
    createRepoFeedback.textContent = message;
    createRepoFeedback.className = `status-feedback ${type}`;
    createRepoFeedback.classList.remove('hidden');
  }

  function hideCreateRepoFeedback() {
    createRepoFeedback.textContent = '';
    createRepoFeedback.className = 'status-feedback hidden';
  }

  // Create repo action trigger
  btnCreateRepoAction.addEventListener('click', () => {
    const repoName = newRepoNameInput.value.trim();
    if (!repoName) {
      showCreateRepoFeedback('Please enter a repository name.', 'error');
      newRepoNameInput.focus();
      return;
    }

    // Open the popup modal to ask which account to create the repo under
    repoAccountModal.classList.remove('hidden');
  });

  // Modal helper to finalize repo creation with chosen account
  async function finalizeCreateRepo(githubAccount) {
    repoAccountModal.classList.add('hidden');
    
    const token = githubTokenInput.value.trim();
    const repoName = newRepoNameInput.value.trim();
    const checkedPrivacy = document.querySelector('input[name="repo-privacy"]:checked');
    const isPrivate = checkedPrivacy ? checkedPrivacy.value === 'private' : false;

    showCreateRepoFeedback(`Creating repository under account "${githubAccount}"...`, 'info');
    btnCreateRepoAction.disabled = true;

    try {
      const response = await fetch('/api/create-repo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, repoName, isPrivate, githubAccount })
      });
      
      const data = await response.json();
      btnCreateRepoAction.disabled = false;

      if (data.error) {
        showCreateRepoFeedback(`Error: ${data.error}`, 'error');
        return;
      }

      if (data.success && data.htmlUrl) {
        showCreateRepoFeedback(`Successfully created repository under ${githubAccount}!`, 'success');
        repoUrlInput.value = data.htmlUrl; // Set the repo url input automatically!
        
        // Collapse the create section after a short delay
        setTimeout(() => {
          createRepoFields.classList.add('hidden');
          btnToggleCreateRepo.querySelector('span').textContent = '[+] Or Create New Repo on GitHub';
          hideCreateRepoFeedback();
          validateInputs(); // Enable the main git push button!
        }, 1500);
      }
    } catch (err) {
      btnCreateRepoAction.disabled = false;
      showCreateRepoFeedback('Failed to connect to the backend server.', 'error');
      console.error(err);
    }
  }

  btnChooseKunal.addEventListener('click', () => finalizeCreateRepo('Kunal-CodeLab'));
  btnChooseCoder.addEventListener('click', () => finalizeCreateRepo('CoderKunal02'));
  
  btnCloseRepoAccount.addEventListener('click', () => {
    repoAccountModal.classList.add('hidden');
  });

  repoAccountModal.addEventListener('click', (e) => {
    if (e.target === repoAccountModal) {
      repoAccountModal.classList.add('hidden');
    }
  });

  // 3. Toggle Custom Identity Configuration
  overrideToggle.addEventListener('change', () => {
    if (overrideToggle.checked) {
      identityFields.classList.remove('hidden');
    } else {
      identityFields.classList.add('hidden');
    }
  });

  // 4. Toggle Token visibility
  btnToggleToken.addEventListener('click', () => {
    const type = githubTokenInput.getAttribute('type') === 'password' ? 'text' : 'password';
    githubTokenInput.setAttribute('type', type);
    
    // Toggle icon
    if (type === 'text') {
      btnToggleToken.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="eye-icon-hide"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;
    } else {
      btnToggleToken.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="eye-icon-show"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
    }
  });

  // 5. Help Modal Toggle
  helpPatLink.addEventListener('click', (e) => {
    e.preventDefault();
    patModal.classList.remove('hidden');
  });

  btnCloseModal.addEventListener('click', () => {
    patModal.classList.add('hidden');
  });

  // Close modal when clicking outside content
  patModal.addEventListener('click', (e) => {
    if (e.target === patModal) {
      patModal.classList.add('hidden');
    }
  });

  // 6. Real-time inputs validation to unlock the run push button
  [localPathInput, repoUrlInput].forEach(elem => {
    elem.addEventListener('input', () => {
      if (elem === localPathInput) {
        isPathScanned = false;
        resetStatusGrid();
      }
      validateInputs();
    });
  });

  function validateInputs() {
    const localPath = localPathInput.value.trim();
    const repoUrl = repoUrlInput.value.trim();

    if (localPath && repoUrl && isPathScanned) {
      disablePushButton(false);
    } else {
      disablePushButton(true);
    }
  }

  function disablePushButton(disabled) {
    btnPushAction.disabled = disabled;
    if (disabled) {
      btnPushAction.classList.add('disabled');
    } else {
      btnPushAction.classList.remove('disabled');
    }
  }

  function resetStatusGrid() {
    statPath.textContent = '-';
    statPath.style.color = '';
    statGitInit.textContent = '-';
    statGitInit.style.color = '';
    statBranch.textContent = '-';
    statBranch.style.color = '';
    statCommits.textContent = '-';
    statCommits.style.color = '';
    statChangesSummary.textContent = '-';
    statChangesSummary.style.color = '';
    statChangesList.innerHTML = '';
    statChangesList.classList.add('hidden');
  }

  function showScanFeedback(message, type) {
    scanFeedback.textContent = message;
    scanFeedback.className = `status-feedback ${type}`;
  }

  // 7. Clear logs
  btnClearLogs.addEventListener('click', () => {
    consoleLogs.textContent = 'Logs cleared. Waiting for operations...';
  });

  function appendLog(text) {
    if (consoleLogs.textContent.startsWith('System ready.') || consoleLogs.textContent.startsWith('Logs cleared.')) {
      consoleLogs.textContent = '';
    }
    consoleLogs.textContent += text;
    // Auto Scroll to Bottom
    const consoleBody = document.querySelector('.console-body');
    consoleBody.scrollTop = consoleBody.scrollHeight;
  }

  // 8. Visual roadmap steps UI updates
  function updateStepUI(stepName, status) {
    const stepEl = document.getElementById(`step-${stepName}`);
    if (!stepEl) return;

    stepEl.classList.remove('active', 'success', 'failed');

    if (status === 'running') {
      stepEl.classList.add('active');
    } else if (status === 'success') {
      stepEl.classList.add('success');
    } else if (status === 'failed') {
      stepEl.classList.add('failed');
    }
  }

  function resetAllStepsUI() {
    document.querySelectorAll('.step').forEach(stepEl => {
      stepEl.classList.remove('active', 'success', 'failed');
    });
  }

  // 9. Run Push Automation (Main Trigger)
  btnPushAction.addEventListener('click', () => {
    const localPath = localPathInput.value.trim();
    const repoUrl = repoUrlInput.value.trim();
    const useOverride = overrideToggle.checked;
    const gitName = gitUsernameInput.value.trim();
    const gitEmail = gitEmailInput.value.trim();
    const token = githubTokenInput.value.trim();
    const commitMsg = commitMsgInput.value.trim();
    const branchName = branchNameInput.value.trim();
    const forcePush = forcePushToggle.checked;
    const createGitignore = gitignoreToggle.checked;

    if (!localPath || !repoUrl) return;

    // UI resets
    resetAllStepsUI();
    consoleLogs.textContent = 'Starting automation runner...\n';
    disableForm(true);

    // Build URL query params for EventSource
    const sseUrl = new URL('/api/git-push', window.location.origin);
    sseUrl.searchParams.append('dirPath', localPath);
    sseUrl.searchParams.append('repoUrl', repoUrl);
    sseUrl.searchParams.append('commitMessage', commitMsg);
    sseUrl.searchParams.append('branch', branchName);
    sseUrl.searchParams.append('forcePush', forcePush ? 'true' : 'false');
    sseUrl.searchParams.append('createGitignore', createGitignore ? 'true' : 'false');
    sseUrl.searchParams.append('autoCommitMsg', autoCommitMsgToggle.checked ? 'true' : 'false');
    sseUrl.searchParams.append('githubAccount', githubAccountSelect.value);
    
    if (useOverride) {
      if (gitName) sseUrl.searchParams.append('username', gitName);
      if (gitEmail) sseUrl.searchParams.append('email', gitEmail);
    }
    
    if (token) {
      sseUrl.searchParams.append('token', token);
    }

    // Pre-Push command parameter
    const runPrePush = prepushToggle.checked;
    const prePushCmd = prepushCmdInput.value.trim();
    if (runPrePush && prePushCmd) {
      sseUrl.searchParams.append('prePushCmd', prePushCmd);
    }

    // Connect Server-Sent Events
    activeEventSource = new EventSource(sseUrl.toString());

    activeEventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'log') {
          appendLog(data.text);
        } else if (data.type === 'step') {
          updateStepUI(data.name, data.status);
        } else if (data.type === 'complete') {
          activeEventSource.close();
          disableForm(false);
          
          if (data.status === 'success') {
            appendLog(`\n[SUCCESS] ${data.message}\n`);
            // Show custom success modal
            btnOpenGithub.href = repoUrlInput.value.trim();
            successModal.classList.remove('hidden');

            // Show PR Modal option if branch is not default
            const currentBranchName = branchNameInput.value.trim();
            if (currentBranchName !== 'main' && currentBranchName !== 'master') {
              btnSuccessOpenPrModal.classList.remove('hidden');
              prHeadInput.value = currentBranchName;
              prTitleInput.value = `Merge ${currentBranchName} to main`;
              prBodyInput.value = `Automated Pull Request to merge updates from the feature branch "${currentBranchName}".`;
            } else {
              btnSuccessOpenPrModal.classList.add('hidden');
            }
          } else {
            appendLog(`\n[FAILED] ${data.message}\n`);
            alert('Push failed. Review the terminal output logs for troubleshooting hints.');
          }
        }
      } catch (err) {
        console.error('Error parsing event data:', err);
      }
    };

    activeEventSource.onerror = (error) => {
      console.error('SSE Error:', error);
      activeEventSource.close();
      disableForm(false);
      appendLog('\n[ERROR] Connection to push service was lost or terminated.\n');
    };
  });

  function disableForm(disabled) {
    localPathInput.disabled = disabled;
    repoUrlInput.disabled = disabled;
    btnScan.disabled = disabled;
    overrideToggle.disabled = disabled;
    gitUsernameInput.disabled = disabled;
    gitEmailInput.disabled = disabled;
    saveIdentityToggle.disabled = disabled;
    saveTokenToggle.disabled = disabled;
    githubTokenInput.disabled = disabled;
    autoCommitMsgToggle.disabled = disabled;
    
    if (disabled) {
      commitMsgInput.disabled = true;
    } else {
      updateCommitMsgInputState();
    }
    
    branchNameInput.disabled = disabled;
    gitignoreToggle.disabled = disabled;
    forcePushToggle.disabled = disabled;
    btnPushAction.disabled = disabled;
  }

  // Pre-Push Command Toggler
  prepushToggle.addEventListener('change', () => {
    if (prepushToggle.checked) {
      prepushCommandGroup.classList.remove('hidden');
    } else {
      prepushCommandGroup.classList.add('hidden');
    }
  });

  // Auto-Backup Sync Toggler
  backupToggle.addEventListener('change', async () => {
    const dirPath = localPathInput.value.trim();
    const repoUrl = repoUrlInput.value.trim();
    const token = githubTokenInput.value.trim();
    const branch = branchNameInput.value.trim();
    const commitMessage = commitMsgInput.value.trim() || 'Backup sync';
    const forcePush = forcePushToggle.checked;
    const createGitignore = gitignoreToggle.checked;
    const prePushCmd = prepushToggle.checked ? prepushCmdInput.value.trim() : '';
    const autoCommitMsg = autoCommitMsgToggle.checked;
    const githubAccount = githubAccountSelect.value;

    if (!dirPath || !repoUrl) {
      backupToggle.checked = false;
      alert('Please scan a folder and enter a repository URL first.');
      return;
    }

    if (backupToggle.checked) {
      // Request desktop notification permission securely when starting backup
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
      }
      backupConfigFields.classList.remove('hidden');
      updateBackupStatus('starting', 'Starting sync...');
      
      try {
        const response = await fetch('/api/backup/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dirPath, repoUrl, token, branch, commitMessage, forcePush, createGitignore, prePushCmd, autoCommitMsg, githubAccount })
        });
        const data = await response.json();
        if (data.success) {
          updateBackupStatus('active', 'Backup: Watcher Active');
          startBackupPolling(dirPath);
          loadRecentFolders();
        } else {
          backupToggle.checked = false;
          backupConfigFields.classList.add('hidden');
          alert(`Failed to start backup: ${data.error}`);
        }
      } catch (err) {
        backupToggle.checked = false;
        backupConfigFields.classList.add('hidden');
        alert('Failed to connect to backend.');
      }
    } else {
      try {
        const response = await fetch('/api/backup/stop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dirPath })
        });
        const data = await response.json();
        updateBackupStatus('inactive', 'Backup: Inactive');
        stopBackupPolling();
        loadRecentFolders();
        setTimeout(() => {
          backupConfigFields.classList.add('hidden');
        }, 1000);
      } catch (err) {
        alert('Failed to stop backup watcher.');
      }
    }
  });

  function updateBackupStatus(state, text) {
    backupStatusText.textContent = text;
    backupDot.className = 'status-dot';
    backupDot.style.boxShadow = '';
    backupDot.style.backgroundColor = '';

    if (state === 'active') {
      backupDot.classList.add('mini', 'backup-active');
      backupDot.style.backgroundColor = 'var(--secondary-color)';
    } else if (state === 'starting') {
      backupDot.classList.add('mini');
      backupDot.style.backgroundColor = 'var(--warning-color)';
    } else if (state === 'syncing') {
      backupDot.classList.add('mini');
      backupDot.style.backgroundColor = 'var(--warning-color)';
    } else if (state === 'conflict') {
      backupDot.classList.add('mini');
      backupDot.style.backgroundColor = 'var(--error-color)';
      backupDot.style.boxShadow = '0 0 10px var(--error-color)';
    } else if (state === 'inactive') {
      backupDot.style.backgroundColor = 'var(--text-dim)';
    }
  }

  // Desktop Notification helper
  let lastNotificationTime = 0;
  function showDesktopNotification(title, body) {
    if (!("Notification" in window) || Notification.permission !== "granted") {
      return;
    }
    // Throttle notifications to once every 30 seconds to prevent annoying the user
    const now = Date.now();
    if (now - lastNotificationTime > 30000) {
      new Notification(title, { body });
      lastNotificationTime = now;
    }
  }

  function startBackupPolling(dirPath) {
    stopBackupPolling();
    pollBackupLogs(dirPath);
    backupPollInterval = setInterval(() => {
      pollBackupLogs(dirPath);
    }, 4000);
  }

  function stopBackupPolling() {
    if (backupPollInterval) {
      clearInterval(backupPollInterval);
      backupPollInterval = null;
    }
  }

  async function pollBackupLogs(dirPath) {
    try {
      const response = await fetch(`/api/backup/status?dirPath=${encodeURIComponent(dirPath)}`);
      const data = await response.json();
      if (data.active && data.logs) {
        if (data.logs.length > 0) {
          backupLogs.textContent = data.logs.join('\n');
        } else {
          backupLogs.textContent = 'Waiting for changes...';
        }
        backupLogs.scrollTop = backupLogs.scrollHeight;

        // Update UI dot based on status
        if (data.status === 'conflict') {
          updateBackupStatus('conflict', 'Backup: Merge Conflict! Resolve manually.');
          showDesktopNotification('GitAuto Push: Merge Conflict', `Folder "${dirPath}" has a merge conflict with GitHub. Resolve it manually.`);
        } else if (data.status === 'syncing') {
          updateBackupStatus('syncing', 'Backup: Syncing changes...');
        } else if (data.status === 'error') {
          updateBackupStatus('conflict', 'Backup: Sync Error! Check logs.');
        } else {
          updateBackupStatus('active', 'Backup: Watcher Active');
        }
      } else if (!data.active) {
        backupToggle.checked = false;
        updateBackupStatus('inactive', 'Backup: Terminated');
        stopBackupPolling();
      }
    } catch (err) {
      console.error('Error polling backup status:', err);
    }
  }

  async function checkBackupStatusForPath(dirPath) {
    if (!dirPath) return;
    try {
      const response = await fetch(`/api/backup/status?dirPath=${encodeURIComponent(dirPath)}`);
      const data = await response.json();
      if (data.active) {
        backupToggle.checked = true;
        backupConfigFields.classList.remove('hidden');
        
        if (data.status === 'conflict') {
          updateBackupStatus('conflict', 'Backup: Merge Conflict! Resolve manually.');
        } else if (data.status === 'syncing') {
          updateBackupStatus('syncing', 'Backup: Syncing changes...');
        } else if (data.status === 'error') {
          updateBackupStatus('conflict', 'Backup: Sync Error! Check logs.');
        } else {
          updateBackupStatus('active', 'Backup: Watcher Active');
        }
        
        startBackupPolling(dirPath);
      } else {
        backupToggle.checked = false;
        backupConfigFields.classList.add('hidden');
        updateBackupStatus('inactive', 'Backup: Inactive');
        stopBackupPolling();
      }
    } catch (err) {
      console.error('Error checking path backup status:', err);
    }
  }

  // Success Modal: Create PR button
  btnSuccessOpenPrModal.addEventListener('click', () => {
    successModal.classList.add('hidden');
    prModal.classList.remove('hidden');
    prFeedback.className = 'status-feedback hidden';
  });

  // PR Modal Close triggers
  btnClosePrModal.addEventListener('click', () => {
    prModal.classList.add('hidden');
  });

  prModal.addEventListener('click', (e) => {
    if (e.target === prModal) {
      prModal.classList.add('hidden');
    }
  });

  // Create PR Action trigger
  btnCreatePrAction.addEventListener('click', async () => {
    const token = githubTokenInput.value.trim();
    const repoUrl = repoUrlInput.value.trim();
    const title = prTitleInput.value.trim();
    const body = prBodyInput.value.trim();
    const base = prBaseInput.value.trim();
    const head = prHeadInput.value.trim();
    const githubAccount = githubAccountSelect.value;

    if (githubAccount === 'custom' && !token) {
      showPrFeedback('GitHub Token is missing. Enter token in Step 4.', 'error');
      return;
    }
    if (!title) {
      showPrFeedback('PR Title is required.', 'error');
      return;
    }

    showPrFeedback('Creating Pull Request on GitHub...', 'info');
    btnCreatePrAction.disabled = true;

    try {
      const response = await fetch('/api/create-pr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, repoUrl, title, body, head, base, githubAccount })
      });
      const data = await response.json();
      btnCreatePrAction.disabled = false;

      if (data.error) {
        showPrFeedback(`Error: ${data.error}`, 'error');
        return;
      }

      if (data.success && data.htmlUrl) {
        showPrFeedback('PR Created Successfully! Opening in new tab...', 'success');
        setTimeout(() => {
          prModal.classList.add('hidden');
          window.open(data.htmlUrl, '_blank');
        }, 1500);
      }
    } catch (err) {
      btnCreatePrAction.disabled = false;
      showPrFeedback('Failed to contact server to create PR.', 'error');
    }
  });

  function showPrFeedback(msg, type) {
    prFeedback.textContent = msg;
    prFeedback.className = `status-feedback ${type}`;
    prFeedback.classList.remove('hidden');
  }
});
