// Content script that runs on web pages
console.log('DeepFocus Demo Extension: Content script loaded');

interface ContentBlockingState {
  isBlocked: boolean;
  blockedSites: string[];
  blockMode: 'whitelist' | 'blacklist';
  whitelistSites: string[];
}

interface TimerState {
  isActive: boolean;
  timeLeft: number;
  initialTime: number;
  breakMode: boolean;
  breakTimeLeft: number;
  breakInitialTime: number;
  lastUpdateTime: number;
}

let contentBlockingState: ContentBlockingState = {
  isBlocked: false,
  blockedSites: [],
  blockMode: 'blacklist',
  whitelistSites: []
};

let timerState: TimerState = {
  isActive: false,
  timeLeft: 0,
  initialTime: 0,
  breakMode: false,
  breakTimeLeft: 0,
  breakInitialTime: 0,
  lastUpdateTime: 0
};

let blockingOverlay: HTMLElement | null = null;
let blockedKeywords: string[] = [];
let allowedKeywords: string[] = [];
let filterList: string[] = [];

// Load blocking state from background script
const loadBlockingState = () => {
  chrome.runtime.sendMessage({ type: 'GET_BLOCKING_STATE' }, (response: ContentBlockingState) => {
    if (response) {
      contentBlockingState = response;
    }
  });
};

// Load timer state from background script
const loadTimerState = () => {
  chrome.runtime.sendMessage({ type: 'GET_TIMER_STATE' }, (response: TimerState) => {
    if (response) {
      timerState = response;
    }
  });
};

// Load blocked keywords from chrome.storage.sync
const loadBlockedKeywords = () => {
  chrome.storage.sync.get({ customKeywords: ['gaming', 'celebrity', 'sports', 'f1'] }, (items) => {
    blockedKeywords = items.customKeywords || [];
  });
};

// Load allowed keywords from chrome.storage.sync
const loadAllowedKeywords = () => {
  chrome.storage.sync.get({ allowedKeywords: ['work', 'study', 'productivity'] }, (items) => {
    allowedKeywords = items.allowedKeywords || [];
  });
};

// Load filterList from chrome.storage.sync
const loadFilterList = () => {
  chrome.storage.sync.get({ filterList: ['youtube.com', 'reddit.com', 'bilibili.com'] }, (items) => {
    filterList = items.filterList || [];
    console.log('FilterList loaded:', filterList);
  });
};

// Check if current site should be blocked and apply blocking if needed
const checkAndApplyBlocking = () => {
  console.log('checkAndApplyBlocking called. Timer state:', timerState);

  // Only block if timer is active and not in break mode
  if (!timerState.isActive || timerState.breakMode) {
    console.log('Timer not active or in break mode, removing overlay');
    if (blockingOverlay) {
      blockingOverlay.remove();
      blockingOverlay = null;
    }
    return;
  }

  const currentUrl = window.location.href;

  // Check for blocklist first
  const hostname = new URL(currentUrl).hostname;
  console.log('Checking if site should be blocked:', currentUrl);
  
  chrome.runtime.sendMessage({ 
    type: 'CHECK_SITE_BLOCKED', 
    url: currentUrl 
  }, (response) => {
    console.log('Background response:', response);
    if (response && response.shouldBlock) {
      console.log('Site should be blocked, creating overlay');
      createBlockingOverlay();
      return;
    }
    // Only run keyword filtering if the site matches filterList
    const matchesFilterList = filterList.some(site => hostname.includes(site) || site.includes(hostname));
    console.log(`Checking ML filtering - Hostname: ${hostname}, FilterList: [${filterList.join(', ')}], Matches: ${matchesFilterList}`);
    if (matchesFilterList) {
      // ML-based semantic similarity filtering using background script
      const bodyText = document.body ? document.body.innerText : '';

      // Send text to background script for ML processing
      chrome.runtime.sendMessage({
        type: 'COMPUTE_PAGE_SIMILARITY',
        text: bodyText,
        blockedKeywords: blockedKeywords,
        allowedKeywords: allowedKeywords
      }, (response) => {
        if (!response) {
          console.log('No response from background script, removing overlay');
          if (blockingOverlay) {
            blockingOverlay.remove();
            blockingOverlay = null;
          }
          return;
        }

        console.log('ML Similarity Response:', response);

        // Check if page should be blocked based on ML similarity
        if (response.shouldBlock) {
          console.log(`Page blocked by ML similarity - Blocked: ${response.blockedSimilarity.toFixed(3)}, Allowed: ${response.allowedSimilarity.toFixed(3)}`);
          createBlockingOverlay();
        } else {
          console.log(`Page allowed - Blocked: ${response.blockedSimilarity.toFixed(3)}, Allowed: ${response.allowedSimilarity.toFixed(3)}`);
          if (blockingOverlay) {
            blockingOverlay.remove();
            blockingOverlay = null;
          }
        }
      });
    } else {
      console.log('Site should not be blocked, removing overlay');
      if (blockingOverlay) {
        blockingOverlay.remove();
        blockingOverlay = null;
      }
    }
  });
};

// Create blocking overlay
const createBlockingOverlay = () => {
  if (blockingOverlay) return;

  blockingOverlay = document.createElement('div');
  blockingOverlay.id = 'deepfocus-blocking-overlay';
  blockingOverlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    z-index: 2147483647;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: white;
    text-align: center;
    padding: 2rem;
    box-sizing: border-box;
  `;

  const content = `
    <div style="max-width: 500px;">
      <div style="font-size: 4rem; margin-bottom: 1rem;">🧠</div>
      <h1 style="font-size: 2.5rem; font-weight: bold; margin-bottom: 1rem; background: linear-gradient(45deg, #fff, #e0e7ff); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
        DeepFocus Active
      </h1>
      <p style="font-size: 1.2rem; margin-bottom: 2rem; opacity: 0.9; line-height: 1.6;">
        This site is blocked during your focus session. 
        Stay focused on your work - you can access this site during breaks.
      </p>


    </div>
  `;

  blockingOverlay.innerHTML = content;
  document.body.appendChild(blockingOverlay);

  // The interval will automatically stop due to shouldStopChecking()
};

// Remove blocking overlay
const removeBlockingOverlay = () => {
  if (blockingOverlay) {
    blockingOverlay.remove();
    blockingOverlay = null;
    // Restart the blocking check interval when overlay is removed
    startBlockingCheck();
  }
};

// Connect to background script for real-time updates
const port = chrome.runtime.connect({ name: 'content-script' });

port.onMessage.addListener((message) => {
  if (message.type === 'BLOCKING_UPDATE') {
    contentBlockingState = message.state;
    startBlockingCheck();
  } else if (message.type === 'TIMER_UPDATE') {
    const previousTimerState = { ...timerState };
    timerState = message.state;

    // Check if timer just finished (was active, now inactive)
    if (previousTimerState.isActive && !timerState.isActive && blockingOverlay) {
      console.log('Timer finished, removing overlay immediately');
      if (blockingOverlay) {
        blockingOverlay.remove();
        blockingOverlay = null;
      }
      // Stop the blocking check since timer is no longer active
      if (blockingCheckInterval) {
        clearInterval(blockingCheckInterval);
        blockingCheckInterval = null;
      }
    } else if (!previousTimerState.isActive && timerState.isActive) { 
      // For other timer updates, restart the blocking check
      console.log('Restarting blocking check due to timer update_1');
      setTimeout(() => {
        startBlockingCheck();
      }, 1000);
    }
  }
});

// Listen for messages from background script (for tabs that don't use port)
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'BLOCKING_UPDATE') {
    console.log('Content script received BLOCKING_UPDATE:', message.state);
    contentBlockingState = message.state;
    startBlockingCheck();
  } else if (message.type === 'TIMER_UPDATE') {
    console.log('Content script received TIMER_UPDATE:', message.state);
    const previousTimerState = { ...timerState };
    timerState = message.state;

    // Check if timer just finished (was active, now inactive)
    if (previousTimerState.isActive && !timerState.isActive && blockingOverlay) {
      console.log('Timer finished, removing overlay immediately');
      if (blockingOverlay) {
        blockingOverlay.remove();
        blockingOverlay = null;
      }
      // Stop the blocking check since timer is no longer active
      if (blockingCheckInterval) {
        clearInterval(blockingCheckInterval);
        blockingCheckInterval = null;
      }
    } else if (!previousTimerState.isActive && timerState.isActive) { 
      // For other timer updates, restart the blocking check
      console.log('Restarting blocking check due to timer update_2');
      // startBlockingCheck();
      setTimeout(() => {
        // Start the blocking check interval
        startBlockingCheck();
      }, 1000);
    }
  }
});

// Load blocking state on script load
loadBlockingState();
loadTimerState();
loadBlockedKeywords();
loadAllowedKeywords();
loadFilterList();

// Check blocking state periodically (every 10 seconds), but stop when page is blocked
let blockingCheckInterval: NodeJS.Timeout | null = null;

const shouldStopChecking = () => {
  // Stop checking if:
  // - Overlay is already present
  // - Timer is not active
  // - Timer is in break mode
  // - Tab is not visible
  console.log('Checking if blocking should stop:', {
    blockingOverlay,
    timerState,
    documentHidden: document.hidden
  });

  return blockingOverlay ||
         !timerState.isActive ||
         timerState.breakMode ||
         document.hidden; // Tab not visible
};

const startBlockingCheck = () => {
  console.log('Starting blocking check interval');
  if (blockingCheckInterval) {
    clearInterval(blockingCheckInterval);
  }

  setTimeout(() => {
    // Start the blocking check interval
    checkAndApplyBlocking_helper();
  }, 1000);

  blockingCheckInterval = setInterval(() => {
    checkAndApplyBlocking_helper();
  }, 10000); // Check every 10 seconds instead of 1 second

  console.log('Blocking check interval created with ID:', blockingCheckInterval);
};

// helper function
const checkAndApplyBlocking_helper = () => {
  console.log('[Interval] Blocking check interval fired at', new Date().toLocaleTimeString());
  // Check stop condition before running
  if (shouldStopChecking()) {
    console.log('[Interval] Stopping check due to shouldStopChecking() =', true);
    if (blockingCheckInterval) {
      clearInterval(blockingCheckInterval);
      blockingCheckInterval = null;
    }
    return;
  }
  console.log('[Interval] Calling checkAndApplyBlocking()');
  checkAndApplyBlocking();
};

// Don't start blocking check on initial load - only on window focus
// startBlockingCheck();

// Check blocking when window gains focus
window.addEventListener('focus', () => {
  loadTimerState();
  loadBlockingState();
  loadBlockedKeywords();
  loadAllowedKeywords();
  loadFilterList();
  setTimeout(() => {
    // Start the blocking check interval
    startBlockingCheck();
  }, 1000);
});

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request: any, sender: any, sendResponse: any) => {
  console.log('Message received:', request);

  if (request.action === 'changeColor') {
    // Change the background color of the page
    const colors = ['#ffeb3b', '#4caf50', '#2196f3', '#ff9800', '#9c27b0'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    
    if (document.body) {
      document.body.style.backgroundColor = randomColor;
      document.body.style.transition = 'background-color 0.5s ease';
    }
    
    sendResponse({ success: true, color: randomColor });
  }
  
  else if (request.action === 'getInfo') {
    // Get information about the current page
    const pageInfo = {
      title: document.title,
      url: window.location.href,
      domain: window.location.hostname,
      timestamp: new Date().toISOString()
    };
    
    sendResponse({ success: true, info: pageInfo });
  }
  
  return true; // Keep the message channel open for async response
});

 