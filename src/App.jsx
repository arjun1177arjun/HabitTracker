import React, { useState, useEffect, useRef } from 'react';
import { 
  Check, 
  Plus, 
  Trash2, 
  Volume2, 
  Share2, 
  Clock, 
  Calendar, 
  RefreshCw, 
  Copy, 
  ChevronRight,
  Sun,
  Coffee,
  Moon,
  FolderOpen,
  Edit2
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { 
  getLocalState, 
  saveLocalState, 
  generateSyncCode, 
  synchronizeStates, 
  pushStateToCloud 
} from './utils/syncManager';
import { 
  requestNotificationPermission, 
  getNotificationPermissionStatus, 
  scheduleReminder, 
  cancelReminder, 
  rescheduleAllReminders 
} from './utils/notificationHelper';

// Get today's date string in YYYY-MM-DD local format
const getTodayStr = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const date = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${date}`;
};

const getLast5Days = () => {
  const days = [];
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (let i = 4; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const date = String(d.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${date}`;
    const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
    const label = weekdays[d.getDay()][0];
    days.push({ dateStr, dayName, label });
  }
  return days;
};

export default function App() {
  // App States
  const [habits, setHabits] = useState([]);
  const [history, setHistory] = useState({});
  const [syncCode, setSyncCode] = useState('');
  const [lastUpdated, setLastUpdated] = useState(0);
  
  // UI States
  const [activeModal, setActiveModal] = useState(null); // 'add' | 'sync' | 'edit' | null
  const [editingHabit, setEditingHabit] = useState(null);
  const [dragOverCategory, setDragOverCategory] = useState(null);
  const [justChecked, setJustChecked] = useState({}); // { [habitId]: boolean }
  const [showNotificationBanner, setShowNotificationBanner] = useState(false);
  const [syncStatus, setSyncStatus] = useState('local'); // 'local' | 'syncing' | 'synced' | 'error'
  const [expandedHabits, setExpandedHabits] = useState({});
  const [subtaskInputs, setSubtaskInputs] = useState({});
  // Subtasks in the add/edit modal form
  const [modalSubtasks, setModalSubtasks] = useState([]);
  const [modalSubtaskInput, setModalSubtaskInput] = useState('');
  
  // Forms States
  const [newHabitName, setNewHabitName] = useState('');
  const [newHabitCategory, setNewHabitCategory] = useState('Morning');
  const [newHabitRecurring, setNewHabitRecurring] = useState('every-day');
  const [newHabitRecurInterval, setNewHabitRecurInterval] = useState('2');
  const [newHabitReminderTime, setNewHabitReminderTime] = useState('');
  const [inputSyncCode, setInputSyncCode] = useState('');
  
  // Timer for polling
  const pollingTimer = useRef(null);

  // 1. Initial State Loading & Migration
  useEffect(() => {
    const local = getLocalState();
    if (local) {
      setHabits(local.habits || []);
      setHistory(local.history || {});
      setSyncCode(local.syncCode || '');
      setLastUpdated(local.lastUpdated || Date.now());
      if (local.syncCode) {
        setSyncStatus('synced');
      }
    } else {
      // First run - set up basic default habits to show layout
      const defaultCode = '';
      const initialHabits = [
        { id: '1', name: 'Drink water (Warm)', category: 'Morning', recurring: 'every-day', createdAt: Date.now(), order: 0 },
        { id: '2', name: 'Walk / Stretch', category: 'Lunch/Evening', recurring: 'every-day', createdAt: Date.now(), order: 1 },
        { id: '3', name: 'Read a book', category: 'Post Dinner', recurring: 'every-day', createdAt: Date.now(), order: 2 },
      ];
      const initialHistory = {};
      const initialTime = Date.now();
      
      const defaultState = {
        syncCode: defaultCode,
        habits: initialHabits,
        history: initialHistory,
        lastUpdated: initialTime
      };
      
      setHabits(initialHabits);
      setHistory(initialHistory);
      setLastUpdated(initialTime);
      saveLocalState(defaultState);
    }
    
    // Check notification status
    const status = getNotificationPermissionStatus();
    if (status === 'default') {
      setShowNotificationBanner(true);
    }
  }, []);

  // 2. Setup Notification Reminders on habits change
  useEffect(() => {
    if (habits.length > 0) {
      rescheduleAllReminders(habits);
    }
  }, [habits]);

  // Keep a ref of the current state variables to avoid stale closures in polling/event handlers
  const stateRef = useRef({ habits, history, lastUpdated });
  useEffect(() => {
    stateRef.current = { habits, history, lastUpdated };
  }, [habits, history, lastUpdated]);

  // 3. Sync & Polling Manager
  useEffect(() => {
    // Clear existing timer
    if (pollingTimer.current) clearInterval(pollingTimer.current);
    
    if (!syncCode) {
      setSyncStatus('local');
      return;
    }

    const runSync = async () => {
      const { habits: currentHabits, history: currentHistory, lastUpdated: currentLastUpdated } = stateRef.current;
      setSyncStatus('syncing');
      const currentState = {
        syncCode,
        habits: currentHabits,
        history: currentHistory,
        lastUpdated: currentLastUpdated
      };
      
      const synced = await synchronizeStates(syncCode, currentState);
      if (synced && synced.lastUpdated !== currentLastUpdated) {
        setHabits(synced.habits || []);
        setHistory(synced.history || {});
        setLastUpdated(synced.lastUpdated);
        setSyncStatus('synced');
      } else if (synced) {
        setSyncStatus('synced');
      } else {
        setSyncStatus('error');
      }
    };

    // First load sync
    runSync();

    // Poll every 10 seconds ONLY if window is active
    pollingTimer.current = setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        runSync();
      }
    }, 10000);

    // Sync on window focus
    const handleFocus = () => {
      if (navigator.onLine) runSync();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      if (pollingTimer.current) clearInterval(pollingTimer.current);
      window.removeEventListener('focus', handleFocus);
    };
  }, [syncCode]);

  // Helper to trigger and update sync code
  const triggerSync = async (updatedHabits, updatedHistory) => {
    const newTime = Date.now();
    setLastUpdated(newTime);
    
    const newState = {
      syncCode,
      habits: updatedHabits,
      history: updatedHistory,
      lastUpdated: newTime
    };
    
    saveLocalState(newState);
    
    if (syncCode && navigator.onLine) {
      setSyncStatus('syncing');
      const success = await pushStateToCloud(syncCode, newState);
      setSyncStatus(success ? 'synced' : 'error');
    }
  };

  // 4. Request Notifications helper
  const handleEnableNotifications = async () => {
    const granted = await requestNotificationPermission();
    if (granted) {
      rescheduleAllReminders(habits);
    }
    setShowNotificationBanner(false);
  };

  // 5. Recurring Habit Date-Due Helper
  const isHabitDueOnDate = (habit, dateStr) => {
    const date = new Date(dateStr);
    date.setHours(0,0,0,0);
    
    const createdDate = new Date(habit.createdAt || Date.now());
    createdDate.setHours(0,0,0,0);
    
    const diffTime = date.getTime() - createdDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return false; // Habit wasn't created yet
    
    if (habit.recurring === 'every-day') {
      return true;
    } else if (habit.recurring === 'every-sunday') {
      return date.getDay() === 0; // Sunday is 0
    } else if (habit.recurring === 'every-x-days') {
      const interval = parseInt(habit.recurInterval) || 1;
      return diffDays % interval === 0;
    }
    return true;
  };

  // Check category completion to trigger confetti
  const checkCategoryCompletion = (category, updatedHistory, updatedHabits) => {
    const todayStr = getTodayStr();
    const dueHabits = updatedHabits.filter(h => h.category === category && isHabitDueOnDate(h, todayStr));
    
    if (dueHabits.length === 0) return false;
    
    // Check if all due tasks in this category are completed
    return dueHabits.every(h => updatedHistory[h.id] && updatedHistory[h.id][todayStr]);
  };

  // Refs for tracking double click timers on streak dots
  const clickTimeout = useRef({});

  // Streak dot click: single click makes it green ('done') / toggles it
  const handleStreakSingleClick = (habitId, dateStr) => {
    const updatedHistory = { ...history };
    if (!updatedHistory[habitId]) {
      updatedHistory[habitId] = {};
    }

    const current = updatedHistory[habitId][dateStr];
    const isDone = current === 'done' || current === true;

    if (isDone) {
      delete updatedHistory[habitId][dateStr];
    } else {
      updatedHistory[habitId][dateStr] = 'done';
    }

    setHistory(updatedHistory);

    // Shine / Confetti animation if checking off today
    const todayStr = getTodayStr();
    if (dateStr === todayStr && !isDone) {
      setJustChecked(prev => ({ ...prev, [habitId]: true }));
      setTimeout(() => {
        setJustChecked(prev => ({ ...prev, [habitId]: false }));
      }, 1200);

      const habit = habits.find(h => h.id === habitId);
      if (habit && checkCategoryCompletion(habit.category, updatedHistory, habits)) {
        triggerConfetti(habit.category);
      }
    }

    triggerSync(habits, updatedHistory);
  };

  // Streak dot double click: marks it as missed (red) / toggles it
  const handleStreakDoubleClick = (habitId, dateStr) => {
    const updatedHistory = { ...history };
    if (!updatedHistory[habitId]) {
      updatedHistory[habitId] = {};
    }

    const current = updatedHistory[habitId][dateStr];
    const isMissed = current === 'missed' || current === false;

    if (isMissed) {
      delete updatedHistory[habitId][dateStr];
    } else {
      updatedHistory[habitId][dateStr] = 'missed';
    }

    setHistory(updatedHistory);
    triggerSync(habits, updatedHistory);
  };

  // Dispatcher to distinguish single vs double clicks
  const handleStreakClick = (habitId, dateStr) => {
    const key = `${habitId}-${dateStr}`;
    if (clickTimeout.current[key]) {
      clearTimeout(clickTimeout.current[key]);
      clickTimeout.current[key] = null;
      // Double click
      handleStreakDoubleClick(habitId, dateStr);
    } else {
      clickTimeout.current[key] = setTimeout(() => {
        clickTimeout.current[key] = null;
        // Single click
        handleStreakSingleClick(habitId, dateStr);
      }, 250);
    }
  };

  const triggerConfetti = (categoryName) => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });
  };

  // Add a new Habit
  const handleAddHabit = (e) => {
    e.preventDefault();
    if (!newHabitName.trim()) return;

    const newHabit = {
      id: Date.now().toString(),
      name: newHabitName.trim(),
      category: newHabitCategory,
      recurring: newHabitRecurring,
      recurInterval: newHabitRecurring === 'every-x-days' ? newHabitRecurInterval : null,
      reminderTime: newHabitReminderTime || null,
      subtasks: modalSubtasks.map((s, i) => ({ id: `${Date.now()}_${i}`, name: s })),
      createdAt: Date.now(),
      order: habits.length
    };

    const updatedHabits = [...habits, newHabit];
    setHabits(updatedHabits);
    
    // Reset form
    setNewHabitName('');
    setNewHabitReminderTime('');
    setModalSubtasks([]);
    setModalSubtaskInput('');
    setActiveModal(null);
    
    triggerSync(updatedHabits, history);
  };

  // Edit an existing habit
  const handleEditHabit = (e) => {
    e.preventDefault();
    if (!editingHabit || !newHabitName.trim()) return;

    const updatedHabits = habits.map(h => {
      if (h.id === editingHabit.id) {
        return {
          ...h,
          name: newHabitName.trim(),
          category: newHabitCategory,
          recurring: newHabitRecurring,
          recurInterval: newHabitRecurring === 'every-x-days' ? newHabitRecurInterval : null,
          reminderTime: newHabitReminderTime || null,
          subtasks: modalSubtasks.map((s, i) => 
            typeof s === 'object' ? s : { id: `${Date.now()}_${i}`, name: s }
          )
        };
      }
      return h;
    });

    setHabits(updatedHabits);
    setActiveModal(null);
    setEditingHabit(null);
    
    setNewHabitName('');
    setNewHabitReminderTime('');
    setModalSubtasks([]);
    setModalSubtaskInput('');

    triggerSync(updatedHabits, history);
  };

  // Delete Habit
  const handleDeleteHabit = (habitId) => {
    cancelReminder(habitId);
    const updatedHabits = habits.filter(h => h.id !== habitId);
    setHabits(updatedHabits);
    
    const updatedHistory = { ...history };
    delete updatedHistory[habitId];
    setHistory(updatedHistory);

    triggerSync(updatedHabits, updatedHistory);
  };

  // Toggle subtask list expanded view for a habit
  const toggleExpandHabit = (habitId) => {
    setExpandedHabits(prev => ({ ...prev, [habitId]: !prev[habitId] }));
  };

  // Add a subtask to a habit
  const handleAddSubtask = (e, habitId) => {
    e.preventDefault();
    const name = subtaskInputs[habitId]?.trim();
    if (!name) return;

    const updatedHabits = habits.map(h => {
      if (h.id === habitId) {
        const subtasks = h.subtasks || [];
        return {
          ...h,
          subtasks: [...subtasks, { id: Date.now().toString(), name }]
        };
      }
      return h;
    });

    setHabits(updatedHabits);
    setSubtaskInputs(prev => ({ ...prev, [habitId]: '' }));
    triggerSync(updatedHabits, history);
  };

  // Toggle subtask completion status for today
  const toggleSubtaskCompletion = (habitId, subtaskId, dateStr) => {
    const subtaskHistoryKey = `${habitId}_sub_${subtaskId}`;
    const updatedHistory = { ...history };
    if (!updatedHistory[subtaskHistoryKey]) {
      updatedHistory[subtaskHistoryKey] = {};
    }

    const current = !!updatedHistory[subtaskHistoryKey][dateStr];
    updatedHistory[subtaskHistoryKey][dateStr] = !current;

    setHistory(updatedHistory);
    triggerSync(habits, updatedHistory);
  };

  // Delete a subtask from a habit
  const handleDeleteSubtask = (habitId, subtaskId) => {
    const updatedHabits = habits.map(h => {
      if (h.id === habitId) {
        return {
          ...h,
          subtasks: (h.subtasks || []).filter(sub => sub.id !== subtaskId)
        };
      }
      return h;
    });

    const updatedHistory = { ...history };
    delete updatedHistory[`${habitId}_sub_${subtaskId}`];

    setHabits(updatedHabits);
    setHistory(updatedHistory);
    triggerSync(updatedHabits, updatedHistory);
  };

  // Initialize/Join Cloud Sync Code
  const handleEnableSyncCode = () => {
    const generated = generateSyncCode();
    setSyncCode(generated);
    setSyncStatus('syncing');
    setActiveModal('sync');
  };

  const handleJoinSyncCode = (e) => {
    e.preventDefault();
    if (!inputSyncCode.trim()) return;
    
    const cleanCode = inputSyncCode.trim().toUpperCase();
    setSyncCode(cleanCode);
    setSyncStatus('syncing');
    setActiveModal(null);
    setInputSyncCode('');
  };

  const handleCopySyncCode = () => {
    navigator.clipboard.writeText(syncCode);
    alert(`Sync Code "${syncCode}" copied to clipboard!`);
  };

  // 6. Custom Pointer/HTML5 Drag and Drop Handlers
  const handleDragStart = (e, habitId, sourceCategory) => {
    e.dataTransfer.setData('text/plain', habitId);
    e.dataTransfer.effectAllowed = 'move';
    // Small delay to make dragging card look nice
    setTimeout(() => {
      const card = document.getElementById(`habit-${habitId}`);
      if (card) card.classList.add('dragging');
    }, 0);
  };

  const handleDragEnd = (e, habitId) => {
    const card = document.getElementById(`habit-${habitId}`);
    if (card) card.classList.remove('dragging');
    setDragOverCategory(null);
  };

  const handleDragOver = (e, category) => {
    e.preventDefault();
    setDragOverCategory(category);
  };

  const handleDragLeave = () => {
    setDragOverCategory(null);
  };

  const handleDrop = (e, targetCategory, targetHabitId = null) => {
    e.preventDefault();
    const habitId = e.dataTransfer.getData('text/plain');
    if (!habitId) return;

    setHabits(prev => {
      const list = [...prev];
      const draggedIndex = list.findIndex(h => h.id === habitId);
      if (draggedIndex === -1) return prev;

      const draggedHabit = { ...list[draggedIndex] };
      
      // Remove from old index
      list.splice(draggedIndex, 1);
      
      // Update its category
      draggedHabit.category = targetCategory;

      if (targetHabitId) {
        const targetIndex = list.findIndex(h => h.id === targetHabitId);
        list.splice(targetIndex, 0, draggedHabit);
      } else {
        list.push(draggedHabit);
      }

      // Re-assign layout order based on list index
      const updated = list.map((h, i) => ({ ...h, order: i }));
      triggerSync(updated, history);
      return updated;
    });

    setDragOverCategory(null);
  };

  // Move habit manually (useful fallback for mobile device screens where dragging is harder)
  const moveHabitCategory = (habitId, nextCategory) => {
    const updated = habits.map(h => {
      if (h.id === habitId) {
        return { ...h, category: nextCategory };
      }
      return h;
    });
    setHabits(updated);
    triggerSync(updated, history);
  };

  // Streaks Day Generator
  const last5Days = getLast5Days();
  const todayStr = getTodayStr();

  // Render variables
  const categories = ['Morning', 'Lunch/Evening', 'Post Dinner', 'Others'];
  const categoryIcons = {
    'Morning': <Sun className="category-title-icon" style={{ color: '#D49F37' }} />,
    'Lunch/Evening': <Coffee className="category-title-icon" style={{ color: '#D27D6E' }} />,
    'Post Dinner': <Moon className="category-title-icon" style={{ color: '#566A80' }} />,
    'Others': <FolderOpen className="category-title-icon" style={{ color: '#8FA382' }} />
  };

  return (
    <div className="app-container">
      {/* 1. Header Row */}
      <header className="app-header">
        <div className="header-title-section">
          <svg className="logo-icon" viewBox="0 0 512 512" fill="none" stroke="currentColor">
            <rect x="120" y="120" width="272" height="272" rx="40" strokeWidth="36" />
            <path d="M180 256 L230 306 L332 196" strokeWidth="40" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <h1 className="app-title">Elegant Habits</h1>
        </div>
        
        <div className="sync-status-badge" onClick={() => setActiveModal('sync')}>
          <div className={`sync-indicator ${syncStatus}`} />
          <span>
            {syncStatus === 'local' && 'Local Only'}
            {syncStatus === 'syncing' && 'Syncing...'}
            {syncStatus === 'synced' && `Code: ${syncCode}`}
            {syncStatus === 'error' && 'Sync Error'}
          </span>
        </div>
      </header>

      {/* 2. Notification permission banner */}
      {showNotificationBanner && (
        <div className="permission-banner">
          <span className="permission-banner-text">Stay on track! Enable push notifications for habit reminders.</span>
          <button className="primary-btn" onClick={handleEnableNotifications} style={{ padding: '4px 10px', fontSize: '0.85rem' }}>
            Allow
          </button>
        </div>
      )}

      {/* 3. Core Task Board Quadrants */}
      <main className="dashboard-grid">
        {categories.map((category) => {
          const categoryHabits = habits
            .filter(h => h.category === category)
            .sort((a, b) => (a.order || 0) - (b.order || 0));

          return (
            <section 
              key={category} 
              className={`category-section ${dragOverCategory === category ? 'drag-over' : ''}`}
              onDragOver={(e) => handleDragOver(e, category)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, category)}
            >
              <div className="category-header">
                <h2 className="category-title">
                  {categoryIcons[category]}
                  {category}
                </h2>
                <span className="task-count">
                  {categoryHabits.filter(h => isHabitDueOnDate(h, todayStr)).length} due
                </span>
              </div>

              <div className="habit-list">
                {categoryHabits.length === 0 ? (
                  <div className="empty-state">Drag habits here</div>
                ) : (
                  categoryHabits.map((habit) => {
                    const isDueToday = isHabitDueOnDate(habit, todayStr);
                    const isCompletedToday = history[habit.id]?.[todayStr] === 'done' || history[habit.id]?.[todayStr] === true;
                    const isJustChecked = !!justChecked[habit.id];

                    // Render task card (dimmed if not due today)
                    return (
                      <div 
                        key={habit.id}
                        id={`habit-${habit.id}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, habit.id, category)}
                        onDragEnd={(e) => handleDragEnd(e, habit.id)}
                        onDrop={(e) => handleDrop(e, category, habit.id)}
                        className={`habit-card ${isCompletedToday ? 'checked' : ''} ${isJustChecked ? 'just-checked' : ''}`}
                        style={{ opacity: isDueToday ? 1 : 0.55 }}
                      >
                        <div className="habit-main-row">
                          <div className="habit-main-info">
                            {/* Checkbox */}
                            <div 
                              className={`checkbox-container ${isCompletedToday ? 'checked' : ''}`}
                              onClick={() => isDueToday && handleStreakSingleClick(habit.id, todayStr)}
                              style={{ cursor: isDueToday ? 'pointer' : 'not-allowed' }}
                            >
                              <Check className="check-icon" />
                            </div>

                            {/* Clickable Area for Expansion — only show chevron if has subtasks */}
                            <div 
                              className="habit-clickable-area" 
                              onClick={() => (habit.subtasks || []).length > 0 && toggleExpandHabit(habit.id)}
                              style={{ cursor: (habit.subtasks || []).length > 0 ? 'pointer' : 'default' }}
                            >
                              {(habit.subtasks || []).length > 0 && (
                                <ChevronRight className={`expand-toggle-icon ${expandedHabits[habit.id] ? 'expanded' : ''}`} />
                              )}
                              <div className="habit-name" title={habit.name}>
                                {habit.name}
                              </div>
                              {(habit.subtasks || []).length > 0 && (
                                <span style={{ fontSize: '0.75rem', opacity: 0.6, marginLeft: '4px', flexShrink: 0 }}>
                                  ({(habit.subtasks || []).filter(s => !!(history[`${habit.id}_sub_${s.id}`]?.[todayStr])).length}/{(habit.subtasks || []).length})
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Meta: Streaks dots + Action buttons */}
                          <div className="habit-meta">
                            {/* 5-day Streak Circles — larger, label inside */}
                            <div className="streak-grid">
                              {last5Days.map((day) => {
                                const isDueOnDay = isHabitDueOnDate(habit, day.dateStr);
                                const dayStatus = history[habit.id]?.[day.dateStr];
                                
                                let circleClass = '';
                                if (dayStatus === 'done' || dayStatus === true) {
                                  circleClass = 'done';
                                } else if (dayStatus === 'missed' || dayStatus === false) {
                                  circleClass = 'missed';
                                } else if (isDueOnDay && day.dateStr !== todayStr) {
                                  circleClass = 'missed';
                                }

                                return (
                                  <div 
                                    key={day.dateStr} 
                                    className={`streak-circle ${circleClass}`}
                                    onClick={() => handleStreakClick(habit.id, day.dateStr)}
                                    title={`${day.dayName}: ${circleClass === 'done' ? 'Done' : circleClass === 'missed' ? 'Missed' : 'Pending'}`}
                                    style={{ opacity: isDueOnDay ? 1 : 0.25 }}
                                  >
                                    <span className="streak-label-inside">{day.label}</span>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Quick details indicators */}
                            <div className="meta-indicators">
                              {habit.reminderTime && (
                                <Clock className="meta-icon" title={`Reminder: ${habit.reminderTime}${
                                  habit.recurring === 'every-sunday' ? ' (Sundays)' 
                                  : habit.recurring === 'every-x-days' ? ` (every ${habit.recurInterval} days)` 
                                  : ' (daily)'
                                }`} />
                              )}
                              {habit.recurring !== 'every-day' && (
                                <Calendar className="meta-icon" title={habit.recurring === 'every-sunday' ? 'Sundays only' : `Every ${habit.recurInterval} days`} />
                              )}

                              <button 
                                className="habit-action-btn edit"
                                onClick={() => {
                                  setEditingHabit(habit);
                                  setNewHabitName(habit.name);
                                  setNewHabitCategory(habit.category);
                                  setNewHabitRecurring(habit.recurring);
                                  setNewHabitRecurInterval(habit.recurInterval || '2');
                                  setNewHabitReminderTime(habit.reminderTime || '');
                                  setModalSubtasks(habit.subtasks || []);
                                  setModalSubtaskInput('');
                                  setActiveModal('edit');
                                }}
                                title="Edit habit"
                                style={{ marginRight: '2px' }}
                              >
                                <Edit2 size={13} />
                              </button>

                              <button 
                                className="habit-action-btn delete"
                                onClick={() => handleDeleteHabit(habit.id)}
                                title="Delete habit"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Subtask Panel */}
                        {expandedHabits[habit.id] && (
                          <div className="subtask-panel" onClick={(e) => e.stopPropagation()}>
                            {(habit.subtasks || []).map(sub => {
                              const isChecked = !!(history[`${habit.id}_sub_${sub.id}`]?.[todayStr]);
                              return (
                                <div key={sub.id} className={`subtask-item ${isChecked ? 'checked' : ''}`}>
                                  <div className="subtask-left" onClick={() => toggleSubtaskCompletion(habit.id, sub.id, todayStr)}>
                                    <div className={`subtask-checkbox ${isChecked ? 'checked' : ''}`}>
                                      <Check className="subtask-check-icon" />
                                    </div>
                                    <span className="subtask-name" title={sub.name}>{sub.name}</span>
                                  </div>
                                  <button 
                                    className="habit-action-btn delete" 
                                    style={{ padding: '1px 4px', fontSize: '0.85rem' }}
                                    onClick={() => handleDeleteSubtask(habit.id, sub.id)}
                                    title="Delete sub-task"
                                  >
                                    ×
                                  </button>
                                </div>
                              );
                            })}
                            
                            <form onSubmit={(e) => handleAddSubtask(e, habit.id)} className="subtask-add-form">
                              <input 
                                type="text" 
                                required
                                placeholder="Add sub-task..." 
                                className="subtask-input"
                                value={subtaskInputs[habit.id] || ''}
                                onChange={(e) => setSubtaskInputs(prev => ({ ...prev, [habit.id]: e.target.value }))}
                                maxLength={30}
                              />
                              <button type="submit" className="subtask-add-btn" title="Add sub-task">
                                <Plus size={12} />
                              </button>
                            </form>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          );
        })}
      </main>

      {/* 4. Footer controls bar */}
      <footer className="compact-controls">
        <button className="primary-btn" onClick={() => setActiveModal('add')}>
          <Plus size={16} />
          Add Habit
        </button>
        <button className="secondary-btn" onClick={() => setActiveModal('sync')}>
          <Share2 size={16} />
          Pair / Sync Settings
        </button>
      </footer>

      {/* 5. ADD HABIT MODAL */}
      {activeModal === 'add' && (
        <div className="modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Create New Habit</h3>
              <button className="modal-close-btn" onClick={() => setActiveModal(null)}>×</button>
            </div>
            
            <form onSubmit={handleAddHabit}>
              <div className="form-group">
                <label className="form-label">Habit Name</label>
                <input 
                  type="text" 
                  required 
                  placeholder="e.g. Read for 15 mins"
                  className="text-input"
                  value={newHabitName}
                  onChange={(e) => setNewHabitName(e.target.value)}
                  maxLength={40}
                  autoFocus
                />
              </div>

              <div className="grid-2col">
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select 
                    className="select-input"
                    value={newHabitCategory}
                    onChange={(e) => setNewHabitCategory(e.target.value)}
                  >
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Schedule</label>
                  <select 
                    className="select-input"
                    value={newHabitRecurring}
                    onChange={(e) => setNewHabitRecurring(e.target.value)}
                  >
                    <option value="every-day">Every Day</option>
                    <option value="every-sunday">Every Sunday</option>
                    <option value="every-x-days">Every X Days</option>
                  </select>
                </div>
              </div>

              {newHabitRecurring === 'every-x-days' && (
                <div className="form-group">
                  <label className="form-label">Repeat Interval (Days)</label>
                  <input 
                    type="number" 
                    min="1" 
                    max="99"
                    required
                    className="text-input"
                    value={newHabitRecurInterval}
                    onChange={(e) => setNewHabitRecurInterval(e.target.value)}
                  />
                </div>
              )}

              <div className="form-group">
                <label className="form-label">
                  {newHabitRecurring === 'every-sunday' ? 'Reminder Time (Sundays)' :
                   newHabitRecurring === 'every-x-days' ? `Reminder Time (every ${newHabitRecurInterval} days)` :
                   'Daily Reminder Time'} (Optional)
                </label>
                <input 
                  type="time" 
                  className="text-input"
                  value={newHabitReminderTime}
                  onChange={(e) => setNewHabitReminderTime(e.target.value)}
                />
              </div>

              {/* Sub-tasks in Add modal */}
              <div className="form-group">
                <label className="form-label">Sub-tasks (Optional)</label>
                <div className="modal-subtask-list">
                  {modalSubtasks.map((sub, idx) => (
                    <div key={idx} className="modal-subtask-item">
                      <span className="modal-subtask-name">{typeof sub === 'object' ? sub.name : sub}</span>
                      <button 
                        type="button" 
                        className="habit-action-btn delete" 
                        onClick={() => setModalSubtasks(prev => prev.filter((_, i) => i !== idx))}
                      >×</button>
                    </div>
                  ))}
                </div>
                <div className="subtask-add-form" style={{ marginTop: '6px' }}>
                  <input 
                    type="text"
                    className="subtask-input"
                    placeholder="Add sub-task..."
                    value={modalSubtaskInput}
                    onChange={(e) => setModalSubtaskInput(e.target.value)}
                    maxLength={40}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (modalSubtaskInput.trim()) {
                          setModalSubtasks(prev => [...prev, modalSubtaskInput.trim()]);
                          setModalSubtaskInput('');
                        }
                      }
                    }}
                  />
                  <button 
                    type="button" 
                    className="subtask-add-btn"
                    onClick={() => {
                      if (modalSubtaskInput.trim()) {
                        setModalSubtasks(prev => [...prev, modalSubtaskInput.trim()]);
                        setModalSubtaskInput('');
                      }
                    }}
                  >
                    <Plus size={12} />
                  </button>
                </div>
              </div>

              <div className="form-actions">
                <button type="button" className="secondary-btn" onClick={() => { setActiveModal(null); setModalSubtasks([]); setModalSubtaskInput(''); }}>
                  Cancel
                </button>
                <button type="submit" className="primary-btn">
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5.5 EDIT HABIT MODAL */}
      {activeModal === 'edit' && editingHabit && (
        <div className="modal-overlay" onClick={() => { setActiveModal(null); setEditingHabit(null); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Habit</h3>
              <button className="modal-close-btn" onClick={() => { setActiveModal(null); setEditingHabit(null); }}>×</button>
            </div>
            
            <form onSubmit={handleEditHabit}>
              <div className="form-group">
                <label className="form-label">Habit Name</label>
                <input 
                  type="text" 
                  required 
                  placeholder="e.g. Read for 15 mins"
                  className="text-input"
                  value={newHabitName}
                  onChange={(e) => setNewHabitName(e.target.value)}
                  maxLength={40}
                  autoFocus
                />
              </div>

              <div className="grid-2col">
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select 
                    className="select-input"
                    value={newHabitCategory}
                    onChange={(e) => setNewHabitCategory(e.target.value)}
                  >
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Schedule</label>
                  <select 
                    className="select-input"
                    value={newHabitRecurring}
                    onChange={(e) => setNewHabitRecurring(e.target.value)}
                  >
                    <option value="every-day">Every Day</option>
                    <option value="every-sunday">Every Sunday</option>
                    <option value="every-x-days">Every X Days</option>
                  </select>
                </div>
              </div>

              {newHabitRecurring === 'every-x-days' && (
                <div className="form-group">
                  <label className="form-label">Repeat Interval (Days)</label>
                  <input 
                    type="number" 
                    min="1" 
                    max="99"
                    required
                    className="text-input"
                    value={newHabitRecurInterval}
                    onChange={(e) => setNewHabitRecurInterval(e.target.value)}
                  />
                </div>
              )}

              <div className="form-group">
                <label className="form-label">
                  {newHabitRecurring === 'every-sunday' ? 'Reminder Time (Sundays)' :
                   newHabitRecurring === 'every-x-days' ? `Reminder Time (every ${newHabitRecurInterval} days)` :
                   'Daily Reminder Time'} (Optional)
                </label>
                <input 
                  type="time" 
                  className="text-input"
                  value={newHabitReminderTime}
                  onChange={(e) => setNewHabitReminderTime(e.target.value)}
                />
              </div>

              {/* Sub-tasks in Edit modal */}
              <div className="form-group">
                <label className="form-label">Sub-tasks</label>
                <div className="modal-subtask-list">
                  {modalSubtasks.map((sub, idx) => (
                    <div key={idx} className="modal-subtask-item">
                      <span className="modal-subtask-name">{typeof sub === 'object' ? sub.name : sub}</span>
                      <button 
                        type="button" 
                        className="habit-action-btn delete" 
                        onClick={() => setModalSubtasks(prev => prev.filter((_, i) => i !== idx))}
                      >×</button>
                    </div>
                  ))}
                </div>
                <div className="subtask-add-form" style={{ marginTop: '6px' }}>
                  <input 
                    type="text"
                    className="subtask-input"
                    placeholder="Add sub-task..."
                    value={modalSubtaskInput}
                    onChange={(e) => setModalSubtaskInput(e.target.value)}
                    maxLength={40}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (modalSubtaskInput.trim()) {
                          setModalSubtasks(prev => [...prev, modalSubtaskInput.trim()]);
                          setModalSubtaskInput('');
                        }
                      }
                    }}
                  />
                  <button 
                    type="button" 
                    className="subtask-add-btn"
                    onClick={() => {
                      if (modalSubtaskInput.trim()) {
                        setModalSubtasks(prev => [...prev, modalSubtaskInput.trim()]);
                        setModalSubtaskInput('');
                      }
                    }}
                  >
                    <Plus size={12} />
                  </button>
                </div>
              </div>

              <div className="form-actions">
                <button type="button" className="secondary-btn" onClick={() => { setActiveModal(null); setEditingHabit(null); setModalSubtasks([]); setModalSubtaskInput(''); }}>
                  Cancel
                </button>
                <button type="submit" className="primary-btn">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. SYNC & PAIR MODAL */}
      {activeModal === 'sync' && (
        <div className="modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Device Synchronization</h3>
              <button className="modal-close-btn" onClick={() => setActiveModal(null)}>×</button>
            </div>

            {!syncCode ? (
              <div>
                <p className="sync-modal-help">
                  Syncing allows you to view and complete habits across your laptop and phone. Data is stored on a free cloud bucket.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button className="primary-btn" onClick={handleEnableSyncCode} style={{ justifyContent: 'center' }}>
                    Generate New Sync Code
                  </button>
                  
                  <div style={{ margin: '10px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }} />
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>OR JOIN DEVICE</span>
                    <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }} />
                  </div>

                  <form onSubmit={handleJoinSyncCode} style={{ display: 'flex', gap: '6px' }}>
                    <input 
                      type="text" 
                      required 
                      placeholder="Enter 6-digit Sync Code"
                      className="text-input"
                      value={inputSyncCode}
                      onChange={(e) => setInputSyncCode(e.target.value)}
                    />
                    <button type="submit" className="primary-btn">
                      Link
                    </button>
                  </form>
                </div>
              </div>
            ) : (
              <div>
                <p className="sync-modal-help">
                  To link another device (like your phone), open this app on that device, click "Pair / Sync Settings", and enter the code below:
                </p>
                
                <div className="sync-code-display">
                  <span className="sync-code-text">{syncCode}</span>
                  <button className="copy-btn" onClick={handleCopySyncCode}>
                    <Copy size={12} />
                    Copy
                  </button>
                </div>

                <div style={{ margin: '16px 0 8px 0', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                    Status: <strong style={{ color: 'var(--sage-green)' }}>Real-time syncing enabled</strong>
                  </p>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button 
                      className="secondary-btn" 
                      onClick={() => {
                        setSyncCode('');
                        setSyncStatus('local');
                        setActiveModal(null);
                        const local = getLocalState();
                        if (local) {
                          local.syncCode = '';
                          saveLocalState(local);
                        }
                      }}
                      style={{ color: 'var(--terracotta-red)', borderColor: 'var(--terracotta-light)' }}
                    >
                      Disconnect Sync
                    </button>
                    <button 
                      className="primary-btn" 
                      onClick={async () => {
                        setSyncStatus('syncing');
                        const local = getLocalState();
                        if (local) {
                          const synced = await synchronizeStates(syncCode, local);
                          if (synced) {
                            setHabits(synced.habits || []);
                            setHistory(synced.history || {});
                            setLastUpdated(synced.lastUpdated);
                            setSyncStatus('synced');
                            alert('Forced Sync completed successfully!');
                          } else {
                            setSyncStatus('error');
                            alert('Forced Sync failed. Check network connection.');
                          }
                        }
                      }}
                    >
                      <RefreshCw size={14} />
                      Sync Now
                    </button>
                  </div>
                </div>
              </div>
            )}
            
            {/* Alarm Testing Section */}
            <div style={{ margin: '16px 0 8px 0', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
              <h4 style={{ fontSize: '0.9rem', marginBottom: '6px', fontWeight: '600' }}>Alarm Testing</h4>
              <p className="sync-modal-help" style={{ margin: '4px 0 8px 0' }}>
                Verify that your device alarm is working. Click below, and you'll receive a test notification in exactly 3 seconds (perfect to minimize your browser and verify background alerts).
              </p>
              <button 
                className="secondary-btn" 
                onClick={() => {
                  requestNotificationPermission().then(granted => {
                    if (granted) {
                      alert("Test alarm scheduled! Please minimize your browser window or lock your phone now. Alert arrives in 3 seconds.");
                      setTimeout(() => {
                        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                          navigator.serviceWorker.controller.postMessage({
                            type: 'SHOW_NOTIFICATION',
                            title: 'Alarm Working!',
                            body: 'Your Habit Tracker notifications are successfully enabled!'
                          });
                        } else {
                          try {
                            new Notification('Alarm Working!', {
                              body: 'Your Habit Tracker notifications are successfully enabled!',
                              icon: './logo.svg'
                            });
                          } catch (e) {
                            console.error('Failed to trigger Notification:', e);
                          }
                        }
                      }, 3000);
                    } else {
                      alert("Notification permissions are blocked or denied. Please enable them in your browser settings to test alarms.");
                    }
                  });
                }}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                <Volume2 size={14} />
                Trigger Test Alarm (3s delay)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Developed by Arjun Gupta footer credit */}
      <footer style={{ 
        textAlign: 'center', 
        padding: '12px 0 4px 0', 
        fontSize: '0.85rem', 
        color: 'var(--text-muted)',
        borderTop: '1px solid var(--border-color)',
        marginTop: 'auto' 
      }}>
        Developed by Arjun Gupta with help of Gemini AI.
      </footer>
    </div>
  );
}
