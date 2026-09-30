// ============================================================
// WAWE JOURNAL - JOURNAL CORE (ES Module)
// ============================================================

export function getActiveJournalId() {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem('ww_active_journal_id');
}

export function setActiveJournalId(id, silent = false) {
  if (typeof localStorage === 'undefined') return;
  const oldId = localStorage.getItem('ww_active_journal_id');
  if (id) {
    localStorage.setItem('ww_active_journal_id', id);
  } else {
    localStorage.removeItem('ww_active_journal_id');
  }
  // Yalnızca ID gerçekten değiştiyse ve sessiz modda değilse reload/change event'i fırlat
  if (!silent && oldId !== id && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('journal-changed', { detail: { id, oldId } }));
  }
}

function handleJournalError(error) {
  if (!error) return;
  
  if (typeof window !== 'undefined' && window.wwLog) {
    window.wwLog.error('Journal API Error:', error);
  }
  
  const msg = error.message || '';
  const err = new Error(msg);
  
  if (msg.includes('JOURNAL_QUOTA_EXCEEDED')) {
    err.code = 'QUOTA_EXCEEDED';
  } else if (msg.includes('INVALID_NAME')) {
    err.code = 'INVALID_NAME';
  } else if (msg.includes('JOURNAL_NOT_FOUND')) {
    err.code = 'NOT_FOUND';
  } else if (msg.includes('CANNOT_DELETE_DEFAULT')) {
    err.code = 'CANNOT_DELETE_DEFAULT';
  } else if (msg.includes('CANNOT_DELETE_LAST_JOURNAL') || msg.includes('CANNOT_DELETE_LAST')) {
    err.code = 'CANNOT_DELETE_LAST';
  } else {
    err.code = 'GENERIC';
  }
  
  throw err;
}

function getSbClient() {
  if (!window.sb) {
    if (typeof wwLog !== 'undefined') wwLog.error('Supabase client (window.sb) bulunamadı');
    throw new Error('SUPABASE_NOT_READY');
  }
  return window.sb;
}

let _listJournalsPromise = null;
export async function listJournals(forceRefresh = false) {
  if (!forceRefresh && _listJournalsPromise) return _listJournalsPromise;
  const sb = getSbClient();
  _listJournalsPromise = (async () => {
    try {
      let { data, error } = await sb.rpc('list_journals');
      
      // İlk girişte auth token header'a henüz oturmamışsa veya RPC boş dönerse bir kez yeniden dene
      if ((error || !data || data.length === 0) && sb.auth) {
        try {
          const sessionRes = await sb.auth.getSession();
          if (sessionRes?.data?.session) {
            await new Promise(r => setTimeout(r, 200));
            const retryRes = await sb.rpc('list_journals');
            if (retryRes.data && retryRes.data.length > 0) {
              data = retryRes.data;
              error = retryRes.error;
            }
          }
        } catch (retryErr) {}
      }

      if (error) handleJournalError(error);
      return data || [];
    } finally {
      setTimeout(() => { _listJournalsPromise = null; }, 2000);
    }
  })();
  return _listJournalsPromise;
}

export async function ensureActiveJournal(userId) {
  if (!userId) {
    if (typeof wwLog !== 'undefined') wwLog.warn('ensureActiveJournal: userId yok');
    return null;
  }

  const stored = getActiveJournalId();

  try {
    const journals = await listJournals();
    if (!journals || journals.length === 0) {
      if (typeof wwLog !== 'undefined') wwLog.warn('journals boş');
      return stored || null;
    }

    // 1. Tarayıcıda saklanan ID bu kullanıcının mevcut defterleri arasında var mı?
    let active = stored ? journals.find(j => j.id === stored) : null;
    
    // 2. Yoksa veya geçersizse varsayılan defteri veya ilk defteri seç
    if (!active) {
      active = journals.find(j => j.is_default) || journals[0];
    }

    // İlk açılışta sayfayı gereksiz reload döngüsüne sokmamak için sessizce kaydet
    setActiveJournalId(active.id, true);
    return active.id;
  } catch (err) {
    if (typeof wwLog !== 'undefined') wwLog.error('ensureActiveJournal hatası:', err);
    return getActiveJournalId();
  }
}

export async function createJournal({ name, description, color, icon }) {
  const sb = getSbClient();
  const { data, error } = await sb.rpc('create_journal', {
    p_name: name,
    p_description: description,
    p_color: color,
    p_icon: icon
  });
  if (error) handleJournalError(error);
  return data;
}

export async function updateJournal(id, { name, description, color, icon }) {
  const sb = getSbClient();
  const { data, error } = await sb.rpc('update_journal', {
    p_journal_id: id,
    p_name: name,
    p_description: description,
    p_color: color,
    p_icon: icon
  });
  if (error) handleJournalError(error);
  return data;
}

export async function deleteJournal(id) {
  const sb = getSbClient();
  const { data, error } = await sb.rpc('delete_journal', {
    p_journal_id: id
  });
  if (error) handleJournalError(error);
  return data;
}

export async function switchDefaultJournal(id) {
  const sb = getSbClient();
  const { data, error } = await sb.rpc('switch_default_journal', {
    p_journal_id: id
  });
  if (error) handleJournalError(error);
  
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('journal-changed', { detail: { id } }));
  }
  
  return data;
}

export async function getJournal(id) {
  const sb = getSbClient();
  const { data, error } = await sb.rpc('get_journal', {
    p_journal_id: id
  });
  if (error) handleJournalError(error);
  return data;
}

// ES5 Bridge (Düz script tag ile eklenen sayfalarda kullanabilmek için)
if (typeof window !== 'undefined') {
  window.journal = {
    getActiveJournalId,
    setActiveJournalId,
    ensureActiveJournal,
    listJournals,
    createJournal,
    updateJournal,
    deleteJournal,
    switchDefaultJournal,
    getJournal
  };
}

