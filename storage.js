const opened = new Promise((resolve,reject) => {
  const request = indexedDB.open("petal-journal", 1);
  request.onupgradeneeded = () => request.result.createObjectStore("pots", {keyPath:"id"});
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

export async function plants() {
  const db = await opened;
  return new Promise((resolve,reject) => {
    const request = db.transaction("pots").objectStore("pots").getAll();
    request.onsuccess = () => resolve(request.result.sort((a,b) => a.created - b.created));
    request.onerror = () => reject(request.error);
  });
}

// Read, change and commit the current record in a single transaction across tabs.
export async function change(id, mutate) {
  const db = await opened;
  return new Promise((resolve,reject) => {
    const tx = db.transaction("pots","readwrite");
    const store = tx.objectStore("pots");
    const request = store.get(id);
    let failure;
    request.onsuccess = () => {
      try { const updated = mutate(request.result); if (updated) store.put(updated); }
      catch (err) { failure = err; tx.abort(); }
    };
    tx.oncomplete = resolve;
    tx.onabort = () => reject(failure || tx.error);
    tx.onerror = () => reject(tx.error);
  });
}
