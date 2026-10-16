import {
  createUserWithEmailAndPassword as firebaseCreateUser,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  sendPasswordResetEmail as firebaseSendPasswordResetEmail,
  signInWithEmailAndPassword as firebaseSignIn,
  signOut as firebaseSignOut
} from "firebase/auth";
import {
  addDoc as firebaseAddDoc,
  collection as firebaseCollection,
  deleteDoc as firebaseDeleteDoc,
  doc as firebaseDoc,
  getDoc as firebaseGetDoc,
  getDocs as firebaseGetDocs,
  onSnapshot,
  query,
  setDoc as firebaseSetDoc,
  updateDoc as firebaseUpdateDoc,
  where
} from "firebase/firestore";
import { auth, db } from "./firebase";

export { auth, db };

function normalizeFirebaseUser(user) {
  if (!user) return null;
  return { ...user, uid: user.uid, id: user.uid };
}

function normalizeData(id, data) {
  const row = { id, ...data };
  if (!row.uid && row.id) row.uid = row.id;
  return row;
}

function cleanPayload(payload) {
  const out = {};
  for (const [key, value] of Object.entries(payload || {})) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

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
  const snap = await firebaseGetDoc(firebaseDoc(db, ref.name, ref.id));
  const row = snap.exists() ? normalizeData(snap.id, snap.data()) : null;
  return {
    exists: () => Boolean(row),
    data: () => row,
    id: ref.id
  };
}

export async function getDocs(ref) {
  const snap = await firebaseGetDocs(firebaseCollection(db, ref.name));
  return {
    docs: snap.docs.map(d => ({ id: d.id, data: () => normalizeData(d.id, d.data()) }))
  };
}

export function subscribeCollection(name, callback, onError) {
  return onSnapshot(
    firebaseCollection(db, name),
    snapshot => callback(snapshot.docs.map(d => normalizeData(d.id, d.data()))),
    error => {
      console.error(`Realtime listener failed for ${name}`, error);
      if (onError) onError(error);
    }
  );
}

export async function addDoc(ref, data) {
  const payload = cleanPayload(data);
  const created = await firebaseAddDoc(firebaseCollection(db, ref.name), payload);
  return { id: created.id };
}

export async function setDoc(ref, data) {
  const payload = cleanPayload({ id: ref.id, uid: ref.id, ...data });
  await firebaseSetDoc(firebaseDoc(db, ref.name, ref.id), payload, { merge: true });
}

export async function updateDoc(ref, data) {
  const payload = cleanPayload(data);
  await firebaseUpdateDoc(firebaseDoc(db, ref.name, ref.id), payload);
}

export async function deleteDoc(ref) {
  await firebaseDeleteDoc(firebaseDoc(db, ref.name, ref.id));
}

export async function deleteDocsWhere(collectionName, conditions = []) {
  const constraints = conditions.map(([field, op, value]) => where(field, op, value));
  const q = query(firebaseCollection(db, collectionName), ...constraints);
  const snap = await firebaseGetDocs(q);
  await Promise.all(snap.docs.map(d => firebaseDeleteDoc(d.ref)));
}

export function onAuthStateChanged(auth, callback) {
  return firebaseOnAuthStateChanged(auth, user => callback(normalizeFirebaseUser(user)));
}

export async function createUserWithEmailAndPassword(auth, email, password) {
  const result = await firebaseCreateUser(auth, email, password);
  return { user: normalizeFirebaseUser(result.user) };
}

export async function signInWithEmailAndPassword(auth, email, password) {
  const result = await firebaseSignIn(auth, email, password);
  return { user: normalizeFirebaseUser(result.user) };
}

export async function signOut(auth) {
  await firebaseSignOut(auth);
}

export async function sendPasswordResetEmail(auth, email) {
  await firebaseSendPasswordResetEmail(auth, email);
}
