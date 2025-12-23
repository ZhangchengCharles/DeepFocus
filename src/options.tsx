import './tailwind.css';
import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { Play, Pause, RotateCcw, Settings, Brain, Clock, Edit3, Shield, X, Plus, Filter, Check, List } from 'lucide-react';

interface TimerState {
  isActive: boolean;
  timeLeft: number;
  initialTime: number;
  breakMode: boolean;
  breakTimeLeft: number;
  breakInitialTime: number;
  lastUpdateTime: number;
}

interface Settings {
  autoStartBreaks: boolean;
  desktopNotifications: boolean;
  theme: string;
}

interface BlockingState {
  isBlocked: boolean;
  blockedSites: string[];
  blockMode: 'whitelist' | 'blacklist';
  whitelistSites: string[];
}

interface StorageItems {
  settings: Settings;
  blockedSites: string[];
  filterList: string[];
  allowList: string[];
}

const DEFAULT_BLOCKED_SITES = [
  'facebook.com',
  'twitter.com',
  'instagram.com'
];

const DeepFocusOptions = () => {
  // Timer state (sync with background script)
  const [isActive, setIsActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);
  const [initialTime, setInitialTime] = useState(60);
  const [isEditing, setIsEditing] = useState(false);
  const [inputMinutes, setInputMinutes] = useState(1);
  const [focusScore, setFocusScore] = useState(87);
  const [aiInsight, setAiInsight] = useState("Your focus patterns suggest peak performance between 9-11 AM");
  
  const [breakMode, setBreakMode] = useState(false);
  const [breakTimeLeft, setBreakTimeLeft] = useState(5 * 60);
  const [breakInitialTime, setBreakInitialTime] = useState(5 * 60);
  
  const [blockingState, setBlockingState] = useState<BlockingState>({
    isBlocked: false,
    blockedSites: [],
    blockMode: 'blacklist',
    whitelistSites: []
  });
  const [newSite, setNewSite] = useState('');
  const [showBlocklist, setShowBlocklist] = useState(false);
  
  const [filterList, setFilterList] = useState([
    'youtube.com',
    'reddit.com',
    'bilibili.com'
  ]);
  const [newFilterSite, setNewFilterSite] = useState('');
  
  const [allowList, setAllowList] = useState([
    'wikipedia.org',
    'khanacademy.org',
    'github.com'
  ]);
  const [newAllowSite, setNewAllowSite] = useState('');

  const [showSettings, setShowSettings] = useState(false);
  
  const [settings, setSettings] = useState<Settings>({
    autoStartBreaks: true,
    desktopNotifications: true,
    theme: 'forest'
  });

  const [rulesTab, setRulesTab] = useState<'blocking' | 'filtering'>('blocking');
  const [blockingMode, setBlockingMode] = useState<'blacklist' | 'whitelist'>('blacklist');

  // ML Model status
  const [mlStatus, setMLStatus] = useState<null | 'loading' | 'ready' | 'error'>(null);
  const [mlError, setMLError] = useState<string | null>(null);

  // Load timer state from background script
  const loadTimerState = () => {
    chrome.runtime.sendMessage({ type: 'GET_TIMER_STATE' }, (response: TimerState) => {
      if (response) {
        setIsActive(response.isActive);
        setTimeLeft(response.timeLeft);
        setInitialTime(response.initialTime);
        setBreakMode(response.breakMode);
        setBreakTimeLeft(response.breakTimeLeft);
        setBreakInitialTime(response.breakInitialTime);
      }
    });
  };

  // Connect to background script for real-time updates
  React.useEffect(() => {
    const port = chrome.runtime.connect({ name: 'timer-updates' });
    
    port.onMessage.addListener((message) => {
      if (message.type === 'TIMER_UPDATE') {
        const state = message.state as TimerState;
        setIsActive(state.isActive);
        setTimeLeft(state.timeLeft);
        setInitialTime(state.initialTime);
        setBreakMode(state.breakMode);
        setBreakTimeLeft(state.breakTimeLeft);
        setBreakInitialTime(state.breakInitialTime);
      }
    });

    // Cleanup on unmount
    return () => {
      port.disconnect();
    };
  }, []);

  // Update timer state in background script
  const updateTimerState = (updates: Partial<TimerState>) => {
    chrome.runtime.sendMessage({ 
      type: 'UPDATE_TIMER_STATE', 
      state: updates 
    }, (response) => {
      if (response?.success) {
        // State will be updated via port connection
      }
    });
  };

  // Reset timer
  const resetTimer = () => {
    chrome.runtime.sendMessage({ type: 'RESET_TIMER' }, (response) => {
      if (response?.success) {
        // State will be updated via port connection
      }
    });
  };

  // Load settings from Chrome storage
  useEffect(() => {
    const defaultItems: StorageItems = {
      settings: {
        autoStartBreaks: true,
        desktopNotifications: true,
        theme: 'forest'
      },
      blockedSites: ['facebook.com', 'twitter.com', 'instagram.com'],
      filterList: ['youtube.com', 'reddit.com', 'bilibili.com'],
      allowList: ['wikipedia.org', 'khanacademy.org', 'github.com'],
    };

    chrome.storage.sync.get(defaultItems, (items: any) => {
      const typedItems = items as StorageItems;
      setSettings(typedItems.settings);
      setFilterList(typedItems.filterList);
      setAllowList(typedItems.allowList);
    });

    // Load blocking state from background script or initialize with defaults
    chrome.runtime.sendMessage({ type: 'GET_BLOCKING_STATE' }, (response: BlockingState) => {
      if (response) {
        // If blocklist is empty, initialize with defaults
        if (!response.blockedSites || response.blockedSites.length === 0) {
          const updatedState = {
            ...response,
            blockedSites: DEFAULT_BLOCKED_SITES
          };
          setBlockingState(updatedState);
          chrome.runtime.sendMessage({ type: 'UPDATE_BLOCKING_STATE', state: updatedState });
        } else {
          setBlockingState(response);
        }
      }
    });

    // Request notification permission on load if not already granted
    if (window.Notification && Notification.permission === 'default') {
      Notification.requestPermission().then(permission => {
        console.log('Initial notification permission:', permission);
      });
    }

    // Load timer state on component mount
    loadTimerState();
  }, []);

  // Save settings to Chrome storage
  const saveSettings = () => {
    chrome.storage.sync.set({
      settings,
      filterList,
      allowList,
    }, () => {
      console.log('Settings saved');
    });
  };

  // Save whenever settings change
  useEffect(() => {
    saveSettings();
  }, [settings, blockingState, filterList, allowList]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const toggleTimer = () => {
    updateTimerState({ isActive: !isActive });
  };

  const resetTimerLocal = () => {
    resetTimer();
  };

  const setCustomTime = () => {
    if (inputMinutes > 0 && inputMinutes <= 240) {
      const newTime = inputMinutes * 60;
      updateTimerState({
        timeLeft: newTime,
        initialTime: newTime,
        isActive: false,
        breakMode: false
      });
      setIsEditing(false);
      loadTimerState(); // Refresh UI after setting the time
    }
  };

  const handleTimeClick = () => {
    if (!isActive) {
      setIsEditing(true);
      setInputMinutes(Math.floor(timeLeft / 60));
    }
  };

  const addBlockedSite = () => {
    if (newSite.trim() && !blockingState.blockedSites.includes(newSite.trim())) {
      const updatedState = {
        ...blockingState,
        blockedSites: [...blockingState.blockedSites, newSite.trim()]
      };
      setBlockingState(updatedState);
      chrome.runtime.sendMessage({ 
        type: 'UPDATE_BLOCKING_STATE', 
        state: updatedState 
      });
      setNewSite('');
    }
  };

  const removeBlockedSite = (site: string) => {
    const updatedState = {
      ...blockingState,
      blockedSites: blockingState.blockedSites.filter((s: string) => s !== site)
    };
    setBlockingState(updatedState);
    chrome.runtime.sendMessage({ 
      type: 'UPDATE_BLOCKING_STATE', 
      state: updatedState 
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      addBlockedSite();
    }
  };

  const addFilterSite = () => {
    if (newFilterSite.trim() && !filterList.includes(newFilterSite.trim())) {
      setFilterList([...filterList, newFilterSite.trim()]);
      setNewFilterSite('');
    }
  };

  const removeFilterSite = (site: string) => {
    setFilterList(filterList.filter((s: string) => s !== site));
  };

  const handleFilterListKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      addFilterSite();
    }
  };

  const addAllowSite = () => {
    if (newAllowSite.trim() && !allowList.includes(newAllowSite.trim())) {
      setAllowList([...allowList, newAllowSite.trim()]);
      setNewAllowSite('');
    }
  };

  const removeAllowSite = (site: string) => {
    setAllowList(allowList.filter((s: string) => s !== site));
  };

  const handleAllowListKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      addAllowSite();
    }
  };

  const [customKeywords, setCustomKeywords] = useState(['gaming', 'celebrity', 'sports', 'f1']);
  const [newKeyword, setNewKeyword] = useState('');

  const [allowedKeywords, setAllowedKeywords] = useState(['work', 'study', 'productivity']);
  const [newAllowedKeyword, setNewAllowedKeyword] = useState('');

  const addKeyword = () => {
    if (newKeyword.trim() && !customKeywords.includes(newKeyword.trim().toLowerCase())) {
      setCustomKeywords([...customKeywords, newKeyword.trim().toLowerCase()]);
      setNewKeyword('');
    }
  };

  const removeKeyword = (keyword: string) => {
    setCustomKeywords(customKeywords.filter(k => k !== keyword));
  };

  const handleKeywordKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      addKeyword();
    }
  };

  const addAllowedKeyword = () => {
    if (newAllowedKeyword.trim() && !allowedKeywords.includes(newAllowedKeyword.trim().toLowerCase())) {
      setAllowedKeywords([...allowedKeywords, newAllowedKeyword.trim().toLowerCase()]);
      setNewAllowedKeyword('');
    }
  };

  const removeAllowedKeyword = (keyword: string) => {
    setAllowedKeywords(allowedKeywords.filter(k => k !== keyword));
  };

  const handleAllowedKeywordKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      addAllowedKeyword();
    }
  };

  const toggleSetting = (settingName: 'autoStartBreaks' | 'desktopNotifications') => {
    setSettings(prev => ({
      ...prev,
      [settingName]: !prev[settingName]
    }));
  };

  const showWebNotification = () => {
    if (!window.Notification) {
      alert('Notifications are not supported in this browser');
      return;
    }

    if (Notification.permission === 'granted') {
      console.log('Permission granted, showing web notification');
      try {
        const iconUrl = chrome?.runtime?.getURL('icons/brain48.png') || '/icons/brain48.png';
        const notification = new Notification('Test Notification', { 
          body: 'Notifications are working! You will receive timer notifications.',
          icon: iconUrl,
          requireInteraction: false,
          silent: false
        });
        
        notification.onclick = () => {
          console.log('Notification clicked');
          notification.close();
        };
        
        notification.onshow = () => {
          console.log('Notification shown');
        };
        
        notification.onerror = (error) => {
          console.error('Notification error:', error);
          alert('Failed to show notification: ' + error);
        };
        
        // Auto-close after 5 seconds
        setTimeout(() => {
          notification.close();
        }, 5000);
        
      } catch (error) {
        console.error('Error creating web notification:', error);
        alert('Error creating notification: ' + error);
      }
    } else if (Notification.permission === 'denied') {
      console.log('Permission denied');
      alert('Notification permission is denied. Please enable notifications in your browser settings.');
    } else {
      console.log('Requesting permission');
      Notification.requestPermission().then(permission => {
        console.log('Permission result:', permission);
        if (permission === 'granted') {
          // Try again after permission is granted
          setTimeout(() => showWebNotification(), 100);
        } else {
          alert('Notification permission was not granted. Notifications will not work.');
        }
      }).catch(error => {
        console.error('Error requesting permission:', error);
        alert('Error requesting notification permission: ' + error);
      });
    }
  };

  const changeTheme = (theme: string) => {
    setSettings(prev => ({
      ...prev,
      theme: theme
    }));
  };

  const exportData = () => {
    const data = {
      settings,
      blockedSites: blockingState.blockedSites,
      customKeywords,
      focusScore
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'deepfocus-data.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearAllData = () => {
    if (window.confirm('Are you sure you want to clear all data? This action cannot be undone.')) {
      setSettings({
        autoStartBreaks: true,
        desktopNotifications: true,
        theme: 'forest'
      });
      setBlockingState({
        isBlocked: false,
        blockedSites: ['facebook.com', 'twitter.com', 'instagram.com'],
        blockMode: 'blacklist',
        whitelistSites: []
      });
      setFilterList(['youtube.com', 'reddit.com', 'bilibili.com']);
      setAllowList(['wikipedia.org', 'khanacademy.org', 'github.com']);
      setCustomKeywords(['gaming', 'celebrity', 'sports', 'f1']);
      setFocusScore(87);
      alert('All data has been cleared!');
    }
  };

  const getThemeClasses = (theme: string) => {
    switch (theme) {
      case 'purple':
        return {
          background: 'bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900',
          accent: 'from-purple-600 to-blue-600',
          accentHover: 'hover:from-purple-700 hover:to-blue-700',
          accentText: 'text-purple-300',
          accentBorder: 'border-purple-400',
          accentBg: 'bg-purple-600/20',
          accentRing: 'text-purple-500',
          accentButton: 'bg-purple-600 hover:bg-purple-700',
          accentButtonSecondary: 'border-purple-400 bg-purple-600/20'
        };
      case 'sunset':
        return {
          background: 'bg-gradient-to-br from-slate-900 via-orange-900 to-slate-900',
          accent: 'from-pink-500 to-orange-500',
          accentHover: 'hover:from-pink-600 hover:to-orange-600',
          accentText: 'text-orange-300',
          accentBorder: 'border-orange-400',
          accentBg: 'bg-orange-600/20',
          accentRing: 'text-orange-500',
          accentButton: 'bg-orange-600 hover:bg-orange-700',
          accentButtonSecondary: 'border-orange-400 bg-orange-600/20'
        };
      case 'forest':
        return {
          background: 'bg-gradient-to-br from-slate-900 via-green-900 to-slate-900',
          accent: 'from-green-500 to-teal-500',
          accentHover: 'hover:from-green-600 hover:to-teal-600',
          accentText: 'text-green-300',
          accentBorder: 'border-green-400',
          accentBg: 'bg-green-600/20',
          accentRing: 'text-green-500',
          accentButton: 'bg-green-600 hover:bg-green-700',
          accentButtonSecondary: 'border-green-400 bg-green-600/20'
        };
      default:
        return {
          background: 'bg-gradient-to-br from-slate-900 via-green-900 to-slate-900',
          accent: 'from-green-500 to-teal-500',
          accentHover: 'hover:from-green-600 hover:to-teal-600',
          accentText: 'text-green-300',
          accentBorder: 'border-green-400',
          accentBg: 'bg-green-600/20',
          accentRing: 'text-green-500',
          accentButton: 'bg-green-600 hover:bg-green-700',
          accentButtonSecondary: 'border-green-400 bg-green-600/20'
        };
    }
  };

  const themeClasses = getThemeClasses(settings.theme);

  const showWebTimerNotification = (title: string, body: string) => {
    if (window.Notification && Notification.permission === 'granted') {
      const iconUrl = chrome?.runtime?.getURL('icons/brain48.png') || '/icons/brain48.png';
      new Notification(title, { 
        body: body,
        icon: iconUrl,
        requireInteraction: true
      });
    } else if (window.Notification && Notification.permission !== 'denied') {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          const iconUrl = chrome?.runtime?.getURL('icons/brain48.png') || '/icons/brain48.png';
          new Notification(title, { 
            body: body,
            icon: iconUrl,
            requireInteraction: true
          });
        }
      });
    }
  };

  // 1. Load customKeywords from chrome.storage.sync on startup
  useEffect(() => {
    chrome.storage.sync.get({ customKeywords: ['gaming', 'celebrity', 'sports', 'f1'] }, (items) => {
      setCustomKeywords(items.customKeywords || []);
    });
    // 1a. Load allowedKeywords from chrome.storage.sync on startup
    chrome.storage.sync.get({ allowedKeywords: ['work', 'study', 'productivity'] }, (items) => {
      setAllowedKeywords(items.allowedKeywords || []);
    });
  }, []);

  // 2. Save customKeywords to chrome.storage.sync whenever they change
  useEffect(() => {
    chrome.storage.sync.set({ customKeywords });
  }, [customKeywords]);
  // 2a. Save allowedKeywords to chrome.storage.sync whenever they change
  useEffect(() => {
    chrome.storage.sync.set({ allowedKeywords });
  }, [allowedKeywords]);

  // Load ML model status on component mount
  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_ML_STATUS' }, (response) => {
      if (response) {
        setMLStatus(response.status);
        setMLError(response.error);
      }
    });

    // Poll for status updates every 2 seconds while loading
    const statusInterval = setInterval(() => {
      chrome.runtime.sendMessage({ type: 'GET_ML_STATUS' }, (response) => {
        if (response) {
          setMLStatus(response.status);
          setMLError(response.error);

          // Stop polling once model is ready or errored
          if (response.status === 'ready' || response.status === 'error') {
            clearInterval(statusInterval);
          }
        }
      });
    }, 2000);

    return () => clearInterval(statusInterval);
  }, []);

  // Precompute keyword embeddings when keywords change
  useEffect(() => {
    const allKeywords = [...customKeywords, ...allowedKeywords];
    if (allKeywords.length > 0 && mlStatus === 'ready') {
      chrome.runtime.sendMessage({
        type: 'PRECOMPUTE_KEYWORD_EMBEDDINGS',
        keywords: allKeywords
      }, (response) => {
        if (response?.success) {
          console.log('Keyword embeddings precomputed successfully');
        }
      });
    }
  }, [customKeywords, allowedKeywords, mlStatus]);

  return (
    <div className={`min-h-screen ${themeClasses.background} text-white overflow-hidden relative`}>
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-green-500/10 rounded-full blur-3xl animate-orbFloat animate-orbPulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-teal-500/10 rounded-full blur-3xl animate-orbFloat animate-orbPulse" style={{ animationDelay: '2s' }}></div>
      </div>

      <div className="relative z-10 max-w-6xl mx-auto p-6">
        <header className="flex justify-between items-center mb-8">
          <div className="flex items-center space-x-3">
            <div className={`w-10 h-10 bg-gradient-to-r ${themeClasses.accent} rounded-xl flex items-center justify-center`}>
              <Brain className="w-6 h-6" />
            </div>
            <h1 className={`text-2xl font-bold bg-gradient-to-r ${themeClasses.accent} bg-clip-text text-transparent`}>
              DeepFocus Dashboard
            </h1>
          </div>
          <button 
            onClick={() => setShowSettings(true)}
            className="p-2.5 rounded-xl bg-white/10 backdrop-blur-sm hover:bg-white/20 transition-all duration-300 animate-bounceTap animate-ripple"
          >
            <Settings className="w-5 h-5" />
          </button>
        </header>

        <div className="flex justify-center mb-8">
          <div className="relative flex bg-white/5 backdrop-blur-xl rounded-2xl p-2 border border-white/10">
            <button
              onClick={() => {setShowBlocklist(false);}}
              className={`px-7 py-3.5 rounded-xl transition-all duration-300 text-base font-medium animate-bounceTap animate-ripple ${
                !showBlocklist 
                  ? `bg-gradient-to-r ${themeClasses.accent} text-white` 
                  : `${themeClasses.accentText} hover:text-white`
              }`}
            >
              <Clock className="w-4 h-4 inline mr-2" />
              Timer
            </button>
            <button
              onClick={() => {setShowBlocklist(true);}}
              className={`px-7 py-3.5 rounded-xl transition-all duration-300 text-base font-medium animate-bounceTap animate-ripple ${
                showBlocklist 
                  ? `bg-gradient-to-r ${themeClasses.accent} text-white` 
                  : `${themeClasses.accentText} hover:text-white`
              }`}
            >
              <List className="w-4 h-4 inline mr-2" />
              Rules
            </button>
          </div>
        </div>

        <div className="max-w-2xl mx-auto">
          {/* Settings Modal */}
          {showSettings && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-sectionFadeIn">
              <div className="bg-slate-900/95 backdrop-blur-xl rounded-3xl border border-white/10 w-full max-w-md max-h-[90vh] overflow-y-auto animate-modalIn">
                <div className="p-6">
                  {/* Settings Header */}
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold">Settings</h2>
                    <button
                      onClick={() => setShowSettings(false)}
                      className="p-2.5 hover:bg-white/10 rounded-xl transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Settings Content */}
                  <div className="space-y-6">
                    {/* Timer Settings */}
                    <div>
                      <h3 className={`text-lg font-semibold mb-4 ${themeClasses.accentText}`}>Timer Settings</h3>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-3.5 bg-white/5 rounded-xl">
                          <div>
                            <div className="text-base font-medium">Auto-start breaks</div>
                            <div className="text-sm text-gray-400">Automatically start break timer</div>
                          </div>
                          <button 
                            onClick={() => toggleSetting('autoStartBreaks')}
                            className={`w-12 h-6 rounded-full relative transition-colors ${
                              settings.autoStartBreaks ? themeClasses.accentButton.split(' ')[0] : 'bg-gray-600'
                            }`}
                          >
                            <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
                              settings.autoStartBreaks ? 'right-0.5' : 'left-0.5'
                            }`}></div>
                          </button>
                        </div>
                        
                        <div className="flex items-center justify-between p-3.5 bg-white/5 rounded-xl">
                          <div>
                            <div className="text-base font-medium">Desktop notifications</div>
                            <div className="text-sm text-gray-400">Show browser notifications</div>
                          </div>
                          <button 
                            onClick={() => toggleSetting('desktopNotifications')}
                            className={`w-12 h-6 rounded-full relative transition-colors ${
                              settings.desktopNotifications ? themeClasses.accentButton.split(' ')[0] : 'bg-gray-600'
                            }`}
                          >
                            <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
                              settings.desktopNotifications ? 'right-0.5' : 'left-0.5'
                            }`}></div>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* ML Model Status */}
                    <div>
                      <h3 className={`text-lg font-semibold mb-4 ${themeClasses.accentText}`}>AI Model Status</h3>
                      <div className="p-3.5 bg-white/5 rounded-xl">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Brain className={`w-5 h-5 ${
                              mlStatus === 'ready' ? 'text-green-400' :
                              mlStatus === 'loading' ? 'text-yellow-400' :
                              mlStatus === 'error' ? 'text-red-400' : 'text-gray-400'
                            }`} />
                            <div>
                              <div className="text-base font-medium">Semantic Model</div>
                              <div className="text-sm text-gray-400">gte-base-en-v1.5</div>
                            </div>
                          </div>
                          <div className={`text-sm font-medium px-3 py-1 rounded-full ${
                            mlStatus === 'ready' ? 'bg-green-500/20 text-green-400' :
                            mlStatus === 'loading' ? 'bg-yellow-500/20 text-yellow-400' :
                            mlStatus === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-gray-500/20 text-gray-400'
                          }`}>
                            {mlStatus === 'ready' ? '✓ Ready' :
                             mlStatus === 'loading' ? '⌛ Loading...' :
                             mlStatus === 'error' ? '✗ Error' : '○ Not Initialized'}
                          </div>
                        </div>
                        {mlError && (
                          <div className="mt-3 text-sm text-red-400 bg-red-500/10 p-2 rounded">
                            {mlError}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Appearance Settings */}
                    <div>
                      <h3 className={`text-lg font-semibold mb-4 ${themeClasses.accentText}`}>Appearance</h3>
                      <div className="space-y-4">
                        <div>
                          <div className="text-base font-medium mb-3">Theme</div>
                          <div className="grid grid-cols-3 gap-2">
                            <button
                              onClick={() => changeTheme('forest')}
                              className={`p-3 rounded-xl text-center transition-colors ${
                                settings.theme === 'forest'
                                  ? 'bg-green-600/20 border border-green-400'
                                  : 'bg-white/5 border border-white/20 hover:bg-white/10'
                              }`}
                            >
                              <div className="w-6 h-6 bg-gradient-to-r from-green-500 to-teal-500 rounded mx-auto mb-1"></div>
                              <div className="text-xs font-medium">Forest</div>
                            </button>
                            <button
                              onClick={() => changeTheme('sunset')}
                              className={`p-3 rounded-xl text-center transition-colors ${
                                settings.theme === 'sunset'
                                  ? 'bg-orange-600/20 border border-orange-400'
                                  : 'bg-white/5 border border-white/20 hover:bg-white/10'
                              }`}
                            >
                              <div className="w-6 h-6 bg-gradient-to-r from-pink-500 to-orange-500 rounded mx-auto mb-1"></div>
                              <div className="text-xs font-medium">Sunset</div>
                            </button>
                            <button
                              onClick={() => changeTheme('purple')}
                              className={`p-3 rounded-xl text-center transition-colors ${
                                settings.theme === 'purple'
                                  ? 'bg-purple-600/20 border border-purple-400'
                                  : 'bg-white/5 border border-white/20 hover:bg-white/10'
                              }`}
                            >
                              <div className="w-6 h-6 bg-gradient-to-r from-purple-600 to-blue-600 rounded mx-auto mb-1"></div>
                              <div className="text-xs font-medium">Purple</div>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Data & Privacy */}
                    <div className="animate-sectionFadeIn">
                      <h3 className={`text-lg font-semibold mb-4 ${themeClasses.accentText}`}>Data & Privacy</h3>
                      <div className="space-y-3">
                        <button 
                          onClick={exportData}
                          className="w-full p-3.5 bg-white/5 hover:bg-white/10 rounded-xl text-left transition-colors"
                        >
                          <div className="text-base font-medium">Export Data</div>
                          <div className="text-sm text-gray-400">Download your focus sessions and settings</div>
                        </button>
                        <button 
                          onClick={clearAllData}
                          className="w-full p-3.5 bg-red-500/10 hover:bg-red-500/20 rounded-xl text-left transition-colors border border-red-500/20 hover:border-red-500/40"
                        >
                          <div className="text-base font-medium text-red-400">Clear All Data</div>
                          <div className="text-sm text-red-300/70">Reset all settings and statistics</div>
                        </button>
                        {/* Notification Denied Warning */}
                        {window.Notification && Notification.permission === 'denied' && (
                          <div className="p-3.5 bg-red-500/10 border border-red-400/30 rounded-xl text-red-300 text-sm">
                            Desktop notifications are blocked. Please enable them in your browser settings.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* About */}
                    <div className="animate-sectionFadeIn">
                      <h3 className={`text-lg font-semibold mb-4 ${themeClasses.accentText}`}>About</h3>
                      <div className="space-y-3">
                        <div className="p-3.5 bg-white/5 rounded-xl">
                          <div className="text-sm text-gray-400">Version</div>
                          <div className="text-base font-medium">1.2.0</div>
                        </div>
                        
                        <button className="w-full p-3.5 bg-white/5 hover:bg-white/10 rounded-xl text-left transition-colors">
                          <div className="text-base font-medium">Help & Support</div>
                          <div className="text-sm text-gray-400">View documentation and get help</div>
                        </button>
                        
                        <button className="w-full p-3.5 bg-white/5 hover:bg-white/10 rounded-xl text-left transition-colors">
                          <div className="text-base font-medium">Privacy Policy</div>
                          <div className="text-sm text-gray-400">Learn how we protect your data</div>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!showBlocklist && (
            <div className="space-y-6 animate-sectionFadeIn">
              <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-8 border border-white/10 hover:border-white/20 transition-all duration-500">
                <div className="animate-sectionFadeIn">
                  <div className="text-center">
                    <div className="mb-6">
                      <div className="relative w-64 h-64 mx-auto flex items-center justify-center">
                        <div className={`absolute inset-0 rounded-full border-4 transition-all duration-500 ${isActive ? 'border-white/40 animate-pulse' : 'border-white/10'}`}></div>
                        
                        <svg className={`absolute inset-0 w-full h-full transform -rotate-90 transition-all duration-1000 ease-out ${(timeLeft === 0 && !breakMode) || (breakTimeLeft === 0 && breakMode) ? 'animate-timerPulse' : ''}`} viewBox="0 0 100 100">
                          <circle
                            cx="50"
                            cy="50"
                            r="45"
                            fill="transparent"
                            stroke="currentColor"
                            strokeWidth="4"
                            strokeDasharray={`${2 * Math.PI * 45}`}
                            strokeDashoffset={`${2 * Math.PI * 45 * (1 - (breakMode ? (breakInitialTime - breakTimeLeft) / breakInitialTime : (initialTime - timeLeft) / initialTime))}`}
                            className={`${themeClasses.accentRing}`}
                            strokeLinecap="round"
                          />
                        </svg>
                        
                        <div className="relative z-10">
                          <div className="text-center">
                            {breakMode ? (
                              <div>
                                <div className="text-2xl font-semibold mb-2 text-green-300">Break Time</div>
                                <div className="text-5xl font-mono font-bold mb-2 flex items-center justify-center">
                                  {formatTime(breakTimeLeft)}
                                </div>
                                <div className={`text-base ${themeClasses.accentText}`}>Relax and recharge</div>
                              </div>
                            ) : isEditing ? (
                              <div className="space-y-4">
                                <input
                                  type="number"
                                  value={inputMinutes.toString().replace(/^0+(?!$)/, '')}
                                  onChange={(e) => setInputMinutes(Number(e.target.value.replace(/^0+(?!$)/, '')) || 0)}
                                  className={`text-4xl font-mono font-bold bg-transparent text-center border-b-2 ${themeClasses.accentBorder} focus:outline-none focus:border-blue-400 w-28`}
                                  min="1"
                                  max="240"
                                  autoFocus
                                />
                                <div className={`text-base ${themeClasses.accentText} mb-4`}>minutes</div>
                                <div className="flex space-x-3 justify-center">
                                  <button
                                    onClick={setCustomTime}
                                    className={`px-5 py-2.5 ${themeClasses.accentButton} rounded-lg text-sm font-medium transition-colors`}
                                  >
                                    Set
                                  </button>
                                  <button
                                    onClick={() => setIsEditing(false)}
                                    className="px-5 py-2.5 bg-white/10 rounded-lg text-sm font-medium hover:bg-white/20 transition-colors"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div 
                                onClick={handleTimeClick}
                                className="cursor-pointer hover:scale-105 transition-transform group"
                              >
                                <div className="text-5xl font-mono font-bold mb-2 flex items-center justify-center">
                                  {formatTime(timeLeft)}
                                  {!isActive && <Edit3 className="w-5 h-5 ml-3 transition-opacity" />}
                                </div>
                                <div className={`text-base ${themeClasses.accentText}`}>{isActive ? 'In Focus' : ''}</div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-center space-x-4">
                      <button
                        onClick={toggleTimer}
                        className={`flex items-center space-x-2 px-8 py-4 bg-gradient-to-r ${themeClasses.accent} ${themeClasses.accentHover} rounded-2xl transform hover:scale-105 transition-all duration-300 shadow-lg text-base font-semibold`}
                      >
                        {isActive ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                        <span>{isActive ? 'Pause' : 'Start Focus'}</span>
                      </button>
                      <button
                        onClick={resetTimerLocal}
                        className="p-4 bg-white/10 rounded-2xl hover:bg-white/20 transform hover:scale-105 transition-all duration-300"
                      >
                        <RotateCcw className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {showBlocklist && (
            <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-8 border border-white/10 animate-sectionFadeIn">
              <div className="flex w-full rounded-full bg-white/5 p-1 mb-6 border border-white/10">
                <button
                  className={`flex-1 justify-center flex items-center gap-2 py-2.5 rounded-full font-semibold text-base transition-all duration-300
                    ${rulesTab === 'blocking' ? `bg-gradient-to-r ${themeClasses.accent} text-white shadow` : 'text-white/80 hover:bg-white/10'}`}
                  onClick={() => setRulesTab('blocking')}
                >
                  <Shield className="w-5 h-5" /> Blocking
                </button>
                <button
                  className={`flex-1 justify-center flex items-center gap-2 py-2.5 rounded-full font-semibold text-base transition-all duration-300
                    ${rulesTab === 'filtering' ? `bg-gradient-to-r ${themeClasses.accent} text-white shadow` : 'text-white/80 hover:bg-white/10'}`}
                  onClick={() => setRulesTab('filtering')}
                >
                  <Filter className="w-5 h-5" /> Filtering
                </button>
              </div>

              {rulesTab === 'blocking' && (
                <div className="mt-4 animate-sectionFadeIn">
                  {/* Blocking Mode Toggle */}
                  <div className="mb-6">
                    <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
                      <div>
                        <div className="text-base font-medium mb-1">Blocking Mode</div>
                        <div className="text-sm text-gray-400">
                          {blockingMode === 'blacklist' 
                            ? 'Block specific websites' 
                            : 'Allow only specific websites'
                          }
                        </div>

                      </div>
                      <div className="flex bg-white/10 rounded-full p-1">
                        <button
                          onClick={() => setBlockingMode('blacklist')}
                          className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                            blockingMode === 'blacklist'
                              ? `bg-gradient-to-r ${themeClasses.accent} text-white shadow`
                              : 'text-white/60 hover:text-white/80'
                          }`}
                        >
                          Blacklist
                        </button>
                        <button
                          onClick={() => setBlockingMode('whitelist')}
                          className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                            blockingMode === 'whitelist'
                              ? `bg-gradient-to-r ${themeClasses.accent} text-white shadow`
                              : 'text-white/60 hover:text-white/80'
                          }`}
                        >
                          Whitelist
                        </button>
                      </div>
                    </div>
                  </div>

                  {blockingMode === 'blacklist' && (
                    <div>
                      <p className={`text-base ${themeClasses.accentText} mb-6`}>Websites to block entirely during focus sessions</p>
                      <div className="flex space-x-3 mb-6">
                        <input
                          type="text"
                          value={newSite}
                          onChange={(e) => setNewSite(e.target.value)}
                          onKeyPress={handleKeyPress}
                          placeholder="Enter website (e.g., facebook.com)"
                          className={`flex-1 px-4 py-3 bg-white/10 rounded-xl border border-white/20 focus:${themeClasses.accentBorder} focus:outline-none text-base`}
                        />
                        <button
                          onClick={addBlockedSite}
                          className={`px-6 py-3 ${themeClasses.accentButton} rounded-xl transition-colors flex items-center space-x-2 text-base font-medium`}
                        >
                          <Plus className="w-4 h-4" />
                          <span>Add</span>
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {blockingState.blockedSites.map((site: string) => (
                          <div key={site} className="flex items-center justify-between py-2.5 px-3.5 bg-red-500/10 border border-red-400/30 rounded-xl transition-all duration-300 animate-staggerFadeIn hover:scale-105 hover:shadow-lg hover:bg-red-500/20 hover:border-red-400/50">
                            <span className="text-red-300 text-base">{site}</span>
                            <button
                              onClick={() => removeBlockedSite(site)}
                              className="p-1.5 hover:bg-red-500/20 rounded-lg text-red-400 hover:text-red-300 transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {blockingMode === 'whitelist' && (
                    <div>
                      <p className={`text-base ${themeClasses.accentText} mb-6`}>Websites that are always allowed</p>
                      <div className="flex space-x-3 mb-6">
                        <input
                          type="text"
                          value={newAllowSite}
                          onChange={(e) => setNewAllowSite(e.target.value)}
                          onKeyPress={handleAllowListKeyPress}
                          placeholder="Enter website (e.g., wikipedia.org)"
                          className={`flex-1 px-4 py-3 bg-white/10 rounded-xl border border-white/20 focus:${themeClasses.accentBorder} focus:outline-none text-base`}
                        />
                        <button
                          onClick={addAllowSite}
                          className={`px-6 py-3 ${themeClasses.accentButton} rounded-xl transition-colors flex items-center space-x-2 text-base font-medium`}
                        >
                          <Plus className="w-4 h-4" />
                          <span>Add</span>
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {allowList.map((site) => (
                          <div key={site} className="flex items-center justify-between py-2.5 px-3.5 bg-green-500/10 border border-green-400/30 rounded-xl transition-all duration-300 animate-staggerFadeIn hover:scale-105 hover:shadow-lg hover:bg-green-500/20 hover:border-green-400/50">
                            <span className="text-green-300 text-base">{site}</span>
                            <button
                              onClick={() => removeAllowSite(site)}
                              className="p-1.5 hover:bg-red-500/20 rounded-lg text-red-400 hover:text-red-300 transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {rulesTab === 'filtering' && (
                <div className="mt-4 animate-sectionFadeIn">
                  <p className={`text-base ${themeClasses.accentText} mb-6`}>Filter content by category and keywords with AI</p>
                  
                  {/* Filter Sites */}
                  <div className="mb-8">
                    <h3 className="text-lg font-semibold mb-4">Filter Sites</h3>
                    <p className={`text-sm ${themeClasses.accentText} mb-4`}>Websites where content filters will be applied</p>
                    <div className="flex space-x-3 mb-4">
                      <input
                        type="text"
                        value={newFilterSite}
                        onChange={(e) => setNewFilterSite(e.target.value)}
                        onKeyPress={handleFilterListKeyPress}
                        placeholder="Enter website (e.g., youtube.com)"
                        className={`flex-1 px-4 py-3 bg-white/10 rounded-xl border border-white/20 focus:${themeClasses.accentBorder} focus:outline-none text-base`}
                      />
                      <button
                        onClick={addFilterSite}
                        className={`px-6 py-3 ${themeClasses.accentButton} rounded-xl transition-colors flex items-center space-x-2 text-base font-medium`}
                      >
                        <Plus className="w-4 h-4" />
                        <span>Add</span>
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {filterList.map((site) => (
                        <div key={site} className="flex items-center justify-between py-2.5 px-3.5 bg-blue-500/10 border border-blue-400/30 rounded-xl transition-all duration-300 animate-staggerFadeIn hover:scale-105 hover:shadow-lg hover:bg-blue-500/20 hover:border-blue-400/50">
                          <span className="text-blue-300 text-base">{site}</span>
                          <button
                            onClick={() => removeFilterSite(site)}
                            className="p-1.5 hover:bg-red-500/20 rounded-lg text-red-400 hover:text-red-300 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Blocked Keywords */}
                  <div className="mb-8">
                    <h3 className="text-lg font-semibold mb-4">Blocked Keywords</h3>
                    <div className="flex space-x-3 mb-4">
                      <input
                        type="text"
                        value={newKeyword}
                        onChange={(e) => setNewKeyword(e.target.value)}
                        onKeyPress={handleKeywordKeyPress}
                        placeholder="Add keyword to block"
                        className={`flex-1 px-4 py-3 bg-white/10 rounded-xl border border-white/20 focus:${themeClasses.accentBorder} focus:outline-none text-base`}
                      />
                      <button
                        onClick={addKeyword}
                        className={`px-6 py-3 ${themeClasses.accentButton} rounded-xl transition-colors flex items-center space-x-2 text-base font-medium`}
                      >
                        <Plus className="w-4 h-4" />
                        <span>Add</span>
                      </button>
                    </div>
                    
                    <div className="flex flex-wrap gap-2">
                      {customKeywords.map((keyword) => (
                        <div key={keyword} className="flex items-center space-x-2 px-3 py-2 bg-red-500/20 border border-red-400/30 rounded-lg animate-staggerFadeIn">
                          <span className="text-sm">{keyword}</span>
                          <button
                            onClick={() => removeKeyword(keyword)}
                            className="text-red-400 hover:text-red-300 transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Allowed Keywords */}
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Allowed Keywords</h3>
                    <div className="flex space-x-3 mb-4">
                      <input
                        type="text"
                        value={newAllowedKeyword}
                        onChange={(e) => setNewAllowedKeyword(e.target.value)}
                        onKeyPress={handleAllowedKeywordKeyPress}
                        placeholder="Add keyword to allow"
                        className={`flex-1 px-4 py-3 bg-white/10 rounded-xl border border-white/20 focus:${themeClasses.accentBorder} focus:outline-none text-base`}
                      />
                      <button
                        onClick={addAllowedKeyword}
                        className={`px-6 py-3 ${themeClasses.accentButton} rounded-xl transition-colors flex items-center space-x-2 text-base font-medium`}
                      >
                        <Plus className="w-4 h-4" />
                        <span>Add</span>
                      </button>
                    </div>
                    
                    <div className="flex flex-wrap gap-2">
                      {allowedKeywords.map((keyword) => (
                        <div key={keyword} className="flex items-center space-x-2 px-3 py-2 bg-green-500/20 border border-green-400/30 rounded-lg animate-staggerFadeIn">
                          <span className="text-sm text-green-300">{keyword}</span>
                          <button
                            onClick={() => removeAllowedKeyword(keyword)}
                            className="text-red-400 hover:text-red-300 transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}


        </div>
      </div>
    </div>
  );
};

// Mount the React component
const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<DeepFocusOptions />); 