// ============================================================
// WAWE JOURNAL - JOURNAL CORE (ES Module)
// ============================================================

export function getActiveJournalId() {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem('ww_active_journal_id');
}

export function setActiveJournalId(id) {
  if (typeof localStorage === 'undefined') return;
  if (id) {
    localStorage.setItem('ww_active_journal_id', id);
  } else {
    localStorage.removeItem('ww_active_journal_id');
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('journal-changed', { detail: { id } }));
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
    wwLog.error('Supabase client (window.sb) bulunamadı');
    throw new Error('SUPABASE_NOT_READY');
  }
  return window.sb;
}

let _listJournalsPromise = null;
export async function listJournals() {
  if (_listJournalsPromise) return _listJournalsPromise;
  const sb = getSbClient();
  _listJournalsPromise = (async () => {
    try {
      const { data, error } = await sb.rpc('list_journals');
      if (error) handleJournalError(error);
      return data;
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
  if (stored) {
    listJournals().then(journals => {
      if (journals && journals.length > 0) {
        let active = journals.find(j => j.id === stored);
        if (!active) {
          active = journals.find(j => j.is_default) || journals[0];
          setActiveJournalId(active.id);
        }
      }
    }).catch(() => {});
    return stored;
  }
  try {
    const journals = await listJournals();
    if (!journals || journals.length === 0) {
      if (typeof wwLog !== 'undefined') wwLog.warn('journals boş');
      return null;
    }
    let active = journals.find(j => j.id === stored);
    if (!active) active = journals.find(j => j.is_default) || journals[0];
    setActiveJournalId(active.id);
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

