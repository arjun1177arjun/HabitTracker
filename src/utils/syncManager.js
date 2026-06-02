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

    // Split the encoded string into chunks of max 150 characters
    const chunkSize = 150;
    const chunks = [];
    for (let i = 0; i < encoded.length; i += chunkSize) {
      chunks.push(encoded.substring(i, i + chunkSize));
    }

    // Push all chunks in parallel
    const pushPromises = chunks.map((chunk, index) => {
      const chunkUrl = `${API_BASE}/UpdateValue/${APP_KEY}/${syncCode}_${index}/${chunk}`;
      return fetch(chunkUrl, { method: 'POST' }).then(r => r.text());
    });

    const results = await Promise.all(pushPromises);
    const allChunksSuccess = results.every(res => res.trim().toLowerCase() === 'true');
    if (!allChunksSuccess) {
      console.error('Failed to push some state chunks to cloud');
      return false;
    }

    // Push metadata containing chunk count and lastUpdated timestamp
    const metadata = `${chunks.length}_${state.lastUpdated || Date.now()}`;
    const metaUrl = `${API_BASE}/UpdateValue/${APP_KEY}/${syncCode}/${metadata}`;
    const metaResponse = await fetch(metaUrl, { method: 'POST' });
    const metaText = await metaResponse.text();
    
    return metaText.trim().toLowerCase() === 'true';
  } catch (e) {
    console.error('Cloud push failed:', e);
    return false;
  }
}

// Fetch state from Cloud
export async function fetchStateFromCloud(syncCode) {
  if (!syncCode) return null;
  try {
    const metaUrl = `${API_BASE}/GetValue/${APP_KEY}/${syncCode}`;
    const metaResponse = await fetch(metaUrl, { method: 'GET' });

    if (!metaResponse.ok) return undefined; // Return undefined on network/server error

    const metaData = await metaResponse.text();
    
    // keyvalue.immanuel.co returns "value not found" or empty string when key doesn't exist
    if (!metaData || metaData === 'value not found' || metaData.trim() === '') {
      return null; // Return null when key does not exist
    }

    const parts = metaData.trim().split('_');
    if (parts.length !== 2) {
      return null;
    }

    const chunksCount = parseInt(parts[0], 10);
    const lastUpdated = parseInt(parts[1], 10);

    if (isNaN(chunksCount) || isNaN(lastUpdated)) {
      return null;
    }

    // Fetch all chunks in parallel
    const chunkPromises = [];
    for (let i = 0; i < chunksCount; i++) {
      const chunkUrl = `${API_BASE}/GetValue/${APP_KEY}/${syncCode}_${i}`;
      chunkPromises.push(
        fetch(chunkUrl, { method: 'GET' })
          .then(async r => {
            if (!r.ok) throw new Error('Network error on chunk fetch');
            const text = await r.text();
            if (text.trim() === 'value not found') throw new Error('Chunk not found');
            return text.trim();
          })
      );
    }

    try {
      const chunkTexts = await Promise.all(chunkPromises);
      const fullEncoded = chunkTexts.join('');
      
      const decoded = base64UrlDecode(fullEncoded);
      if (!decoded) return null;

      const parsed = JSON.parse(decoded);
      parsed.lastUpdated = lastUpdated;
      return parsed;
    } catch (chunkError) {
      console.error('Failed to fetch all state chunks:', chunkError);
      return undefined; // Return undefined on chunk fetch failure
    }
  } catch (e) {
    console.error('Cloud fetch failed:', e);
    return undefined; // Return undefined on network exception
  }
}

// Reconcile and Sync Local vs Cloud State using lastUpdated timestamps
export async function synchronizeStates(syncCode, localState) {
  if (!syncCode) return localState;
  
  try {
    const cloudState = await fetchStateFromCloud(syncCode);
    
    // Case 0: Network error - abort sync, return localState as-is
    if (cloudState === undefined) {
      return localState;
    }
    
    // Case 1: Cloud is empty - upload local state
    if (cloudState === null) {
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
