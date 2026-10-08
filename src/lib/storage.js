export function loadLocal(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

export function saveLocal(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// Asks the browser not to evict this app's data when the device runs low on space.
// Resolves to whether storage is persistent; false when unsupported or refused.
export async function requestPersistentStorage() {
  try {
    if (!navigator.storage?.persist) return false;
    return (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch {
    return false;
  }
}
