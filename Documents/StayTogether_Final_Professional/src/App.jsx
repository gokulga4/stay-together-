import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity, ArrowLeft, Bell, Bot, Briefcase, Camera, CheckCircle, Edit3,
  Eye, EyeOff, Eye as EyeIcon, Home, KeyRound, LogOut, MessageCircle,
  Moon, Network, Search, Send, Settings, ShieldCheck, Sparkles, Sun,
  Trash2, UserCheck, UserPlus, UserRound, UsersRound, PlusCircle
} from "lucide-react";
const isLocalMode = import.meta.env.VITE_USE_LOCAL_BACKEND === "true" ||
  !import.meta.env.VITE_FIREBASE_API_KEY;
const backend = await (isLocalMode
  ? import("./localAdapter")
  : import("./firebaseAdapter"));
const {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  addDoc, collection, deleteDoc, doc, getDoc, getDocs,
  serverTimestamp, setDoc, updateDoc,
  subscribeCollection, deleteDocsWhere
} = backend;
import CryptoJS from "crypto-js";
const { auth, db } = backend;
import "./style.css";
import "./localMode.css";
import "./mobile.css";


function cleanEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail(email));
}

function passwordChecks(password) {
  return {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /\d/.test(password),
    special: /[^A-Za-z0-9]/.test(password)
  };
}

function isStrongPassword(password) {
  const c = passwordChecks(password || "");
  return c.length && c.upper && c.lower && c.number && c.special;
}

function passwordErrorMessage() {
  return "Password must have minimum 8 characters, one uppercase letter, one lowercase letter, one number and one special character like @, #, $, !";
}

function PasswordRules({ password }) {
  const c = passwordChecks(password || "");
  const item = (ok, text) => <span className={ok ? "ruleOk" : "ruleBad"}>{ok ? "✓" : "•"} {text}</span>;
  return (
    <div className="passwordRules">
      {item(c.length, "8+ characters")}
      {item(c.upper, "Uppercase")}
      {item(c.lower, "Lowercase")}
      {item(c.number, "Number")}
      {item(c.special, "Special character")}
    </div>
  );
}

function Logo() {
  return <div className="logoMark">S</div>;
}

function Back({ go, to = "home" }) {
  return <button className="backBtn" onClick={() => go(to)}><ArrowLeft size={17} /> Back</button>;
}

function Avatar({ u, size = "" }) {
  return u?.photoURL
    ? <img src={u.photoURL} className={`avatar ${size}`} alt="profile" />
    : <div className={`avatarText ${size}`}>{u?.name?.[0]?.toUpperCase() || "U"}</div>;
}

function isBirthdayToday(dob) {
  if (!dob) return false;
  const today = new Date();
  const d = new Date(dob);
  return d.getDate() === today.getDate() && d.getMonth() === today.getMonth();
}

function formatDOB(dob) {
  if (!dob) return "Not Added";
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return dob;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function timeValue(value) {
  if (!value) return 0;
  if (typeof value === "object" && typeof value.seconds === "number") return value.seconds * 1000;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function secret(a, b) {
  return ["StayTogether_E2E_2026", a, b].sort().join("_");
}

function encryptText(text, a, b) {
  return CryptoJS.AES.encrypt(text, secret(a, b)).toString();
}

function decryptText(msg, a, b) {
  if (!msg.encryptedText) return msg.text || "";
  try {
    return CryptoJS.AES.decrypt(msg.encryptedText, secret(a, b)).toString(CryptoJS.enc.Utf8) || "Unable to decrypt";
  } catch {
    return "Unable to decrypt";
  }
}

async function enableLocalNotifications() {
  if (!("Notification" in window)) {
    alert("Notifications are not supported in this browser/app view.");
    return false;
  }
  if (Notification.permission === "granted") return true;
  const permission = await Notification.requestPermission();
  return permission === "granted";
}

function showLocalNotification(title, body) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  new Notification(title, { body, icon: "/icon.png" });
}

function compressPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = event => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        const max = 520;
        if (w > h && w > max) {
          h = Math.round((h * max) / w);
          w = max;
        } else if (h > max) {
          w = Math.round((w * max) / h);
          h = max;
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.onerror = reject;
      img.src = event.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function App() {
  const [page, setPage] = useState("login");
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [dark, setDark] = useState(localStorage.getItem("stay_dark") === "true");
  const [directoryTab, setDirectoryTab] = useState("all");
  const [messageTab, setMessageTab] = useState("all");
  const [chatUser, setChatUser] = useState(null);
  const [viewUser, setViewUser] = useState(null);

  const [data, setData] = useState({
    users: [], posts: [], jobs: [], directMessages: [],
    notifications: [], connections: [], profileViews: []
  });

  async function findExistingProfile(currentUser) {
    const directSnap = await getDoc(doc(db, "users", currentUser.uid));
    if (directSnap.exists()) {
      return { profile: directSnap.data(), legacyId: null };
    }

    const email = cleanEmail(currentUser.email);
    if (!email) return { profile: null, legacyId: null };

    const usersSnap = await getDocs(collection(db, "users"));
    const matches = usersSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(u => cleanEmail(u.email) === email);

    if (matches.length === 0) return { profile: null, legacyId: null };

    const best = matches.find(u => u.name || u.department || u.photoURL || u.registerNo) || matches[0];
    const oldId = best.uid || best.id || best.id;
    return { profile: best, legacyId: oldId && oldId !== currentUser.uid ? oldId : null };
  }

  async function replaceUserIdInCollection(collectionName, field, oldId, newId) {
    if (!oldId || oldId === newId) return;
    const snap = await getDocs(collection(db, collectionName));
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(row => row[field] === oldId);
    await Promise.allSettled(rows.map(row => updateDoc(doc(db, collectionName, row.id), { [field]: newId })));
  }

  async function migrateLegacyUserData(oldId, currentUser, profileData) {
    if (!oldId || oldId === currentUser.uid) return;
    const newId = currentUser.uid;
    await Promise.allSettled([
      replaceUserIdInCollection("connections", "fromId", oldId, newId),
      replaceUserIdInCollection("connections", "toId", oldId, newId),
      replaceUserIdInCollection("directMessages", "senderId", oldId, newId),
      replaceUserIdInCollection("directMessages", "receiverId", oldId, newId),
      replaceUserIdInCollection("notifications", "userId", oldId, newId),
      replaceUserIdInCollection("notifications", "relatedUserId", oldId, newId),
      replaceUserIdInCollection("notifications", "senderId", oldId, newId),
      replaceUserIdInCollection("profileViews", "viewerId", oldId, newId),
      replaceUserIdInCollection("profileViews", "viewedId", oldId, newId),
      replaceUserIdInCollection("posts", "userId", oldId, newId),
      replaceUserIdInCollection("jobs", "userId", oldId, newId),
      replaceUserIdInCollection("posts", "authorId", oldId, newId),
      replaceUserIdInCollection("jobs", "postedBy", oldId, newId)
    ]);

    await setDoc(doc(db, "users", newId), {
      ...profileData,
      id: newId,
      uid: newId,
      email: cleanEmail(currentUser.email || profileData.email),
      online: true,
      lastSeen: serverTimestamp(),
      migratedFromUid: oldId,
      migratedAt: serverTimestamp()
    });
  }

  useEffect(() => {
    document.body.className = dark ? "dark" : "";
    localStorage.setItem("stay_dark", String(dark));
  }, [dark]);

  useEffect(() => {
    return onAuthStateChanged(auth, async currentUser => {
      if (!currentUser) {
        setUser(null);
        setProfile(null);
        setPage("login");
        return;
      }

      try {
        setUser(currentUser);

        const { profile: existingProfile, legacyId } = await findExistingProfile(currentUser);

        if (existingProfile) {
          const fixedProfile = {
            ...existingProfile,
            id: currentUser.uid,
            uid: currentUser.uid,
            email: cleanEmail(currentUser.email || existingProfile.email),
            online: true,
            lastSeen: serverTimestamp()
          };

          if (legacyId) {
            await migrateLegacyUserData(legacyId, currentUser, fixedProfile);
          } else {
            await setDoc(doc(db, "users", currentUser.uid), fixedProfile);
          }

          setProfile(fixedProfile);
          await loadAll();
          setPage("home");
        } else {
          // If Auth exists but no profile exists anywhere, create a starter profile only once.
          // This never deletes old profiles or IDs. It just prevents a blank crash.
          const starterProfile = {
            id: currentUser.uid,
            uid: currentUser.uid,
            email: cleanEmail(currentUser.email || ""),
            name: currentUser.displayName || (currentUser.email ? currentUser.email.split("@")[0] : "New User"),
            role: "student",
            headline: "",
            department: "",
            dob: "",
            registerNo: "",
            percentage: "",
            skills: "",
            bio: "",
            currentYear: "",
            careerGoal: "",
            passedOutYear: "",
            company: "",
            jobRole: "",
            experience: "",
            designation: "",
            photoURL: "",
            online: true,
            verified: false,
            photoRequired: true,
            createdAt: serverTimestamp(),
            lastSeen: serverTimestamp()
          };
          await setDoc(doc(db, "users", currentUser.uid), starterProfile);
          setProfile(starterProfile);
          await loadAll();
          setPage("home");
        }
      } catch (err) {
        console.error("Auto login/profile load error", err);
        alert(err?.message || "Unable to load profile from Firebase.");
        setPage("login");
      }
    });
  }, []);

  useEffect(() => {
    if (!user) return;

    const names = ["users", "posts", "jobs", "directMessages", "notifications", "connections", "profileViews"];
    const unsubscribers = names.map(name =>
      subscribeCollection(name, rows => {
        setData(prev => ({ ...prev, [name]: rows }));
      })
    );

    return () => unsubscribers.forEach(unsub => unsub && unsub());
  }, [user?.uid]);

  async function loadAll() {
    const names = ["users", "posts", "jobs", "directMessages", "notifications", "connections", "profileViews"];
    const snaps = await Promise.all(names.map(name => getDocs(collection(db, name))));
    setData({
      users: snaps[0].docs.map(d => ({ id: d.id, ...d.data() })),
      posts: snaps[1].docs.map(d => ({ id: d.id, ...d.data() })),
      jobs: snaps[2].docs.map(d => ({ id: d.id, ...d.data() })),
      directMessages: snaps[3].docs.map(d => ({ id: d.id, ...d.data() })),
      notifications: snaps[4].docs.map(d => ({ id: d.id, ...d.data() })),
      connections: snaps[5].docs.map(d => ({ id: d.id, ...d.data() })),
      profileViews: snaps[6].docs.map(d => ({ id: d.id, ...d.data() }))
    });
  }

  async function logout() {
    const ok = window.confirm("Are you sure you want to logout from StayTogether?");
    if (!ok) return;

    try {
      if (user) {
        await updateDoc(doc(db, "users", user.uid), {
          online: false,
          lastSeen: serverTimestamp()
        });
      }
    } catch (err) {
      console.warn("Unable to update logout status", err);
    }

    setUser(null);
    setProfile(null);
    setChatUser(null);
    setViewUser(null);
    setPage("login");
    await signOut(auth);
  }

  async function deleteMyProfile() {
    if (!user || !profile) return;

    const first = window.confirm(
      "Delete your StayTogether profile? Your profile, posts, jobs, messages, notifications, connections and profile views will be removed from the app. This will not delete other users."
    );
    if (!first) return;

    const typed = window.prompt('Type DELETE to confirm profile deletion');
    if (typed !== "DELETE") {
      alert("Profile deletion cancelled.");
      return;
    }

    try {
      const uid = user.uid;

      await Promise.allSettled([
        deleteDocsWhere("directMessages", [["senderId", "==", uid]]),
        deleteDocsWhere("directMessages", [["receiverId", "==", uid]]),
        deleteDocsWhere("connections", [["fromId", "==", uid]]),
        deleteDocsWhere("connections", [["toId", "==", uid]]),
        deleteDocsWhere("notifications", [["userId", "==", uid]]),
        deleteDocsWhere("profileViews", [["viewerId", "==", uid]]),
        deleteDocsWhere("profileViews", [["viewedId", "==", uid]]),
        deleteDocsWhere("posts", [["userId", "==", uid]]),
        deleteDocsWhere("jobs", [["userId", "==", uid]])
      ]);

      await deleteDoc(doc(db, "users", uid));

      setUser(null);
      setProfile(null);
      setChatUser(null);
      setViewUser(null);
      setData({ users: [], posts: [], jobs: [], directMessages: [], notifications: [], connections: [], profileViews: [] });
      setPage("login");
      await signOut(auth);
      alert("Your StayTogether profile has been deleted from the app.");
    } catch (err) {
      console.error(err);
      alert(err?.message || "Unable to delete profile. Check Firebase rules and try again.");
    }
  }

  function conn(a, b) {
    const list = data.connections.filter(c =>
      ((c.fromId === a && c.toId === b) || (c.fromId === b && c.toId === a)) &&
      c.status !== "rejected"
    );
    return list.find(c => c.status === "accepted") || list.find(c => c.status === "pending") || null;
  }

  async function sendConn(toUser) {
    if (conn(user.uid, toUser.uid)) {
      alert("Already requested or connected.");
      return;
    }
    const connectionRef = await addDoc(collection(db, "connections"), {
      fromId: user.uid,
      toId: toUser.uid,
      fromName: profile.name,
      toName: toUser.name,
      status: "pending",
      createdAt: serverTimestamp()
    });
    await addDoc(collection(db, "notifications"), {
      userId: toUser.uid,
      title: "Connection Request",
      text: `${profile.name} wants to connect with you`,
      type: "connection_request",
      requestId: connectionRef.id,
      relatedUserId: user.uid,
      readBy: [],
      deletedBy: [],
      createdAt: serverTimestamp()
    });
    await loadAll();
  }

  async function updateConn(c, status) {
    await updateDoc(doc(db, "connections", c.id), { status });

    // Auto-clear the original request notification for the receiver after approve/reject.
    const oldRequestNotifications = data.notifications.filter(n =>
      n.userId === user.uid &&
      (n.requestId === c.id || (n.type === "connection_request" && n.relatedUserId === c.fromId)) &&
      !n.deletedBy?.includes(user.uid)
    );
    await Promise.all(oldRequestNotifications.map(n =>
      updateDoc(doc(db, "notifications", n.id), { deletedBy: [...(n.deletedBy || []), user.uid], readBy: Array.from(new Set([...(n.readBy || []), user.uid])) })
    ));

    await addDoc(collection(db, "notifications"), {
      userId: c.fromId,
      title: status === "accepted" ? "Connection Approved" : "Connection Rejected",
      text: status === "accepted" ? `${profile.name} approved your connection request` : `${profile.name} rejected your connection request`,
      type: status === "accepted" ? "connection_accepted" : "connection_rejected",
      relatedUserId: user.uid,
      readBy: [],
      deletedBy: [],
      createdAt: serverTimestamp()
    });
    await loadAll();
  }

  async function openProfile(u) {
    setViewUser(u);
    if (u.uid !== user.uid) {
      await addDoc(collection(db, "profileViews"), {
        viewerId: user.uid,
        viewerName: profile.name,
        viewerRole: profile.role,
        viewedId: u.uid,
        viewedName: u.name,
        createdAt: serverTimestamp()
      });
    }
    setPage("viewProfile");
  }

  const unread = data.directMessages.filter(m =>
    m.receiverId === user?.uid &&
    !m.readByReceiver &&
    !m.deletedForEveryone &&
    !m.deletedFor?.includes(user?.uid)
  ).length;

  const notes = data.notifications
    .filter(n =>
      (n.userId === user?.uid || n.userId === "all") &&
      !n.deletedBy?.includes(user?.uid)
    )
    .sort((a, b) => timeValue(b.createdAt) - timeValue(a.createdAt));

  const unreadNotes = notes.filter(n => !n.readBy?.includes(user?.uid));

  const acceptedConnections = data.connections.filter(c =>
    (c.fromId === user?.uid || c.toId === user?.uid) && c.status === "accepted"
  );

  useEffect(() => {
    if (!user || data.directMessages.length === 0) return;
    const latest = [...data.directMessages]
      .filter(m => m.receiverId === user.uid && !m.readByReceiver && !m.deletedForEveryone)
      .sort((a, b) => timeValue(b.createdAt) - timeValue(a.createdAt))[0];

    if (!latest) return;
    const lastSeenMessage = localStorage.getItem("stay_last_notification_message");
    if (latest.id !== lastSeenMessage) {
      showLocalNotification("StayTogether - New message", `${latest.senderName || "Someone"} sent you a message`);
      localStorage.setItem("stay_last_notification_message", latest.id);
    }
  }, [data.directMessages, user]);


  function addDaysFromNow(days) {
    const selectedDays = Number(days) || 7;
    const d = new Date();
    d.setDate(d.getDate() + selectedDays);
    return d.toISOString();
  }

  function isActiveUntil(item) {
    if (!item?.expiresAt) return true;
    return new Date(item.expiresAt).getTime() >= Date.now();
  }

  function sortNewestFirst(a, b) {
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  }

  function formatExpiry(dateValue) {
    if (!dateValue) return "No expiry";
    return new Date(dateValue).toLocaleDateString();
  }

  function Header() {
    return (
      <header className="topHeader">
        <div className="brand" onClick={() => user && setPage("home")}>
          <Logo />
          <div>
            <h1>StayTogether</h1>
            <p>Resume • Network • Jobs</p>
            {isLocalMode && <small className="localModeBadge">LOCAL TEST MODE · SAVED IN THIS BROWSER</small>}
          </div>
        </div>

        {user && (
          <div className="topActions">
            <button className="iconBtn" onClick={() => setDark(!dark)}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
            <button className="iconBtn notificationBtn" onClick={() => setPage("notifications")}>
              <Bell size={18} />
              {unreadNotes.length + unread > 0 && <span>{unreadNotes.length + unread}</span>}
            </button>
            <button className="iconBtn" onClick={logout}><LogOut size={18} /></button>
          </div>
        )}
      </header>
    );
  }

  function Login() {
    const [form, setForm] = useState({
      email: isLocalMode ? "demo@staytogether.local" : "",
      password: isLocalMode ? "StayTogether123!" : ""
    });
    const [show, setShow] = useState(false);

    async function login(e) {
      e.preventDefault();
      const email = cleanEmail(form.email);
      if (!isValidEmail(email)) return alert("Please enter a correct email ID, example: name@gmail.com");
      if (!form.password) return alert("Please enter password");

      try {
        await signInWithEmailAndPassword(auth, email, form.password);
      } catch (err) {
        console.error("Login error", err);
        alert(err?.message || "Invalid email ID or password");
      }
    }

    async function reset() {
      const email = cleanEmail(form.email);
      if (!isValidEmail(email)) return alert("Enter a correct email ID first");
      await sendPasswordResetEmail(auth, email);
      alert("Reset link sent to your email");
    }

    return (
      <div className="loginPage">
        <div className="loginHero"><Logo /><h1>StayTogether</h1><p>Students • Alumni • Staff</p></div>
        <div className="authCard">
          <h2>Welcome Back</h2>
          {isLocalMode && (
            <div className="localDemoNotice">
              <b>Local demo account</b>
              <span>Email: demo@staytogether.local</span>
              <span>Password: StayTogether123!</span>
              <small>Test data is stored only in this browser. Firebase is not being used.</small>
            </div>
          )}
          <form onSubmit={login}>
            <input type="email" placeholder="Correct Email ID" value={form.email} onChange={e => setForm({ ...form, email: cleanEmail(e.target.value) })} />
            <div className="passwordBox">
              <input type={show ? "text" : "password"} placeholder="Password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
              <button type="button" onClick={() => setShow(!show)}>{show ? <EyeOff size={17} /> : <Eye size={17} />}</button>
            </div>
            <button>Login</button>
          </form>
          <button className="lightBtn" onClick={reset}><KeyRound size={16} /> Forgot Password</button>
          <button className="lightBtn" onClick={() => setPage("register")}>Create Account</button>
        </div>
      </div>
    );
  }

  function Register() {
    const [form, setForm] = useState({
      role: "student", name: "", email: "", password: "", department: "",
      registerNo: "", percentage: "", dob: "", skills: "", bio: "",
      currentYear: "", careerGoal: "", passedOutYear: "", company: "",
      jobRole: "", experience: "", designation: "", headline: ""
    });
    const [show, setShow] = useState(false);
    const change = e => setForm({ ...form, [e.target.name]: e.target.value });

    async function register(e) {
      e.preventDefault();
      const email = cleanEmail(form.email);
      if (!form.name.trim()) return alert("Full name required");
      if (!isValidEmail(email)) return alert("Please enter a correct email ID, example: name@gmail.com");
      if (!isStrongPassword(form.password)) return alert(passwordErrorMessage());
      if (!form.dob) return alert("DOB required");
      if ((form.role === "student" || form.role === "alumni") && !form.registerNo.trim()) return alert("Register number required");

      try {
        const created = await createUserWithEmailAndPassword(auth, email, form.password, { ...form, email });
        const newProfile = {
          id: created.user.uid,
          uid: created.user.uid,
          ...form,
          email,
          photoURL: "",
          online: true,
          verified: form.role === "staff",
          photoRequired: form.role !== "staff",
          lastSeen: serverTimestamp(),
          createdAt: serverTimestamp()
        };

        await setDoc(doc(db, "users", created.user.uid), newProfile);
        setUser(created.user);
        setProfile(newProfile);
        await loadAll();
        setPage("profile");
      } catch (err) {
        console.error("Register error", err);
        alert(err?.message || "Registration failed. Check Firebase Auth, Firestore rules and users collection.");
      }
    }

    return (
      <div className="authCard registerCard">
        <h2>Create Account</h2>
        <form onSubmit={register}>
          <select name="role" value={form.role} onChange={change}>
            <option value="student">Student</option>
            <option value="alumni">Alumni</option>
            <option value="staff">Staff</option>
          </select>
          <input name="name" placeholder="Full Name" onChange={change} />
          <input name="headline" placeholder="Headline e.g. BCA Student | Front-End Enthusiast" onChange={change} />
          <input name="email" type="email" placeholder="Correct Email ID" value={form.email} onChange={e => setForm({ ...form, email: cleanEmail(e.target.value) })} />
          <div className="passwordBox">
            <input name="password" type={show ? "text" : "password"} placeholder="Strong Password" value={form.password} onChange={change} />
            <button type="button" onClick={() => setShow(!show)}>{show ? <EyeOff size={17} /> : <Eye size={17} />}</button>
          </div>
          <PasswordRules password={form.password} />
          <input name="department" placeholder="Department" onChange={change} />
          <input name="dob" type="date" value={form.dob} onChange={change} />
          {(form.role === "student" || form.role === "alumni") && (
            <>
              <input name="registerNo" placeholder="Register Number" onChange={change} />
              <input name="percentage" placeholder="Percentage" onChange={change} />
            </>
          )}
          {form.role === "student" && (
            <>
              <input name="currentYear" placeholder="Current Year" onChange={change} />
              <input name="careerGoal" placeholder="Career Goal" onChange={change} />
            </>
          )}
          {form.role === "alumni" && (
            <>
              <input name="passedOutYear" placeholder="Passed Out Year" onChange={change} />
              <input name="company" placeholder="Company" onChange={change} />
              <input name="jobRole" placeholder="Job Role" onChange={change} />
              <input name="experience" placeholder="Experience" onChange={change} />
            </>
          )}
          {form.role === "staff" && <input name="designation" placeholder="Designation" onChange={change} />}
          <input name="skills" placeholder="Skills" onChange={change} />
          <textarea name="bio" placeholder="Bio/About Me" onChange={change} />
          <button>Register</button>
        </form>
        <button className="lightBtn" onClick={() => setPage("login")}>Back</button>
      </div>
    );
  }

  function HomeDashboard() {
    return (
      <section className="card">
        <h2>Dashboard</h2>
        <p>Choose a section to continue.</p>
        <div className="actionGrid">
          <button onClick={() => setPage("profile")}>My Profile</button>
          <button onClick={() => setPage("network")}>Friends</button>
          <button onClick={() => setPage("directory")}>People Directory</button>
          <button onClick={() => setPage("messages")}>Messages {unread ? `(${unread})` : ""}</button>
          <button onClick={() => setPage("visitors")}>Profile Visitors</button>
          <button onClick={() => setPage("createPost")}>Create Post</button>
          <button onClick={() => setPage("jobs")}>Jobs</button>
          <button onClick={() => setPage("feed")}>Feed</button>
          <button onClick={() => setPage("settings")}>Settings</button>
          {profile?.role === "student" && <button onClick={() => setPage("careerHub")}>Career Hub</button>}
        </div>
      </section>
    );
  }

  function ProfilePage() {
    const [form, setForm] = useState(() => ({ ...(profile || {}) }));
    const [preview, setPreview] = useState(profile?.photoURL || "");

    // Bug fix: when profile loads after auto-login, keep the edit form synced.
    // Without this, users may see empty fields after logging out/login again.
    useEffect(() => {
      if (profile) {
        setForm({ ...profile });
        setPreview(profile.photoURL || "");
      }
    }, [profile?.uid, profile?.id]);

    if (!profile || !user) {
      return (
        <section className="card">
          <Back go={setPage} />
          <h2>Loading profile...</h2>
          <p>Please wait while StayTogether loads your saved profile from Firebase.</p>
        </section>
      );
    }

    async function photo(e) {
      const file = e.target.files?.[0];
      if (!file) return;
      const img = await compressPhoto(file);
      await updateDoc(doc(db, "users", user.uid), { photoURL: img });
      setPreview(img);
      setProfile({ ...profile, photoURL: img });
      await loadAll();
    }

    async function save(e) {
      e.preventDefault();
      const updatedProfile = { ...(profile || {}), ...form, id: user.uid, uid: user.uid };
      await updateDoc(doc(db, "users", user.uid), updatedProfile);
      setProfile(updatedProfile);
      await loadAll();
      alert("Profile updated");
      setPage("home");
    }

    const fields = ["name", "headline", "department", "dob", "registerNo", "percentage", "skills", "currentYear", "careerGoal", "passedOutYear", "company", "jobRole", "experience"];

    return (
      <section className="card">
        <Back go={setPage} />
        <h2>My Profile</h2>
        <div className="photoBox">
          {preview ? <img src={preview} className="avatar huge" alt="preview" /> : <Avatar u={form} size="huge" />}
          <label className="uploadBtn"><Camera size={17} /> Upload Photo<input type="file" accept="image/*" onChange={photo} /></label>
        </div>
        <form onSubmit={save}>
          {fields.map(k => (
            <input
              key={k}
              name={k}
              type={k === "dob" ? "date" : "text"}
              value={form[k] || ""}
              placeholder={k === "dob" ? "Date of Birth" : k}
              onChange={e => setForm({ ...form, [k]: e.target.value })}
            />
          ))}
          <textarea value={form.bio || ""} placeholder="bio" onChange={e => setForm({ ...form, bio: e.target.value })} />
          <button>Save</button>
        </form>
      </section>
    );
  }

  function RoleChangePage() {
    const [newRole, setNewRole] = useState(profile?.role || "student");
    const [registerNo, setRegisterNo] = useState(profile?.registerNo || "");

    async function save(e) {
      e.preventDefault();
      if (newRole === "staff") return alert("Staff role cannot be selected here. Contact admin.");
      if (!registerNo.trim()) return alert("Register number required.");

      const updates = { role: newRole, registerNo, photoRequired: true, verified: false };
      if (newRole === "student") {
        updates.company = "";
        updates.jobRole = "";
        updates.experience = "";
        updates.passedOutYear = "";
      }
      if (newRole === "alumni") {
        updates.currentYear = "";
        updates.careerGoal = "";
      }

      await updateDoc(doc(db, "users", user.uid), updates);
      setProfile({ ...profile, ...updates });
      await loadAll();
      alert("Role updated successfully. Your access is changed now.");
      setPage("home");
    }

    return (
      <section className="card">
        <Back go={setPage} />
        <h2>Change Role</h2>
        <p>If you selected wrong role, change Student ↔ Alumni here.</p>
        <form onSubmit={save}>
          <select value={newRole} onChange={e => setNewRole(e.target.value)}>
            <option value="student">Student</option>
            <option value="alumni">Alumni</option>
          </select>
          <input value={registerNo} onChange={e => setRegisterNo(e.target.value)} placeholder="Register Number" />
          <button>Update Role</button>
        </form>
      </section>
    );
  }

  function DirectoryPage() {
    const [localSearch, setLocalSearch] = useState("");

    const connectedIds = acceptedConnections.map(c => c.fromId === user.uid ? c.toId : c.fromId);
    let users = data.users.filter(u => JSON.stringify(u).toLowerCase().includes(localSearch.toLowerCase()));
    if (directoryTab !== "all") users = users.filter(u => u.role === directoryTab);

    const connectedPeople = users.filter(u => connectedIds.includes(u.uid));
    const otherPeople = users.filter(u => !connectedIds.includes(u.uid));

    function renderPerson(u) {
      const c = conn(user.uid, u.uid);
      return (
        <div className="miniProfile" key={u.uid}>
          <Avatar u={u} />
          <div className="miniProfileBody">
            <h3 onClick={() => openProfile(u)}>{u.name} {u.online && <span className="dotOnline"></span>}</h3>
            <p>{u.role} • {u.department}{u.company ? ` • ${u.company}` : ""}</p>
            <span className="badge">{u.skills || u.company || u.designation || "Profile"}</span>
            <p>{u.bio}</p>
            <button className="smallBtn" onClick={() => openProfile(u)}><UserRound size={15} /> View Profile</button>
            {u.uid !== user.uid && !c && <button className="smallBtn" onClick={() => sendConn(u)}><UserPlus size={15} /> Connect</button>}
            {u.uid !== user.uid && c?.status === "pending" && <button className="smallBtn mutedBtn">Pending</button>}
            {u.uid !== user.uid && c?.status === "accepted" && <button className="smallBtn successBtn"><UserCheck size={15} /> Connected</button>}
            {u.uid !== user.uid && <button className="smallBtn" onClick={() => { setChatUser(u); setPage("personalChat"); }}><MessageCircle size={15} /> Message</button>}
          </div>
        </div>
      );
    }

    return (
      <section className="card">
        <Back go={setPage} />
        <h2>People Directory</h2>
        <div className="tabs">
          {["all", "student", "alumni", "staff"].map(t => (
            <button key={t} className={directoryTab === t ? "active" : ""} onClick={() => setDirectoryTab(t)}>{t}</button>
          ))}
        </div>
        <div className="searchBox"><Search size={16} /><input value={localSearch} onChange={e => setLocalSearch(e.target.value)} placeholder="Search name, register no, skills, company..." /></div>
        {connectedPeople.length > 0 && <><h3>Connected People</h3>{connectedPeople.map(renderPerson)}</>}
        <h3>Suggested People</h3>
        {otherPeople.length === 0 && <p className="empty">No people found.</p>}
        {otherPeople.map(renderPerson)}
      </section>
    );
  }

  function ViewProfilePage() {
    if (!viewUser) return <section className="card"><Back go={setPage} /></section>;

    const total = data.connections.filter(c => (c.fromId === viewUser.uid || c.toId === viewUser.uid) && c.status === "accepted").length;
    const followers = data.connections.filter(c => c.toId === viewUser.uid && c.status === "accepted").length;
    const following = data.connections.filter(c => c.fromId === viewUser.uid && c.status === "accepted").length;
    const c = conn(user.uid, viewUser.uid);

    return (
      <section className="card viewProfilePage">
        <Back go={setPage} to="directory" />
        <div className="cover viewCover"></div>
        <div className="viewProfileHero profileLike">
          <Avatar u={viewUser} size="huge" />
          <h2>{viewUser.name}</h2>
          <p>{viewUser.headline || `${viewUser.role} • ${viewUser.department}`}</p>
          {isBirthdayToday(viewUser.dob) && <span className="birthdayBadge">🎂 Birthday Today</span>}
          {viewUser.online && <span className="onlineBadge"><Activity size={13} /> Online</span>}
          <div className="connectionLine"><span>{total} connections</span><span>{followers} followers</span><span>{following} following</span></div>
        </div>

        <div className="profileInfoGrid">
          {["registerNo", "percentage", "dob", "company", "jobRole", "skills", "bio"].map(k => (k === "dob" || viewUser[k]) && (
            <div key={k}><b>{k === "dob" ? "DOB" : k}</b><span>{k === "dob" ? formatDOB(viewUser[k]) : viewUser[k]}</span></div>
          ))}
        </div>

        {viewUser.uid !== user.uid && !c && <button onClick={() => sendConn(viewUser)}><UserPlus size={15} /> Connect</button>}
        {viewUser.uid !== user.uid && c?.status === "pending" && <button className="mutedBtn">Pending</button>}
        {viewUser.uid !== user.uid && c?.status === "accepted" && <button className="successBtn"><UserCheck size={15} /> Connected</button>}
        {viewUser.uid !== user.uid && <button onClick={() => { setChatUser(viewUser); setPage("personalChat"); }}>Message</button>}
      </section>
    );
  }

  function NetworkPage() {
    const [tab, setTab] = useState("requests");
    const incoming = data.connections.filter(c => c.toId === user.uid && c.status === "pending");
    const outgoing = data.connections.filter(c => c.fromId === user.uid && c.status === "pending");
    const suggested = data.users.filter(u => u.uid !== user.uid && !conn(user.uid, u.uid)).slice(0, 10);

    return (
      <section className="card networkPage">
        <Back go={setPage} />
        <h2><Network size={18} /> Friends</h2>

        <div className="networkTabs threeTabs">
          <button className={tab === "requests" ? "active" : ""} onClick={() => setTab("requests")}>Requests</button>
          <button className={tab === "friends" ? "active" : ""} onClick={() => setTab("friends")}>Friends</button>
          <button className={tab === "grow" ? "active" : ""} onClick={() => setTab("grow")}>Find People</button>
        </div>

        <div className="networkCounts">
          <div><b>{acceptedConnections.length}</b><span>Friends</span></div>
          <div><b>{incoming.length}</b><span>To Approve</span></div>
          <div><b>{outgoing.length}</b><span>Sent</span></div>
        </div>

        {tab === "requests" && (
          <>
            <h3>Approve or Reject Requests</h3>
            {incoming.length === 0 && <p className="empty">No new connection requests.</p>}
            {incoming.map(c => {
              const requestUser = data.users.find(u => u.uid === c.fromId);
              return (
                <div className="requestCard" key={c.id}>
                  <div className="requestUser">
                    <Avatar u={requestUser || { name: c.fromName }} />
                    <div>
                      <b>{c.fromName}</b>
                      <p>wants to connect with you</p>
                    </div>
                  </div>
                  <div className="requestActions">
                    <button onClick={() => updateConn(c, "accepted")}><UserCheck size={15} /> Approve</button>
                    <button className="rejectBtn" onClick={() => updateConn(c, "rejected")}>Reject</button>
                  </div>
                </div>
              );
            })}

            <h3>Sent Requests</h3>
            {outgoing.length === 0 && <p className="empty">No sent requests.</p>}
            {outgoing.map(c => (
              <div className="notificationItem" key={c.id}>
                <div><b>{c.toName}</b><p>Request pending</p></div>
                <span className="pendingPill">Pending</span>
              </div>
            ))}
          </>
        )}

        {tab === "friends" && (
          <>
            <h3>Your Friends / Connections</h3>
            {acceptedConnections.length === 0 && <p className="empty">No friends yet.</p>}
            {acceptedConnections.map(c => {
              const otherId = c.fromId === user.uid ? c.toId : c.fromId;
              const otherName = c.fromId === user.uid ? c.toName : c.fromName;
              const otherUser = data.users.find(u => u.uid === otherId);
              return (
                <div className="miniProfile" key={c.id}>
                  <Avatar u={otherUser || { name: otherName }} />
                  <div className="miniProfileBody">
                    <h3>{otherName}</h3>
                    <p>{otherUser?.role || "Connected"} • {otherUser?.department || ""}</p>
                    <button className="smallBtn" onClick={() => { if (otherUser) { setChatUser(otherUser); setPage("personalChat"); } }}>Message</button>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {tab === "grow" && (
          <>
            <h3>People you may know</h3>
            {suggested.length === 0 && <p className="empty">No suggestions now.</p>}
            {suggested.map(u => (
              <div className="miniProfile suggestCard" key={u.uid}>
                <Avatar u={u} />
                <div className="miniProfileBody">
                  <h3>{u.name}</h3>
                  <p>{u.role} • {u.department}</p>
                  <p>{u.bio}</p>
                  <button className="smallBtn" onClick={() => sendConn(u)}><UserPlus size={15} /> Connect</button>
                </div>
              </div>
            ))}
          </>
        )}
      </section>
    );
  }

  function VisitorsPage() {
    const visitors = data.profileViews.filter(v => v.viewedId === user.uid);
    return (
      <section className="card">
        <Back go={setPage} />
        <h2><EyeIcon size={18} /> Profile Visitors</h2>
        {visitors.length === 0 && <p>No visitors yet.</p>}
        {visitors.map(v => (
          <div className="notificationItem" key={v.id}>
            <div><b>{v.viewerName}</b><p>{v.viewerRole} viewed your profile</p></div>
            <EyeIcon />
          </div>
        ))}
      </section>
    );
  }

  function MessagesDashboard() {
    const [chatSearch, setChatSearch] = useState("");
    let people = data.users.filter(u => u.uid !== user.uid);
    if (messageTab !== "all") people = people.filter(u => u.role === messageTab);
    if (chatSearch) people = people.filter(u => JSON.stringify(u).toLowerCase().includes(chatSearch.toLowerCase()));

    const recentChats = data.directMessages
      .filter(m => m.senderId === user.uid || m.receiverId === user.uid)
      .reduce((map, m) => {
        const otherId = m.senderId === user.uid ? m.receiverId : m.senderId;
        map[otherId] = m;
        return map;
      }, {});

    return (
      <section className="card">
        <Back go={setPage} />
        <h2><MessageCircle size={18} /> Messages</h2>
        <p>Anyone can message anyone. Messages are encrypted before storing in {isLocalMode ? "this browser" : "Firebase"}.</p>

        <div className="messageCards">
          <button onClick={() => setMessageTab("all")} className={messageTab === "all" ? "activeCard" : ""}>All</button>
          <button onClick={() => setMessageTab("student")} className={messageTab === "student" ? "activeCard" : ""}>Students</button>
          <button onClick={() => setMessageTab("alumni")} className={messageTab === "alumni" ? "activeCard" : ""}>Alumni</button>
          <button onClick={() => setMessageTab("staff")} className={messageTab === "staff" ? "activeCard" : ""}>Staff</button>
        </div>

        <div className="searchBox"><Search size={16} /><input value={chatSearch} onChange={e => setChatSearch(e.target.value)} placeholder="Search people to message..." /></div>

        <div className="messageHint">
          <b>Student → Alumni conversation ideas</b>
          <p>Ask about internships, job referrals, interview preparation, company culture and career guidance.</p>
        </div>

        {people.map(u => (
          <div className="miniProfile" key={u.uid}>
            <Avatar u={u} />
            <div className="miniProfileBody">
              <h3>{u.name} {u.online && <span className="dotOnline"></span>}</h3>
              <p>{u.role} • {u.department}{u.company ? ` • ${u.company}` : ""}</p>
              {recentChats[u.uid] && <span className="badge">Recent chat</span>}
              <button className="smallBtn" onClick={() => { setChatUser(u); setPage("personalChat"); }}>Open Chat</button>
            </div>
          </div>
        ))}
      </section>
    );
  }

  function PersonalChat() {
    const [text, setText] = useState("");
    const [edit, setEdit] = useState(null);

    useEffect(() => {
      if (!chatUser) return;
      const unreadFromThisUser = data.directMessages.filter(m =>
        m.receiverId === user.uid &&
        m.senderId === chatUser.uid &&
        !m.readByReceiver &&
        !m.deletedForEveryone &&
        !m.deletedFor?.includes(user.uid)
      );
      const messageNotifications = data.notifications.filter(n =>
        n.userId === user.uid &&
        n.type === "message" &&
        n.relatedUserId === chatUser.uid &&
        !n.deletedBy?.includes(user.uid)
      );
      if (unreadFromThisUser.length === 0 && messageNotifications.length === 0) return;
      Promise.all([
        ...unreadFromThisUser.map(m => updateDoc(doc(db, "directMessages", m.id), { readByReceiver: true })),
        ...messageNotifications.map(n => updateDoc(doc(db, "notifications", n.id), {
          readBy: Array.from(new Set([...(n.readBy || []), user.uid])),
          deletedBy: [...(n.deletedBy || []), user.uid]
        }))
      ]).then(loadAll).catch(() => {});
    }, [chatUser?.uid]);

    if (!chatUser) return <section className="card"><Back go={setPage} /></section>;

    const msgs = data.directMessages
      .filter(m => !m.deletedForEveryone && !m.deletedFor?.includes(user.uid) &&
        ((m.senderId === user.uid && m.receiverId === chatUser.uid) || (m.senderId === chatUser.uid && m.receiverId === user.uid)))
      .sort((a, b) => timeValue(a.createdAt) - timeValue(b.createdAt));



    async function send(e) {
      e.preventDefault();
      if (!text.trim()) return;

      if (edit) {
        await updateDoc(doc(db, "directMessages", edit), {
          encryptedText: encryptText(text, user.uid, chatUser.uid),
          edited: true
        });
        setEdit(null);
      } else {
        await addDoc(collection(db, "directMessages"), {
          senderId: user.uid,
          receiverId: chatUser.uid,
          senderName: profile.name,
          receiverName: chatUser.name,
          encryptedText: encryptText(text, user.uid, chatUser.uid),
          text: "🔒 Encrypted",
          deletedFor: [],
          deletedForEveryone: false,
          readByReceiver: false,
          createdAt: serverTimestamp()
        });
        await addDoc(collection(db, "notifications"), {
          userId: chatUser.uid,
          title: "New message",
          text: `${profile.name}: ${text.slice(0, 40)}`,
          type: "message",
          relatedUserId: user.uid,
          senderId: user.uid,
          readBy: [],
          deletedBy: [],
          createdAt: serverTimestamp()
        });
      }
      setText("");
      await loadAll();
    }

    async function delMe(m) {
      await updateDoc(doc(db, "directMessages", m.id), { deletedFor: [...(m.deletedFor || []), user.uid] });
      await loadAll();
    }

    async function delAll(m) {
      if (m.senderId !== user.uid) return alert("Only sender");
      await updateDoc(doc(db, "directMessages", m.id), { deletedForEveryone: true });
      await loadAll();
    }

    return (
      <section className="card">
        <Back go={setPage} to="messages" />
        <h2>Chat with {chatUser.name}</h2>
        <p>{chatUser.role} • {chatUser.department}</p>
        <div className="privacyNote">🔒 End-to-end style encryption: message text is encrypted before saving to {isLocalMode ? "this browser" : "Firebase"}.</div>
        <div className="chatSuggestion">
          <b>Quick topic:</b> Internship, job opening, referral, interview tips, project guidance.
        </div>
        <div className="chatWindow">
          {msgs.map(m => (
            <div key={m.id} className={`chatBubble ${m.senderId === user.uid ? "me" : "other"}`}>
              <small>{m.senderName}{m.edited ? " • edited" : ""}</small>
              <p>{decryptText(m, user.uid, chatUser.uid)}</p>
              <div className="msgActions">
                {m.senderId === user.uid && <button type="button" onClick={() => { setText(decryptText(m, user.uid, chatUser.uid)); setEdit(m.id); }}><Edit3 size={13} /> Edit</button>}
                <button type="button" onClick={() => delMe(m)}><Trash2 size={13} /> Delete me</button>
                {m.senderId === user.uid && <button type="button" onClick={() => delAll(m)}><Trash2 size={13} /> Delete all</button>}
              </div>
            </div>
          ))}
        </div>
        <form className="chatInput" onSubmit={send}>
          <input value={text} onChange={e => setText(e.target.value)} placeholder={edit ? "Edit message" : "Ask about internship/job/career..."} />
          <button><Send size={16} /></button>
        </form>
      </section>
    );
  }

  function NotificationsPage() {
    async function del(n) {
      await updateDoc(doc(db, "notifications", n.id), {
        deletedBy: [...(n.deletedBy || []), user.uid],
        readBy: Array.from(new Set([...(n.readBy || []), user.uid]))
      });
      await loadAll();
    }

    async function markRead(n) {
      await updateDoc(doc(db, "notifications", n.id), {
        readBy: Array.from(new Set([...(n.readBy || []), user.uid]))
      });
      await loadAll();
    }

    async function markAllRead() {
      const unreadList = notes.filter(n => !n.readBy?.includes(user.uid));
      if (unreadList.length === 0) return alert("No unread notifications.");
      await Promise.all(unreadList.map(n => updateDoc(doc(db, "notifications", n.id), {
        readBy: Array.from(new Set([...(n.readBy || []), user.uid]))
      })));
      await loadAll();
    }

    function openNotification(n) {
      markRead(n);
      if (n.type === "message") {
        const sender = data.users.find(u => u.uid === n.relatedUserId || u.uid === n.senderId);
        if (sender) {
          setChatUser(sender);
          setPage("personalChat");
        }
      } else if (n.type === "connection_request") {
        setPage("network");
      }
    }

    const groupedNotes = notes.reduce((acc, n) => {
      const key = n.type === "message"
        ? `message_${n.relatedUserId || n.senderId}`
        : n.type === "connection_request"
          ? `connection_request_${n.relatedUserId || n.requestId}`
          : `${n.title}_${n.text}`;
      if (!acc[key]) acc[key] = { ...n, items: [n], unreadCount: n.readBy?.includes(user.uid) ? 0 : 1 };
      else {
        acc[key].items.push(n);
        if (!n.readBy?.includes(user.uid)) acc[key].unreadCount += 1;
        if (timeValue(n.createdAt) > timeValue(acc[key].createdAt)) {
          acc[key] = { ...n, items: acc[key].items, unreadCount: acc[key].unreadCount };
        }
      }
      return acc;
    }, {});

    const displayNotes = Object.values(groupedNotes)
      .sort((a, b) => timeValue(b.createdAt) - timeValue(a.createdAt));

    return (
      <section className="card">
        <Back go={setPage} />
        <h2>Notifications</h2>
        <p>{unreadNotes.length} unread notification{unreadNotes.length === 1 ? "" : "s"}</p>
        {notes.length > 0 && <button className="lightBtn" onClick={markAllRead}><CheckCircle size={16} /> Mark all as read</button>}
        {displayNotes.length === 0 && <p>No notifications yet.</p>}
        {displayNotes.map(n => (
          <div className={`notificationItem ${n.unreadCount > 0 ? "unreadNotice" : ""}`} key={n.id}>
            <div onClick={() => openNotification(n)}>
              <b>{n.title}</b>
              {n.items.length > 1 && <span className="badge">{n.items.length} updates</span>}
              {n.unreadCount > 0 && <span className="badge">Unread</span>}
              <p>{n.text}</p>
            </div>
            <div className="noticeActions">
              {n.unreadCount > 0 && <button className="deletePostBtn" onClick={() => markRead(n)}><CheckCircle size={15} /></button>}
              <button className="deletePostBtn" onClick={() => del(n)}><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
      </section>
    );
  }

  function CreatePost() {
    const [post, setPost] = useState({ description: "", videoUrl: "", expiryDays: "7" });

    async function submit(e) {
      e.preventDefault();
      await addDoc(collection(db, "posts"), {
        ...post,
        userId: user.uid,
        name: profile.name,
        role: profile.role,
        department: profile.department,
        expiryDays: Number(post.expiryDays) || 7,
        expiresAt: addDaysFromNow(post.expiryDays),
        createdAt: serverTimestamp()
      });
      await loadAll();
      setPage("feed");
    }

    return (
      <section className="card">
        <Back go={setPage} />
        <h2>Create Post</h2>
        <p>Share achievements, ideas, opportunities or career updates.</p>
        <form onSubmit={submit}>
          <textarea placeholder="Write your professional update..." onChange={e => setPost({ ...post, description: e.target.value })} />
          <input placeholder="Video/link optional" onChange={e => setPost({ ...post, videoUrl: e.target.value })} />
          <select value={post.expiryDays} onChange={e => setPost({ ...post, expiryDays: e.target.value })}>
            <option value="1">Show for 1 day</option>
            <option value="3">Show for 3 days</option>
            <option value="7">Show for 7 days</option>
            <option value="15">Show for 15 days</option>
            <option value="30">Show for 30 days</option>
          </select>
          <button>Post</button>
        </form>
      </section>
    );
  }

  function FeedPage() {
    const posts = data.posts.filter(isActiveUntil).sort(sortNewestFirst);
    return (
      <section className="card">
        <Back go={setPage} />
        <h2>Professional Feed</h2>
        {posts.length === 0 && <p>No posts yet.</p>}
        {posts.map(p => (
          <article className="postCard card" key={p.id}>
            <div className="postHeader">
              <Avatar u={data.users.find(u => u.uid === p.userId) || p} />
              <div><h3>{p.name}</h3><p>{p.role} • {p.department}</p></div>
              {(profile.role === "staff" || p.userId === user.uid) && <button className="deletePostBtn" onClick={async () => { await deleteDoc(doc(db, "posts", p.id)); await loadAll(); }}><Trash2 size={15} /></button>}
            </div>
            <p className="postDescription">{p.description}</p>
            {p.videoUrl && <a className="videoLink" href={p.videoUrl} target="_blank" rel="noreferrer">Open link</a>}
            <small>Visible until {formatExpiry(p.expiresAt)}</small>
          </article>
        ))}
      </section>
    );
  }

  function CareerHub() {
    return (
      <section className="card">
        <Back go={setPage} />
        <h2>Career Hub</h2>
        {["Create profile like online resume", "Connect with students, alumni, staff and professionals", "Message alumni for internships and job guidance", "Share achievements and project updates", "Use Job Board to find opportunities"].map((t, i) => (
          <div className="helpItem" key={i}><h3><CheckCircle size={16} /> Tip {i + 1}</h3><p>{t}</p></div>
        ))}
      </section>
    );
  }

  function JobBoard() {
    const [job, setJob] = useState({ title: "", company: "", location: "", applyLink: "", description: "", expiryDays: "15" });

    async function submitJob(e) {
      e.preventDefault();
      if (profile.role === "student") return alert("Students can view jobs. Alumni and staff can post jobs.");
      await addDoc(collection(db, "jobs"), {
        ...job,
        postedBy: profile.name,
        postedByRole: profile.role,
        expiryDays: Number(job.expiryDays) || 15,
        expiresAt: addDaysFromNow(job.expiryDays),
        createdAt: serverTimestamp()
      });
      await addDoc(collection(db, "notifications"), {
        userId: "all",
        title: "New job posted",
        text: `${profile.name} posted ${job.title} at ${job.company}`,
        deletedBy: [],
        createdAt: serverTimestamp()
      });
      setJob({ title: "", company: "", location: "", applyLink: "", description: "", expiryDays: "15" });
      await loadAll();
    }

    return (
      <section className="card">
        <Back go={setPage} />
        <h2><Briefcase size={18} /> Jobs</h2>
        {profile?.role !== "student" && (
          <form className="jobForm" onSubmit={submitJob}>
            <h3>Post Job / Internship</h3>
            <input value={job.title} onChange={e => setJob({ ...job, title: e.target.value })} placeholder="Job Title" />
            <input value={job.company} onChange={e => setJob({ ...job, company: e.target.value })} placeholder="Company" />
            <input value={job.location} onChange={e => setJob({ ...job, location: e.target.value })} placeholder="Location" />
            <input value={job.applyLink} onChange={e => setJob({ ...job, applyLink: e.target.value })} placeholder="Apply link / email" />
            <textarea value={job.description} onChange={e => setJob({ ...job, description: e.target.value })} placeholder="Description" />
            <select value={job.expiryDays} onChange={e => setJob({ ...job, expiryDays: e.target.value })}>
              <option value="3">Show for 3 days</option>
              <option value="7">Show for 7 days</option>
              <option value="15">Show for 15 days</option>
              <option value="30">Show for 30 days</option>
              <option value="60">Show for 60 days</option>
            </select>
            <button><PlusCircle size={16} /> Post Job</button>
          </form>
        )}

        {data.jobs.filter(isActiveUntil).length === 0 && <p>No active jobs posted yet.</p>}
        {data.jobs.filter(isActiveUntil).sort(sortNewestFirst).map(j => (
          <div className="jobCard" key={j.id}>
            <h3>{j.title}</h3>
            <p><b>{j.company}</b> • {j.location}</p>
            <p>{j.description}</p>
            {j.applyLink && <a href={j.applyLink} target="_blank" rel="noreferrer">Apply / Contact</a>}
            <small>Posted by {j.postedBy} • Visible until {formatExpiry(j.expiresAt)}</small>
          </div>
        ))}
      </section>
    );
  }

  function SettingsPage() {
    return (
      <section className="card">
        <Back go={setPage} />
        <h2><Settings size={18} /> Settings</h2>
        <div className="settingsBlock">
          <h3>Account Preference</h3>
          <p>Manage profile and role correction.</p>
          <button onClick={() => setPage("roleChange")}>Change Student / Alumni Role</button>
        </div>
        <div className="settingsBlock">
          <h3>Dark Mode</h3>
          <button onClick={() => setDark(!dark)}>{dark ? "Light Mode" : "Dark Mode"}</button>
        </div>
        <div className="settingsBlock">
          <h3>Push Notification</h3>
          <p>Free notification foundation added. This enables phone/browser permission and shows new-message alerts while the app is open.</p>
          <button onClick={async () => {
            const ok = await enableLocalNotifications();
            alert(ok ? "Notification enabled" : "Notification permission not enabled");
          }}>Enable Notification</button>
          <p><small>For background push when app is closed, connect Firebase Cloud Messaging with a VAPID key / Cloud Function later.</small></p>
        </div>
        <div className="settingsBlock">
          <h3>Message Privacy</h3>
          <p>Anyone can message anyone. Messages are encrypted before storing in {isLocalMode ? "this browser" : "Firebase"}.</p>
        </div>
        <div className="settingsBlock dangerZone">
          <h3>Delete Profile</h3>
          <p>Your profile will never be deleted automatically. Use this only if you personally want to remove your StayTogether profile from the app.</p>
          <button className="dangerBtn" onClick={deleteMyProfile}>
            <Trash2 size={16} /> Delete My Profile
          </button>
          <p><small>{isLocalMode ? "This removes app profile data from this browser. Local demo credentials remain available." : "This removes app profile data. Firebase Auth account deletion needs admin support later."}</small></p>
        </div>
        <div className="settingsBlock aboutTeam">
          <h3>About StayTogether</h3>
          <p><b>Ruban D</b> — Developer</p>
          <p><b>Gowtham N</b> — Storage Manager</p>
          <p>StayTogether is a professional network for profile, connections, jobs and career conversations.</p>
        </div>
        <button onClick={() => setPage("help")}>Help Center</button>
      </section>
    );
  }

  function HelpCenter() {
    return (
      <section className="card">
        <Back go={setPage} />
        <h2>Help Center</h2>
        <p>StayTogether works like: Profile + Connections + Feed + Jobs + Encrypted Messaging.</p>
        <div className="helpItem"><h3>Profile</h3><p>Create your online resume with photo, headline, education, skills and bio.</p></div>
        <div className="helpItem"><h3>Connections</h3><p>Connect with classmates, teachers, alumni and professionals.</p></div>
        <div className="helpItem"><h3>Messages</h3><p>Anyone can message anyone. Students can ask alumni about internships, jobs and career guidance.</p></div>
        <div className="helpItem"><h3>Jobs</h3><p>Alumni and staff can post opportunities. Students can view and apply.</p></div>
      </section>
    );
  }

  function ChatBot() {
    const [messages, setMessages] = useState([{ from: "bot", text: "Hi! Ask about profile, connections, internships, jobs, messages, privacy or career." }]);
    const [input, setInput] = useState("");

    function reply(q) {
      const text = q.toLowerCase();
      let answer = "I can help with StayTogether features.";
      if (text.includes("intern")) answer = "Open Messages → Alumni → choose an alumni → ask about internship openings, skills needed and referral process.";
      else if (text.includes("job")) answer = "Open Jobs to view opportunities. Alumni and staff can post jobs/internships.";
      else if (text.includes("message")) answer = "Anyone can message anyone. Messages are encrypted before saving.";
      else if (text.includes("connect")) answer = "Open People Directory → Connect. Accepted requests show in My Network and profile.";
      else if (text.includes("profile")) answer = "Use My Profile to update photo, headline, DOB, skills, bio and experience.";
      else if (text.includes("role")) answer = "Go to Settings → Change Student / Alumni Role.";
      setMessages(old => [...old, { from: "user", text: q }, { from: "bot", text: answer }]);
      setInput("");
    }

    return (
      <section className="card">
        <Back go={setPage} />
        <h2><Bot /> StayBot</h2>
        <div className="botArea">
          {messages.map((m, i) => <div key={i} className={`bubble ${m.from}`}>{m.text}</div>)}
        </div>
        <div className="chatInput">
          <input value={input} onChange={e => setInput(e.target.value)} placeholder="Ask StayBot..." />
          <button onClick={() => input.trim() && reply(input)}><Send size={16} /></button>
        </div>
      </section>
    );
  }

  function BottomNav() {
    if (!user) return null;
    return (
      <nav className="bottomNav">
        <button className={page === "home" ? "active" : ""} aria-current={page === "home" ? "page" : undefined} onClick={() => setPage("home")}><Home size={20} /><span>Home</span></button>
        <button className={page === "profile" ? "active" : ""} aria-current={page === "profile" ? "page" : undefined} onClick={() => setPage("profile")}><UserRound size={20} /><span>Profile</span></button>
        <button className={page === "network" ? "active" : ""} aria-current={page === "network" ? "page" : undefined} onClick={() => setPage("network")}><Network size={20} /><span>Friends</span></button>
        <button className={page === "createPost" ? "active" : ""} aria-current={page === "createPost" ? "page" : undefined} onClick={() => setPage("createPost")}><PlusCircle size={20} /><span>Post</span></button>
        <button className={page === "notifications" ? "active" : ""} aria-current={page === "notifications" ? "page" : undefined} onClick={() => setPage("notifications")}><Bell size={20} /><span>Alerts</span></button>
        <button className={page === "jobs" ? "active" : ""} aria-current={page === "jobs" ? "page" : undefined} onClick={() => setPage("jobs")}><Briefcase size={20} /><span>Jobs</span></button>
      </nav>
    );
  }

  function render() {
    if (!user && page === "register") return <Register />;
    if (!user) return <Login />;

    const pages = {
      home: <HomeDashboard />,
      profile: <ProfilePage />,
      roleChange: <RoleChangePage />,
      directory: <DirectoryPage />,
      viewProfile: <ViewProfilePage />,
      network: <NetworkPage />,
      visitors: <VisitorsPage />,
      messages: <MessagesDashboard />,
      personalChat: <PersonalChat />,
      notifications: <NotificationsPage />,
      createPost: <CreatePost />,
      feed: <FeedPage />,
      careerHub: <CareerHub />,
      jobs: <JobBoard />,
      settings: <SettingsPage />,
      help: <HelpCenter />,
      bot: <ChatBot />
    };

    return pages[page] || <HomeDashboard />;
  }

  return (
    <div className="appShell">
      <Header />
      <main>{render()}</main>
      <BottomNav />
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
