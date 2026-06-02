// App Key generated for keyvalue.immanuel.co
const APP_KEY = 'lu75o9vz';
const API_BASE = 'https://keyvalue.immanuel.co/api/KeyVal';

// Base64URL Safe Encoder/Decoder
// Prevents 404 router issues caused by encoded slashes (%2F) in IIS/web servers
function base64UrlEncode(str) {
  try {
    const base64 = btoa(unescape(encodeURIComponent(str)));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch (e) {
    console.error('Encoding error:', e);
    return '';
  }
}

function base64UrlDecode(str) {
  try {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    return decodeURIComponent(escape(atob(base64)));
  } catch (e) {
    console.error('Decoding error:', e);
    return null;
  }
}

// Generate a random 6-character sync code
export function generateSyncCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Muted ambiguous characters (I, O, 0, 1)
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Save to LocalStorage
export function saveLocalState(state) {
  try {
    localStorage.setItem('habit_tracker_state', JSON.stringify(state));
  } catch (e) {
    console.error('LocalStorage write error:', e);
  }
}

// Load from LocalStorage
export function getLocalState() {
  try {
    const data = localStorage.getItem('habit_tracker_state');
    if (!data) return null;
    return JSON.parse(data);
  } catch (e) {
    console.error('LocalStorage read error:', e);
    return null;
  }
}

// Push local state to Cloud
export async function pushStateToCloud(syncCode, state) {
  if (!syncCode) return false;
  try {
    const serialized = JSON.stringify({
      habits: state.habits || [],
      history: state.history || {},
      lastUpdated: state.lastUpdated || Date.now()
    });
    
    const encoded = base64UrlEncode(serialized);
    if (!encoded) return false;

    // keyvalue.immanuel.co uses a simple GET/POST path parameter to store the key
    const url = `${API_BASE}/UpdateValue/${APP_KEY}/${syncCode}/${encoded}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json'
      }
    });
    
    const text = await response.text();
    return text.trim() === 'True';
  } catch (e) {
    console.error('Cloud push failed:', e);
    return false;
  }
}

// Fetch state from Cloud
export async function fetchStateFromCloud(syncCode) {
  if (!syncCode) return null;
  try {
    const url = `${API_BASE}/GetValue/${APP_KEY}/${syncCode}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) return null;

    const rawData = await response.text();
    
    // keyvalue.immanuel.co returns "value not found" or empty string when key doesn't exist
    if (!rawData || rawData === 'value not found' || rawData.trim() === '') {
      return null;
    }

    // Decode the Base64URL string
    const decoded = base64UrlDecode(rawData.trim());
    if (!decoded) return null;

    return JSON.parse(decoded);
  } catch (e) {
    console.error('Cloud fetch failed:', e);
    return null;
  }
}

// Reconcile and Sync Local vs Cloud State using lastUpdated timestamps
export async function synchronizeStates(syncCode, localState) {
  if (!syncCode) return localState;
  
  try {
    const cloudState = await fetchStateFromCloud(syncCode);
    
    // Case 1: Cloud is empty - upload local state
    if (!cloudState) {
      const updatedLocal = { ...localState, lastUpdated: Date.now() };
      await pushStateToCloud(syncCode, updatedLocal);
      saveLocalState(updatedLocal);
      return updatedLocal;
    }

    const localTime = localState.lastUpdated || 0;
    const cloudTime = cloudState.lastUpdated || 0;

    // Case 2: Cloud is newer - replace local with cloud
    if (cloudTime > localTime) {
      const newLocal = {
        syncCode,
        habits: cloudState.habits || [],
        history: cloudState.history || {},
        lastUpdated: cloudTime
      };
      saveLocalState(newLocal);
      return newLocal;
    }

    // Case 3: Local is newer - replace cloud with local
    if (localTime > cloudTime) {
      await pushStateToCloud(syncCode, localState);
      return localState;
    }

    // Case 4: In sync
    return localState;
  } catch (e) {
    console.error('Synchronization reconcile failed, returning local state:', e);
    return localState;
  }
}
