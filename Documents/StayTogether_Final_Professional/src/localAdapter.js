import CryptoJS from "crypto-js";

const COLLECTION_PREFIX = "stay_together_local_collection_";
const AUTH_USERS_KEY = "stay_together_local_auth_users";
const CURRENT_USER_KEY = "stay_together_local_current_user";
const SEED_KEY = "stay_together_local_demo_seeded";
const LOCAL_CHANGE_EVENT = "stay-together-local-change";
const DEMO_EMAIL = "demo@staytogether.local";
const DEMO_PASSWORD = "StayTogether123!";
const authListeners = new Set();
const auth = { type: "local-auth" };
const db = { type: "local-database" };

function readJson(key, fallback) {
  const value = localStorage.getItem(key);
  if (value === null) return fallback;
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`Local test data in "${key}" is invalid JSON. Clear this app's local storage to reset it.`, {
      cause: error
    });
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function collectionKey(name) {
  return `${COLLECTION_PREFIX}${name}`;
}

function readCollection(name) {
  return readJson(collectionKey(name), {});
}

function notifyCollection(name) {
  window.dispatchEvent(new CustomEvent(LOCAL_CHANGE_EVENT, { detail: { name } }));
}

function getCurrentUser() {
  return readJson(CURRENT_USER_KEY, null);
}

function notifyAuthListeners() {
  const currentUser = getCurrentUser();
  for (const listener of authListeners) listener(currentUser);
}

function makeSnapshot(rows) {
  return {
    docs: Object.entries(rows).map(([id, data]) => ({
      id,
      data: () => data
    }))
  };
}

function passwordHash(email, password) {
  return CryptoJS.SHA256(`${email}:${password}`).toString();
}

function cleanPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload || {}).filter(([, value]) => value !== undefined)
  );
}

function seedDemoData() {
  if (localStorage.getItem(SEED_KEY)) return;

  const users = [
    {
      uid: "local-demo-student",
      id: "local-demo-student",
      name: "Alex Morgan",
      email: DEMO_EMAIL,
      role: "student",
      department: "Computer Science",
      headline: "Final-year student | Web developer",
      skills: "React, JavaScript, UI Design",
      bio: "Exploring software development and connecting with alumni.",
      currentYear: "Final Year",
      registerNo: "DEMO2026",
      dob: "2003-05-14",
      online: true,
      verified: false,
      photoRequired: false,
      photoURL: ""
    },
    {
      uid: "local-demo-alumni",
      id: "local-demo-alumni",
      name: "Jordan Lee",
      email: "jordan.alumni@staytogether.local",
      role: "alumni",
      department: "Computer Science",
      headline: "Software Engineer at Northstar Labs",
      skills: "React, Node.js, Mentoring",
      bio: "Happy to share interview and career advice.",
      company: "Northstar Labs",
      jobRole: "Software Engineer",
      experience: "3 years",
      passedOutYear: "2023",
      registerNo: "ALUMNI2023",
      dob: "2001-02-18",
      online: true,
      verified: true,
      photoRequired: false,
      photoURL: ""
    },
    {
      uid: "local-demo-staff",
      id: "local-demo-staff",
      name: "Taylor Rivera",
      email: "taylor.staff@staytogether.local",
      role: "staff",
      department: "Career Services",
      headline: "Career services coordinator",
      skills: "Career Guidance, Recruiting",
      bio: "Sharing campus opportunities and career resources.",
      designation: "Coordinator",
      dob: "1985-08-22",
      online: false,
      verified: true,
      photoRequired: false,
      photoURL: ""
    }
  ];
  const expiry = days => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString();
  };

  writeJson(collectionKey("users"), Object.fromEntries(users.map(user => [user.uid, user])));
  writeJson(collectionKey("posts"), {
    "local-demo-post-1": {
      id: "local-demo-post-1",
      userId: "local-demo-alumni",
      name: "Jordan Lee",
      role: "alumni",
      department: "Computer Science",
      description: "I’m happy to review student portfolios and share tips for preparing for frontend interviews.",
      expiresAt: expiry(14),
      createdAt: new Date().toISOString()
    },
    "local-demo-post-2": {
      id: "local-demo-post-2",
      userId: "local-demo-staff",
      name: "Taylor Rivera",
      role: "staff",
      department: "Career Services",
      description: "Welcome to the StayTogether local demo. Explore the directory, feed, messages and jobs.",
      expiresAt: expiry(14),
      createdAt: new Date().toISOString()
    }
  });
  writeJson(collectionKey("jobs"), {
    "local-demo-job-1": {
      id: "local-demo-job-1",
      title: "Frontend Developer Intern",
      company: "Northstar Labs",
      location: "Remote",
      applyLink: "https://example.com/jobs/frontend-intern",
      description: "A sample opportunity for testing the jobs board.",
      postedBy: "Jordan Lee",
      postedByRole: "alumni",
      expiresAt: expiry(30),
      createdAt: new Date().toISOString()
    }
  });
  writeJson(collectionKey("directMessages"), {});
  writeJson(collectionKey("notifications"), {});
  writeJson(collectionKey("connections"), {});
  writeJson(collectionKey("profileViews"), {});

  const accounts = readJson(AUTH_USERS_KEY, {});
  if (!accounts[DEMO_EMAIL]) {
    accounts[DEMO_EMAIL] = {
      uid: "local-demo-student",
      passwordHash: passwordHash(DEMO_EMAIL, DEMO_PASSWORD),
      displayName: "Alex Morgan"
    };
  }
  writeJson(AUTH_USERS_KEY, accounts);
  localStorage.setItem(SEED_KEY, "true");
}

seedDemoData();

export function serverTimestamp() {
  return new Date().toISOString();
}

export function collection(_db, name) {
  return { type: "collection", name };
}

export function doc(_db, name, id) {
  return { type: "doc", name, id };
}

export async function getDoc(ref) {
  const row = readCollection(ref.name)[ref.id];
  return {
    exists: () => row !== undefined,
    data: () => row,
    id: ref.id
  };
}

export async function getDocs(ref) {
  return makeSnapshot(readCollection(ref.name));
}

export function subscribeCollection(name, callback, onError) {
  let active = true;
  const publish = () => {
    if (!active) return;
    try {
      callback(makeSnapshot(readCollection(name)).docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error(`Local realtime listener failed for ${name}`, error);
      if (onError) onError(error);
    }
  };
  const onLocalChange = event => {
    if (event.detail?.name === name) publish();
  };
  const onStorageChange = event => {
    if (event.key === collectionKey(name)) publish();
  };

  window.addEventListener(LOCAL_CHANGE_EVENT, onLocalChange);
  window.addEventListener("storage", onStorageChange);
  publish();

  return () => {
    active = false;
    window.removeEventListener(LOCAL_CHANGE_EVENT, onLocalChange);
    window.removeEventListener("storage", onStorageChange);
  };
}

export async function addDoc(ref, data) {
  const rows = readCollection(ref.name);
  const id = crypto.randomUUID();
  rows[id] = cleanPayload(data);
  writeJson(collectionKey(ref.name), rows);
  notifyCollection(ref.name);
  return { id };
}

export async function setDoc(ref, data) {
  const rows = readCollection(ref.name);
  rows[ref.id] = {
    ...rows[ref.id],
    id: ref.id,
    uid: ref.id,
    ...cleanPayload(data)
  };
  writeJson(collectionKey(ref.name), rows);
  notifyCollection(ref.name);
}

export async function updateDoc(ref, data) {
  const rows = readCollection(ref.name);
  if (!Object.hasOwn(rows, ref.id)) {
    throw new Error(`Cannot update missing local document "${ref.name}/${ref.id}".`);
  }
  rows[ref.id] = { ...rows[ref.id], ...cleanPayload(data) };
  writeJson(collectionKey(ref.name), rows);
  notifyCollection(ref.name);
}

export async function deleteDoc(ref) {
  const rows = readCollection(ref.name);
  delete rows[ref.id];
  writeJson(collectionKey(ref.name), rows);
  notifyCollection(ref.name);
}

function matchesCondition(row, [field, operator, value]) {
  const fieldValue = row[field];
  switch (operator) {
    case "==": return fieldValue === value;
    case "!=": return fieldValue !== value;
    case "<": return fieldValue < value;
    case "<=": return fieldValue <= value;
    case ">": return fieldValue > value;
    case ">=": return fieldValue >= value;
    case "array-contains": return Array.isArray(fieldValue) && fieldValue.includes(value);
    default: throw new Error(`Unsupported local query operator "${operator}".`);
  }
}

export async function deleteDocsWhere(collectionName, conditions = []) {
  const rows = readCollection(collectionName);
  let changed = false;
  for (const [id, row] of Object.entries(rows)) {
    if (conditions.every(condition => matchesCondition(row, condition))) {
      delete rows[id];
      changed = true;
    }
  }
  if (changed) {
    writeJson(collectionKey(collectionName), rows);
    notifyCollection(collectionName);
  }
}

export function onAuthStateChanged(_auth, callback) {
  let active = true;
  const listener = user => {
    if (active) callback(user);
  };
  authListeners.add(listener);
  queueMicrotask(() => listener(getCurrentUser()));
  return () => {
    active = false;
    authListeners.delete(listener);
  };
}

export async function createUserWithEmailAndPassword(_auth, email, password, profile = {}) {
  const users = readJson(AUTH_USERS_KEY, {});
  if (users[email]) {
    throw new Error("This email is already registered in local test mode.");
  }

  const uid = crypto.randomUUID();
  const user = { uid, id: uid, email, displayName: profile.name || "" };
  users[email] = { uid, passwordHash: passwordHash(email, password), displayName: user.displayName };
  writeJson(AUTH_USERS_KEY, users);
  writeJson(CURRENT_USER_KEY, user);
  notifyAuthListeners();
  return { user };
}

export async function signInWithEmailAndPassword(_auth, email, password) {
  const account = readJson(AUTH_USERS_KEY, {})[email];
  if (!account || account.passwordHash !== passwordHash(email, password)) {
    throw new Error("Invalid email or password for a locally registered account.");
  }

  const user = { uid: account.uid, id: account.uid, email, displayName: account.displayName };
  writeJson(CURRENT_USER_KEY, user);
  notifyAuthListeners();
  return { user };
}

export async function signOut() {
  localStorage.removeItem(CURRENT_USER_KEY);
  notifyAuthListeners();
}

export async function sendPasswordResetEmail() {
  throw new Error("Password reset emails are unavailable in local test mode.");
}
