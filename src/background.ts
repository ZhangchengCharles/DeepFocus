import { embeddingModel, cosineSimilarity } from './ml/embeddings';
import { createSlidingWindows, calculate75thPercentile } from './ml/tokenizer';
import { EmbeddingCache, SimilarityResult, MLModelStatus } from './ml/types';

interface TimerState {
  isActive: boolean;
  timeLeft: number;
  initialTime: number;
  breakMode: boolean;
  breakTimeLeft: number;
  breakInitialTime: number;
  lastUpdateTime: number;
}

interface BlockingState {
  isBlocked: boolean;
  blockedSites: string[];
  blockMode: 'whitelist' | 'blacklist';
  whitelistSites: string[];
}

let timerInterval: NodeJS.Timeout | null = null;
let currentState: TimerState = {
  isActive: false,
  timeLeft: 60,
  initialTime: 60,
  breakMode: false,
  breakTimeLeft: 5,
  breakInitialTime: 5,
  lastUpdateTime: Date.now()
};

let blockingState: BlockingState = {
  isBlocked: true,
  blockedSites: [],
  blockMode: 'blacklist',
  whitelistSites: []
};

// Track connected clients
let connectedClients: chrome.runtime.Port[] = [];

// ML Model state
let keywordEmbeddingCache: EmbeddingCache = {};
let mlModelStatus: MLModelStatus = null;
let mlModelError: string | null = null;

// Initialize ML model
async function initializeMLModel() {
  try {
    mlModelStatus = 'loading';
    console.log('Initializing ML model...');

    await embeddingModel.initialize((progress) => {
      console.log('Model loading progress:', progress);
    });

    mlModelStatus = 'ready';
    mlModelError = null;
    console.log('ML model initialized successfully');

    // Precompute embeddings for default keywords
    chrome.storage.sync.get({
      customKeywords: ['gaming', 'celebrity', 'sports', 'f1'],
      allowedKeywords: ['work', 'study', 'productivity']
    }, async (items) => {
      const allKeywords = [...items.customKeywords, ...items.allowedKeywords];
      await precomputeKeywordEmbeddings(allKeywords);
    });
  } catch (error) {
    mlModelStatus = 'error';
    mlModelError = error instanceof Error ? error.message : 'Unknown error';
    console.error('Failed to initialize ML model:', error);
  }
}

// Precompute embeddings for keywords and cache them
async function precomputeKeywordEmbeddings(keywords: string[]): Promise<void> {
  if (mlModelStatus !== 'ready') {
    console.warn('Model not ready, skipping keyword embedding precomputation');
    return;
  }

  console.log('Precomputing embeddings for keywords:', keywords);

  for (const keyword of keywords) {
    try {
      if (!keywordEmbeddingCache[keyword]) {
        const embedding = await embeddingModel.computeEmbedding(keyword);
        keywordEmbeddingCache[keyword] = embedding;
        console.log(`Cached embedding for keyword: ${keyword}`);
      }
    } catch (error) {
      console.error(`Failed to compute embedding for keyword "${keyword}":`, error);
    }
  }
}

// Compute page similarity using sliding window and 75th percentile aggregation
async function computePageSimilarity(
  text: string,
  blockedKeywords: string[],
  allowedKeywords: string[]
): Promise<SimilarityResult> {
  // Auto-initialize if model not ready
  if (mlModelStatus === null || mlModelStatus === 'error') {
    console.log('ML model not initialized, initializing now...');
    await initializeMLModel();
  } else if (mlModelStatus === 'loading') {
    // Model is currently loading, wait for it
    console.log('ML model is loading, waiting...');
    while (mlModelStatus === 'loading') {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // Check if model is ready after initialization attempt
  if (mlModelStatus !== 'ready') {
    console.warn('ML model failed to initialize, returning default result');
    return {
      blockedSimilarity: 0,
      allowedSimilarity: 0,
      shouldBlock: false
    };
  }

  try {
    // Create sliding windows from text
    const windows = createSlidingWindows(text, 512, 128);
    console.log(`Processing ${windows.length} windows for similarity check`);

    const blockedSimilarities: number[] = [];
    const allowedSimilarities: number[] = [];

    // Process each window
    for (const window of windows) {
      const pageEmbedding = await embeddingModel.computeEmbedding(window.text);

      // Compute max similarity to blocked keywords for this window
      let maxBlockedSim = 0;
      for (const keyword of blockedKeywords) {
        const keywordEmbedding = keywordEmbeddingCache[keyword];
        if (keywordEmbedding) {
          const similarity = cosineSimilarity(pageEmbedding, keywordEmbedding);
          maxBlockedSim = Math.max(maxBlockedSim, similarity);
        }
      }
      blockedSimilarities.push(maxBlockedSim);

      // Compute max similarity to allowed keywords for this window
      let maxAllowedSim = 0;
      for (const keyword of allowedKeywords) {
        const keywordEmbedding = keywordEmbeddingCache[keyword];
        if (keywordEmbedding) {
          const similarity = cosineSimilarity(pageEmbedding, keywordEmbedding);
          maxAllowedSim = Math.max(maxAllowedSim, similarity);
        }
      }
      allowedSimilarities.push(maxAllowedSim);

      // Early exit if very high similarity detected
      if (maxBlockedSim > 0.85 && blockedSimilarities.length >= Math.ceil(windows.length * 0.5)) {
        console.log('Early exit: High blocked similarity detected');
        break;
      }
    }

    // Calculate 75th percentile for aggregation
    const blockedSimilarity = calculate75thPercentile(blockedSimilarities);
    const allowedSimilarity = calculate75thPercentile(allowedSimilarities);

    console.log(`Similarity scores - Blocked: ${blockedSimilarity.toFixed(3)}, Allowed: ${allowedSimilarity.toFixed(3)}`);

    // Determine if page should be blocked
    // Based on empirical testing:
    // - Single keywords to related content: 0.5-0.7
    // - Articles to keywords: 0.3-0.5
    // - Unrelated content: <0.3
    const BLOCK_THRESHOLD = 0.30; 
    const ALLOW_THRESHOLD = 0.55;  // Lowered from 0.60 to better match real allowed content

    const shouldBlock = blockedSimilarity > BLOCK_THRESHOLD && allowedSimilarity < ALLOW_THRESHOLD;

    return {
      blockedSimilarity,
      allowedSimilarity,
      shouldBlock
    };
  } catch (error) {
    console.error('Error computing page similarity:', error);
    return {
      blockedSimilarity: 0,
      allowedSimilarity: 0,
      shouldBlock: false
    };
  }
}

// Load state from storage on startup
chrome.storage.local.get(['timerState', 'blockingState'], (result) => {
  if (result.timerState) {
    currentState = { ...currentState, ...result.timerState };
    // Adjust time based on elapsed time since last update
    if (currentState.isActive && currentState.lastUpdateTime) {
      const elapsedSeconds = Math.floor((Date.now() - currentState.lastUpdateTime) / 1000);
      if (currentState.breakMode) {
        currentState.breakTimeLeft = Math.max(0, currentState.breakTimeLeft - elapsedSeconds);
      } else {
        currentState.timeLeft = Math.max(0, currentState.timeLeft - elapsedSeconds);
      }
      currentState.lastUpdateTime = Date.now();
    }
    updateTimer();
  }
  
  if (result.blockingState) {
    blockingState = { ...blockingState, ...result.blockingState };
  } else {
    // If blockingState is missing, set default
    chrome.storage.local.set({
      blockingState: {
        isBlocked: true,
        blockedSites: ['facebook.com', 'twitter.com', 'instagram.com'],
        blockMode: 'blacklist',
        whitelistSites: []
      }
    }, () => {
      blockingState = {
        isBlocked: true,
        blockedSites: ['facebook.com', 'twitter.com', 'instagram.com'],
        blockMode: 'blacklist',
        whitelistSites: []
      };
    });
  }
});

// Show notification function
function showNotification(title: string, message: string) {
  console.log('Attempting to show notification:', title, message);
  
  chrome.storage.sync.get(['settings'], (result) => {
    const settings = result.settings || { desktopNotifications: true };
    
    if (!settings.desktopNotifications) {
      console.log('Notifications disabled in settings');
      return; // Don't show notifications if disabled
    }

    console.log('Notifications enabled, checking Chrome notifications API...');

    // Check if Chrome notifications API is available
    if (typeof chrome !== 'undefined' && chrome.notifications) {
      console.log('Chrome notifications API available, creating notification...');
      
      chrome.notifications.create({
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/brain48.png'),
        title: title,
        message: message,
        requireInteraction: false,
        silent: false
      }, (notificationId) => {
        if (chrome.runtime.lastError) {
          console.error('Chrome notification error:', chrome.runtime.lastError);
          // Fallback to browser notifications
          fallbackNotification(title, message);
        } else {
          console.log('Notification created successfully with ID:', notificationId);
        }
      });
    } else {
      console.error('Chrome notifications API not available, trying fallback...');
      fallbackNotification(title, message);
    }
  });
}

// Fallback notification using browser's native notification API
function fallbackNotification(title: string, message: string) {
  console.log('Using fallback notification API');
  
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, {
      body: message,
      icon: chrome.runtime.getURL('icons/brain48.png'),
      requireInteraction: false,
      silent: false
    });
  } else if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().then((permission) => {
      if (permission === 'granted') {
        new Notification(title, {
          body: message,
          icon: chrome.runtime.getURL('icons/brain48.png'),
          requireInteraction: false,
          silent: false
        });
      }
    });
  } else {
    console.error('No notification API available');
  }
}

// Broadcast timer state to all connected clients
function broadcastTimerState() {
  connectedClients.forEach(port => {
    try {
      port.postMessage({ type: 'TIMER_UPDATE', state: currentState });
    } catch (error) {
      // Remove disconnected clients
      connectedClients = connectedClients.filter(p => p !== port);
    }
  });
  
  // Also notify all tabs about timer state changes
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'TIMER_UPDATE', state: currentState }).catch(() => {
          // Ignore errors for tabs that don't have content scripts
        });
      }
    });
  });
}

// Broadcast blocking state to all connected clients
function broadcastBlockingState() {
  connectedClients.forEach(port => {
    try {
      port.postMessage({ type: 'BLOCKING_UPDATE', state: blockingState });
    } catch (error) {
      // Remove disconnected clients
      connectedClients = connectedClients.filter(p => p !== port);
    }
  });
  
  // Also notify all tabs about blocking state changes
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'BLOCKING_UPDATE', state: blockingState }).catch(() => {
          // Ignore errors for tabs that don't have content scripts
        });
      }
    });
  });
}

// Check if current site should be blocked
function shouldBlockSite(url: string): boolean {
  console.log('shouldBlockSite called for:', url);
  console.log('Current timer state:', currentState);
  console.log('Current blocking state:', blockingState);
  
  // Only block sites when focus timer is active (not during breaks)
  if (!currentState.isActive || currentState.breakMode) {
    console.log('Timer not active or in break mode, not blocking');
    return false;
  }
  
  const hostname = new URL(url).hostname;
  console.log('Checking hostname:', hostname);
  
  if (blockingState.blockMode === 'whitelist') {
    const shouldBlock = !blockingState.whitelistSites.some(site => 
      hostname.includes(site) || site.includes(hostname)
    );
    console.log('Whitelist mode, should block:', shouldBlock);
    return shouldBlock;
  } else {
    const shouldBlock = blockingState.blockedSites.some(site => 
      hostname.includes(site) || site.includes(hostname)
    );
    console.log('Blacklist mode, should block:', shouldBlock);
    return shouldBlock;
  }
}

function updateTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  if (currentState.isActive) {
    timerInterval = setInterval(() => {
      const now = Date.now();
      const elapsedSeconds = Math.floor((now - currentState.lastUpdateTime) / 1000);

      if (elapsedSeconds <= 0) return; // No full second has passed yet

      if (currentState.breakMode) {
        if (currentState.breakTimeLeft > 0) {
          currentState.breakTimeLeft = Math.max(0, currentState.breakTimeLeft - elapsedSeconds);
          currentState.lastUpdateTime = now;
        }

        if (currentState.breakTimeLeft <= 0) {
          // Break finished, switch back to focus mode
          currentState.isActive = false;
          currentState.breakMode = false;
          currentState.breakTimeLeft = currentState.breakInitialTime;
          currentState.timeLeft = currentState.initialTime;
          currentState.lastUpdateTime = now;
          clearInterval(timerInterval!);
          timerInterval = null;

          // Show break completion notification
          showNotification(
            'Break Complete! 🎉',
            'Time to get back to work. Your focus session is ready to begin.'
          );
        }
      } else {
        if (currentState.timeLeft > 0) {
          currentState.timeLeft = Math.max(0, currentState.timeLeft - elapsedSeconds);
          currentState.lastUpdateTime = now;
        }

        if (currentState.timeLeft <= 0) {
          // Focus session finished, check if auto-start breaks is enabled
          chrome.storage.sync.get(['settings'], (result) => {
            const settings = result.settings || { autoStartBreaks: true };
            if (settings.autoStartBreaks && currentState.breakInitialTime > 0) {
              currentState.breakMode = true;
              currentState.breakTimeLeft = currentState.breakInitialTime;
              currentState.lastUpdateTime = Date.now();

              // Show focus completion notification
              showNotification(
                'Focus Session Complete! 🎯',
                `Great job! Take a ${Math.floor(currentState.breakInitialTime)} second break.`
              );
            } else {
              currentState.isActive = false;
              currentState.timeLeft = currentState.initialTime; // Reset to default time
              currentState.lastUpdateTime = Date.now();
              clearInterval(timerInterval!);
              timerInterval = null;

              // Show focus completion notification (no break)
              showNotification(
                'Focus Session Complete! 🎯',
                'Excellent work! Your focus session has ended.'
              );
            }
            // Save state to storage and broadcast to clients
            chrome.storage.local.set({ timerState: currentState });
            broadcastTimerState();
          });
          return; // Exit early since we're handling the state update in the callback
        }
      }
      
      // Save state to storage and broadcast to clients
      chrome.storage.local.set({ timerState: currentState });
      broadcastTimerState();
    }, 1000);
  } else {
    // Broadcast current state even when timer is not active
    broadcastTimerState();
  }
}

// Handle port connections for real-time updates
chrome.runtime.onConnect.addListener((port) => {
  connectedClients.push(port);
  
  // Send current state immediately when client connects
  port.postMessage({ type: 'TIMER_UPDATE', state: currentState });
  port.postMessage({ type: 'BLOCKING_UPDATE', state: blockingState });
  
  // Handle port disconnection
  port.onDisconnect.addListener(() => {
    connectedClients = connectedClients.filter(p => p !== port);
  });
});

// Listen for messages from popup/options
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'GET_TIMER_STATE':
      sendResponse(currentState);
      break;
      
    case 'UPDATE_TIMER_STATE':
      currentState = { ...currentState, ...message.state };
      currentState.lastUpdateTime = Date.now();
      updateTimer();
      chrome.storage.local.set({ timerState: currentState });
      sendResponse({ success: true });
      break;
      
    case 'RESET_TIMER':
      currentState = {
        isActive: false,
        timeLeft: currentState.initialTime,
        initialTime: currentState.initialTime,
        breakMode: false,
        breakTimeLeft: currentState.breakInitialTime,
        breakInitialTime: currentState.breakInitialTime,
        lastUpdateTime: Date.now()
      };
      updateTimer();
      chrome.storage.local.set({ timerState: currentState });
      sendResponse({ success: true });
      break;
      
    case 'GET_BLOCKING_STATE':
      sendResponse(blockingState);
      break;
      
    case 'UPDATE_BLOCKING_STATE':
      blockingState = { ...blockingState, ...message.state };
      chrome.storage.local.set({ blockingState: blockingState });
      broadcastBlockingState();
      sendResponse({ success: true });
      break;
      
    case 'TOGGLE_BLOCKING':
      blockingState.isBlocked = !blockingState.isBlocked;
      chrome.storage.local.set({ blockingState: blockingState });
      broadcastBlockingState();
      sendResponse({ success: true, isBlocked: blockingState.isBlocked });
      break;
      
    case 'ADD_BLOCKED_SITE':
      if (message.site && !blockingState.blockedSites.includes(message.site)) {
        blockingState.blockedSites.push(message.site);
        chrome.storage.local.set({ blockingState: blockingState });
        broadcastBlockingState();
      }
      sendResponse({ success: true });
      break;
      
    case 'REMOVE_BLOCKED_SITE':
      if (message.site) {
        blockingState.blockedSites = blockingState.blockedSites.filter(site => site !== message.site);
        chrome.storage.local.set({ blockingState: blockingState });
        broadcastBlockingState();
      }
      sendResponse({ success: true });
      break;
      
    case 'ADD_WHITELIST_SITE':
      if (message.site && !blockingState.whitelistSites.includes(message.site)) {
        blockingState.whitelistSites.push(message.site);
        chrome.storage.local.set({ blockingState: blockingState });
        broadcastBlockingState();
      }
      sendResponse({ success: true });
      break;
      
    case 'REMOVE_WHITELIST_SITE':
      if (message.site) {
        blockingState.whitelistSites = blockingState.whitelistSites.filter(site => site !== message.site);
        chrome.storage.local.set({ blockingState: blockingState });
        broadcastBlockingState();
      }
      sendResponse({ success: true });
      break;
      
    case 'CHECK_SITE_BLOCKED':
      const shouldBlock = shouldBlockSite(message.url);
      sendResponse({ shouldBlock });
      break;
      
    case 'OPEN_OPTIONS_PAGE':
      if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        // Fallback for older browsers
        chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
      }
      sendResponse({ success: true });
      break;

    case 'GET_ML_STATUS':
      sendResponse({
        status: mlModelStatus,
        error: mlModelError
      });
      break;

    case 'COMPUTE_PAGE_SIMILARITY':
      // Handle async similarity computation
      (async () => {
        try {
          const result = await computePageSimilarity(
            message.text,
            message.blockedKeywords,
            message.allowedKeywords
          );
          sendResponse(result);
        } catch (error) {
          console.error('Error in COMPUTE_PAGE_SIMILARITY:', error);
          sendResponse({
            blockedSimilarity: 0,
            allowedSimilarity: 0,
            shouldBlock: false
          });
        }
      })();
      return true; // Indicates async response

    case 'PRECOMPUTE_KEYWORD_EMBEDDINGS':
      // Handle async keyword embedding precomputation
      (async () => {
        try {
          await precomputeKeywordEmbeddings(message.keywords);
          sendResponse({ success: true });
        } catch (error) {
          console.error('Error in PRECOMPUTE_KEYWORD_EMBEDDINGS:', error);
          sendResponse({ success: false, error: String(error) });
        }
      })();
      return true; // Indicates async response
  }
});

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
  // Initialize ML model on startup
  initializeMLModel();

  chrome.storage.local.get(['timerState', 'blockingState'], (result) => {
    if (result.timerState) {
      currentState = { ...currentState, ...result.timerState };
      updateTimer();
    }
    // Ensure blockingState is initialized on startup
    if (!result.blockingState) {
      chrome.storage.local.set({
        blockingState: {
          isBlocked: true,
          blockedSites: ['facebook.com', 'twitter.com', 'instagram.com'],
          blockMode: 'blacklist',
          whitelistSites: []
        }
      }, () => {
        blockingState = {
          isBlocked: true,
          blockedSites: ['facebook.com', 'twitter.com', 'instagram.com'],
          blockMode: 'blacklist',
          whitelistSites: []
        };
      });
    } else {
      blockingState = { ...blockingState, ...result.blockingState };
    }
  });
});

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('DeepFocus extension installed/updated');

  // Initialize ML model on installation
  initializeMLModel();

  // Request notification permission
  if (typeof chrome !== 'undefined' && chrome.notifications) {
    chrome.notifications.getPermissionLevel((level) => {
      console.log('Current notification permission level:', level);
      if (level === 'denied') {
        console.log('Notification permission denied');
      }
    });
  }

  // Initialize default settings
  chrome.storage.sync.get(['settings'], (result) => {
    if (!result.settings) {
      chrome.storage.sync.set({
        settings: {
          autoStartBreaks: true,
          desktopNotifications: true,
          theme: 'forest'
        }
      });
    }
  });

  // Initialize default blocking state
  chrome.storage.local.get(['blockingState'], (result) => {
    if (!result.blockingState) {
      chrome.storage.local.set({
        blockingState: {
          isBlocked: true,
          blockedSites: ['facebook.com', 'twitter.com', 'instagram.com'],
          blockMode: 'blacklist',
          whitelistSites: []
        }
      });
    }
  });
}); 