import './tailwind.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Play, Pause, RotateCcw, Brain, PenLine } from 'lucide-react';

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

const DeepFocusPopup = () => {
  // Timer state (sync with background script)
  const [isActive, setIsActive] = React.useState(false);
  const [timeLeft, setTimeLeft] = React.useState(60);
  const [initialTime, setInitialTime] = React.useState(60);
  const [isEditing, setIsEditing] = React.useState(false);
  const [inputMinutes, setInputMinutes] = React.useState(1);
  const [breakMode, setBreakMode] = React.useState(false);
  const [breakTimeLeft, setBreakTimeLeft] = React.useState(5);
  const [breakInitialTime, setBreakInitialTime] = React.useState(5);

  // Theme state
  const [settings, setSettings] = React.useState<Settings>({
    autoStartBreaks: true,
    desktopNotifications: true,
    theme: 'forest'
  });

  // Blocking state
  const [blockingState, setBlockingState] = React.useState<BlockingState>({
    isBlocked: false,
    blockedSites: [],
    blockMode: 'blacklist',
    whitelistSites: []
  });

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

  // Load settings from Chrome storage
  const loadSettings = () => {
    chrome.storage.sync.get(['settings'], (result) => {
      if (result.settings) {
        setSettings(result.settings);
      }
    });
  };

  // Load blocking state from background script
  const loadBlockingState = () => {
    chrome.runtime.sendMessage({ type: 'GET_BLOCKING_STATE' }, (response: BlockingState) => {
      if (response) {
        setBlockingState(response);
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
      } else if (message.type === 'BLOCKING_UPDATE') {
        const state = message.state as BlockingState;
        setBlockingState(state);
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

  // Load state on component mount
  React.useEffect(() => {
    loadTimerState();
    loadSettings();
    loadBlockingState();
  }, []);

  // Listen for storage changes to sync theme
  React.useEffect(() => {
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.settings) {
        setSettings(changes.settings.newValue);
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

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

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const openDashboard = () => {
    chrome.runtime.openOptionsPage();
  };

  const handleStartPause = () => {
    updateTimerState({ isActive: !isActive });
  };

  const handleReset = () => {
    resetTimer();
  };

  const handleSetTime = () => {
    if (inputMinutes > 0 && inputMinutes <= 240) {
      const newTime = inputMinutes * 60;
      updateTimerState({
        timeLeft: newTime,
        initialTime: newTime,
        isActive: false,
        breakMode: false
      });
      setIsEditing(false);
    }
  };

  const handleToggleBlocking = () => {
    chrome.runtime.sendMessage({ type: 'TOGGLE_BLOCKING' }, (response) => {
      if (response?.success) {
        // State will be updated via port connection
      }
    });
  };

  return (
    <div className={`${themeClasses.background} text-white w-[380px] h-[450px] p-3 overflow-hidden flex flex-col`}>
      <div className="flex items-center space-x-3 mb-4">
        <div className={`w-8 h-8 bg-gradient-to-r ${themeClasses.accent} rounded-xl flex items-center justify-center`}>
          <Brain className="w-5 h-5" />
        </div>
        <h1 className={`text-lg font-bold bg-gradient-to-r ${themeClasses.accent} bg-clip-text text-transparent`}>DeepFocus</h1>
      </div>
      <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-3 border border-white/10 mb-3">
        <div className="text-center">
          <div className="relative w-[216px] h-[216px] mx-auto flex items-center justify-center mb-4">
            <div className={`absolute inset-0 rounded-full border-4 transition-all duration-500 ${isActive ? 'border-white/40 animate-pulse' : 'border-white/10'}`}></div>
            <svg className={`absolute inset-0 w-full h-full transform -rotate-90 transition-all duration-1000 ease-out ${(timeLeft === 0 && !breakMode) || (breakTimeLeft === 0 && breakMode) ? 'animate-timerPulse' : ''}`} viewBox="0 0 150 150">
              <circle
                cx="75"
                cy="75"
                r="67"
                fill="transparent"
                stroke="currentColor"
                strokeWidth="5"
                strokeDasharray={`${2 * Math.PI * 67}`}
                strokeDashoffset={`${2 * Math.PI * 67 * (1 - (breakMode ? (breakInitialTime - breakTimeLeft) / breakInitialTime : (initialTime - timeLeft) / initialTime))}`}
                strokeLinecap="round"
                className={themeClasses.accentRing}
              />
            </svg>
            <div className="relative z-10">
              {breakMode ? (
                <div>
                  <div className="text-xl font-semibold mb-1 text-green-300">Break</div>
                  <div className="text-5xl font-mono font-bold mb-2 flex items-center justify-center">
                    {formatTime(breakTimeLeft)}
                  </div>
                  <div className={`text-xs ${themeClasses.accentText}`}>Relax</div>
                </div>
              ) : isEditing ? (
                <div className="space-y-2">
                  <input
                    type="number"
                    value={inputMinutes.toString().replace(/^0+(?!$)/, '')}
                    onChange={e => setInputMinutes(Number(e.target.value.replace(/^0+(?!$)/, '')) || 0)}
                    className={`text-3xl font-mono font-bold bg-transparent text-center border-b-2 ${themeClasses.accentBorder} focus:outline-none focus:border-blue-400 w-24`}
                    min="1"
                    max="240"
                    autoFocus
                  />
                  <div className={`text-xs ${themeClasses.accentText} mb-2`}>minutes</div>
                  <div className="flex space-x-2 justify-center">
                    <button
                      onClick={handleSetTime}
                      className={`px-3 py-1.5 ${themeClasses.accentButton} rounded text-xs font-medium transition-colors`}
                    >Set</button>
                    <button
                      onClick={() => setIsEditing(false)}
                      className="px-3 py-1.5 bg-white/10 rounded text-xs font-medium hover:bg-white/20 transition-colors"
                    >Cancel</button>
                  </div>
                </div>
              ) : (
                <div onClick={() => { if (!isActive) { setIsEditing(true); setInputMinutes(Math.floor(timeLeft / 60)); } }} className="cursor-pointer hover:scale-105 transition-transform group select-none">
                  <div className="flex items-center justify-center mb-2">
                    <span className="text-5xl font-mono font-bold">{formatTime(timeLeft)}</span>
                    {!isActive && <PenLine className={`w-5 h-5 ml-2 ${themeClasses.accentText} opacity-70 group-hover:opacity-100 transition-opacity duration-200`} />}
                  </div>
                  <div className={`text-xs ${themeClasses.accentText}`}>{isActive ? 'In Focus' : ''}</div>
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-center space-x-2">
            <button
              onClick={handleStartPause}
              className={`flex items-center space-x-1 px-6 py-3 bg-gradient-to-r ${themeClasses.accent} ${themeClasses.accentHover} rounded-xl shadow-lg text-sm font-semibold transition-all duration-300`}
            >
              {isActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              <span>{isActive ? 'Pause' : 'Start Focus'}</span>
            </button>
            <button
              onClick={handleReset}
              className="p-3 bg-white/10 rounded-xl hover:bg-white/20 transition-all duration-300"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      <div className="mt-auto">
        <button
          onClick={openDashboard}
          className={`w-full py-2 bg-gradient-to-r ${themeClasses.accent} ${themeClasses.accentHover} rounded-xl text-white font-semibold text-sm shadow-lg transition-all duration-300`}
        >
          Open Dashboard
        </button>
      </div>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<DeepFocusPopup />); 