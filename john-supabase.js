// ══════════════════════════════════════════════
// JOHN PASTORAL AI — Supabase Integration
// john-supabase.js
// Include this script in index.html and john-landing.html
// ══════════════════════════════════════════════

const SUPABASE_URL = 'https://kxrvkximcrrfyizelfon.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4cnZreGltY3JyZnlpemVsZm9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4ODI2NjcsImV4cCI6MjA5NDQ1ODY2N30.7P5wCDO5UhsVKMND2oAvtMl-WwnmcKZMOZUvlWG3N-c';

// ── Supabase client (CDN version — no bundler needed) ──
// Add this to your HTML <head>:
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON);

// ══════════════════════════════════════════════
// WAITLIST
// ══════════════════════════════════════════════

async function submitToWaitlist(email, source = 'landing') {
  const { data, error } = await db
    .from('waitlist')
    .insert([{ email, source }]);
  if (error) {
    // Email already exists — still show success to user
    if (error.code === '23505') return { success: true, duplicate: true };
    console.error('Waitlist error:', error);
    return { success: false, error };
  }
  return { success: true };
}

// ══════════════════════════════════════════════
// AUTH — uses Supabase Auth + local PIN layer
// ══════════════════════════════════════════════

async function signUpUser({ first, last, title, role, email, pin }) {
  // Create Supabase auth account
  const { data: authData, error: authError } = await db.auth.signUp({
    email,
    password: pin + '_john_' + email, // PIN-based pseudo-password
  });
  if (authError) return { success: false, error: authError };

  const uid = authData.user?.id;
  if (!uid) return { success: false, error: 'No user ID returned' };

  // Store user profile
  const { error: userError } = await db
    .from('users')
    .insert([{ id: uid, first, last, title, role, email, pin_hash: btoa(pin) }]);

  if (userError) return { success: false, error: userError };
  return { success: true, user: authData.user };
}

async function signInUser(email, pin) {
  const { data, error } = await db.auth.signInWithPassword({
    email,
    password: pin + '_john_' + email,
  });
  if (error) return { success: false, error };
  return { success: true, session: data.session, user: data.user };
}

async function signOut() {
  await db.auth.signOut();
}

async function getCurrentUser() {
  const { data: { user } } = await db.auth.getUser();
  return user;
}

// ══════════════════════════════════════════════
// PROFILES
// ══════════════════════════════════════════════

async function saveProfile(profileData) {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: 'Not signed in' };

  const { data, error } = await db
    .from('profiles')
    .upsert([{ user_id: user.id, ...profileData, updated_at: new Date().toISOString() }],
      { onConflict: 'user_id' });

  if (error) return { success: false, error };
  return { success: true, data };
}

async function loadProfile() {
  const user = await getCurrentUser();
  if (!user) return null;

  const { data, error } = await db
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (error) return null;
  return data;
}

// ══════════════════════════════════════════════
// MEMBERS
// ══════════════════════════════════════════════

async function loadMembers() {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await db
    .from('members')
    .select('*')
    .eq('user_id', user.id)
    .order('last', { ascending: true });

  if (error) { console.error('Load members error:', error); return []; }
  return data || [];
}

async function saveMember(member) {
  const user = await getCurrentUser();
  if (!user) return { success: false };

  const payload = {
    user_id: user.id,
    first: member.first,
    last: member.last,
    phone: member.phone || null,
    email: member.email || null,
    address: member.address || null,
    birthday: member.birthday || null,
    salvation_date: member.salvation || member.salvation_date || null,
    joined_date: member.joined || member.joined_date || null,
    last_seen: member.lastSeen || member.last_seen || null,
    status: member.status || 'visitor',
    notes: member.notes || [],
  };

  if (member.id && typeof member.id === 'string' && member.id.includes('-')) {
    // UUID — update existing
    const { error } = await db.from('members').update(payload).eq('id', member.id);
    if (error) return { success: false, error };
  } else {
    // New member
    const { error } = await db.from('members').insert([payload]);
    if (error) return { success: false, error };
  }
  return { success: true };
}

async function deleteMemberDB(memberId) {
  const { error } = await db.from('members').delete().eq('id', memberId);
  return { success: !error, error };
}

async function updateMemberNote(memberId, noteText) {
  const user = await getCurrentUser();
  if (!user) return { success: false };

  // Load current notes
  const { data } = await db.from('members').select('notes').eq('id', memberId).single();
  const notes = data?.notes || [];
  notes.unshift({ date: new Date().toISOString().split('T')[0], text: noteText });

  const { error } = await db.from('members').update({ notes }).eq('id', memberId);
  return { success: !error, error };
}

// Migrate localStorage members to Supabase
async function migrateMembersFromLocal() {
  const local = JSON.parse(localStorage.getItem('john_members') || '[]');
  if (!local.length) return;
  console.log(`Migrating ${local.length} members to Supabase...`);
  for (const m of local) {
    await saveMember(m);
  }
  localStorage.removeItem('john_members');
  console.log('Member migration complete.');
}

// ══════════════════════════════════════════════
// CONVERSATIONS & MESSAGES
// ══════════════════════════════════════════════

async function createConversation(title) {
  const user = await getCurrentUser();
  if (!user) return null;

  const { data, error } = await db
    .from('conversations')
    .insert([{ user_id: user.id, title }])
    .select()
    .single();

  if (error) { console.error('Create conversation error:', error); return null; }
  return data;
}

async function updateConversationTitle(conversationId, title) {
  await db.from('conversations')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('id', conversationId);
}

async function saveMessage(conversationId, role, content) {
  const user = await getCurrentUser();
  if (!user) return;

  await db.from('messages').insert([{
    conversation_id: conversationId,
    user_id: user.id,
    role,
    content,
  }]);

  // Update conversation timestamp
  await db.from('conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId);
}

async function loadConversations() {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await db
    .from('conversations')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(30);

  if (error) return [];
  return data || [];
}

async function loadMessages(conversationId) {
  const { data, error } = await db
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) return [];
  return data || [];
}

async function deleteConversation(conversationId) {
  await db.from('messages').delete().eq('conversation_id', conversationId);
  await db.from('conversations').delete().eq('id', conversationId);
}

// Migrate localStorage conversations to Supabase
async function migrateConversationsFromLocal() {
  const local = JSON.parse(localStorage.getItem('john_conversations') || '[]');
  if (!local.length) return;
  console.log(`Migrating ${local.length} conversations to Supabase...`);
  for (const s of local) {
    const conv = await createConversation(s.title);
    if (!conv) continue;
    for (const m of (s.messages || [])) {
      await saveMessage(conv.id, m.role, m.content);
    }
  }
  localStorage.removeItem('john_conversations');
  localStorage.removeItem('john_active_session');
  console.log('Conversation migration complete.');
}

// ══════════════════════════════════════════════
// PRAYER REQUESTS
// ══════════════════════════════════════════════

async function loadPrayerRequests() {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await db
    .from('prayer_requests')
    .select('*')
    .eq('user_id', user.id)
    .eq('resolved', false)
    .order('emergency', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) return [];
  return data || [];
}

async function savePrayerRequest({ name, category, request, emergency, member_id }) {
  const user = await getCurrentUser();
  if (!user) return { success: false };

  const { error } = await db.from('prayer_requests').insert([{
    user_id: user.id,
    name, category, request,
    emergency: !!emergency,
    member_id: member_id || null,
  }]);
  return { success: !error, error };
}

async function resolvePrayerRequest(id) {
  const { error } = await db.from('prayer_requests').update({ resolved: true }).eq('id', id);
  return { success: !error };
}

// ══════════════════════════════════════════════
// TRAVEL VAULT
// ══════════════════════════════════════════════

async function saveTravelVault(vaultData) {
  const user = await getCurrentUser();
  if (!user) return { success: false };

  const { error } = await db.from('travel_vault').upsert([{
    user_id: user.id,
    preferences: vaultData.preferences || {},
    loyalty: vaultData.loyalty || {},
    payment_token: vaultData.payment_token || null,
    auto_mode: vaultData.autoMode || false,
    updated_at: new Date().toISOString(),
  }], { onConflict: 'user_id' });

  return { success: !error, error };
}

async function loadTravelVault() {
  const user = await getCurrentUser();
  if (!user) return null;

  const { data, error } = await db
    .from('travel_vault')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (error) return null;
  return data;
}

// ══════════════════════════════════════════════
// TRIPS
// ══════════════════════════════════════════════

async function saveTrip(tripData) {
  const user = await getCurrentUser();
  if (!user) return { success: false };

  const { error } = await db.from('trips').insert([{
    user_id: user.id, ...tripData
  }]);
  return { success: !error, error };
}

async function loadTrips() {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await db
    .from('trips')
    .select('*')
    .eq('user_id', user.id)
    .order('depart_date', { ascending: false });

  if (error) return [];
  return data || [];
}

// ══════════════════════════════════════════════
// FULL MIGRATION — run once on first login
// ══════════════════════════════════════════════

async function runMigrationIfNeeded() {
  const migrated = localStorage.getItem('john_supabase_migrated');
  if (migrated) return;

  console.log('Running one-time migration from localStorage to Supabase...');
  await migrateMembersFromLocal();
  await migrateConversationsFromLocal();

  // Migrate profile
  const localProfile = JSON.parse(localStorage.getItem('john_profile') || '{}');
  if (localProfile.church) {
    await saveProfile(localProfile);
    localStorage.removeItem('john_profile');
  }

  localStorage.setItem('john_supabase_migrated', '1');
  console.log('Migration complete. All data now lives in Supabase.');
}

// ══════════════════════════════════════════════
// REALTIME — sync across devices
// Uncomment to enable live member/prayer updates
// ══════════════════════════════════════════════

// function subscribeToMembers(userId, onUpdate) {
//   return db
//     .channel('members-changes')
//     .on('postgres_changes',
//       { event: '*', schema: 'public', table: 'members', filter: `user_id=eq.${userId}` },
//       (payload) => onUpdate(payload)
//     )
//     .subscribe();
// }

// Export for use in other scripts
window.JohnDB = {
  db,
  // Auth
  signUpUser, signInUser, signOut, getCurrentUser,
  // Profile
  saveProfile, loadProfile,
  // Members
  loadMembers, saveMember, deleteMemberDB, updateMemberNote, migrateMembersFromLocal,
  // Conversations
  createConversation, updateConversationTitle, saveMessage,
  loadConversations, loadMessages, deleteConversation, migrateConversationsFromLocal,
  // Prayer
  loadPrayerRequests, savePrayerRequest, resolvePrayerRequest,
  // Travel
  saveTravelVault, loadTravelVault, saveTrip, loadTrips,
  // Waitlist
  submitToWaitlist,
  // Migration
  runMigrationIfNeeded,
};

console.log('John Supabase integration loaded.');
