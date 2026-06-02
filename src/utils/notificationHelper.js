// Active timeouts map: { [taskId]: timeoutId }
const activeTimers = new Map();

// Request push notification permissions
export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    console.warn('This browser does not support desktop notifications');
    return false;
  }
  
  if (Notification.permission === 'granted') {
    return true;
  }
  
  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }
  
  return false;
}

// Check notification permission status
export function getNotificationPermissionStatus() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

// Calculate milliseconds until the specified HH:MM time
function getMsUntilTime(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const now = new Date();
  
  const target = new Date();
  target.setHours(hours, minutes, 0, 0);
  
  // If target time has already passed today, set it for tomorrow
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  
  return target.getTime() - now.getTime();
}

// Schedule a single habit reminder
export function scheduleReminder(habit) {
  if (!habit.reminderTime) return;
  
  // Clear any existing timer for this habit first
  cancelReminder(habit.id);
  
  if (getNotificationPermissionStatus() !== 'granted') {
    return;
  }
  
  const msToTrigger = getMsUntilTime(habit.reminderTime);
  console.log(`Scheduling reminder for "${habit.name}" at ${habit.reminderTime} (in ${Math.round(msToTrigger / 1000)} seconds)`);
  
  const timerId = setTimeout(() => {
    triggerNotification(habit);
    
    // Auto-reschedule for the next day
    scheduleReminder(habit);
  }, msToTrigger);
  
  activeTimers.set(habit.id, timerId);
}

// Cancel a scheduled reminder
export function cancelReminder(habitId) {
  if (activeTimers.has(habitId)) {
    clearTimeout(activeTimers.get(habitId));
    activeTimers.delete(habitId);
  }
}

// Reschedule all active habit reminders (e.g. on app launch or state sync)
export function rescheduleAllReminders(habits) {
  // Clear all old timers
  for (const timerId of activeTimers.values()) {
    clearTimeout(timerId);
  }
  activeTimers.clear();
  
  if (getNotificationPermissionStatus() !== 'granted') {
    return;
  }
  
  habits.forEach(habit => {
    if (habit.reminderTime) {
      scheduleReminder(habit);
    }
  });
}

// Trigger a push notification (delegating to service worker if possible for background visibility)
function triggerNotification(habit) {
  const title = 'Elegant Habits Reminder';
  const body = `Time for your habit: "${habit.name}"!`;
  
  // Try sending message to Service Worker so it can display background notifications
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'SHOW_NOTIFICATION',
      title,
      body
    });
  } else {
    // Fallback to standard web notification
    try {
      new Notification(title, {
        body,
        icon: '/logo.svg'
      });
    } catch (e) {
      console.error('Failed to trigger standard notification:', e);
    }
  }
}
