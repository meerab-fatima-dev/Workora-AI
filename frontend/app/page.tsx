"use client";
import { useState, useEffect, useRef, type ReactNode } from "react";

type User = { id: number; email: string; name: string | null; picture: string | null };
type Task = { id: number; title: string; priority: string; status: string; due_date: string | null };
type Project = { id: number; name: string; status: string };
type EventItem = { id: number; title: string; event_time: string | null };
type Approval = {
  id: number;
  action_type: string;
  recipient: string | null;
  subject: string | null;
  body: string | null;
  status: string;
};

const API = "http://127.0.0.1:8000";
const TOKEN_KEY = "workora_token";

const IconBolt = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
    <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" fill="currentColor" />
  </svg>
);
const IconChat = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
    <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconCheck = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 12.5l2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconFolder = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
    <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconCalendar = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M16 3v4M8 3v4M3 10h18" strokeLinecap="round" />
  </svg>
);
const IconInbox = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
    <path d="M4 12h4l2 3h4l2-3h4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 12l1.5-6.5A2 2 0 017.45 4h9.1a2 2 0 011.95 1.5L20 12v6a2 2 0 01-2 2H6a2 2 0 01-2-2v-6z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconMic = ({ active }: { active?: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
    <rect x="9" y="2" width="6" height="12" rx="3" fill={active ? "currentColor" : "none"} />
    <path d="M5 10a7 7 0 0014 0M12 19v3M9 22h6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconGoogle = () => (
  <svg viewBox="0 0 48 48" className="w-5 h-5">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

const Avatar = ({ user, size = 36 }: { user: User; size?: number }) => {
  const initial = (user.name || user.email || "?").charAt(0).toUpperCase();
  if (user.picture) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.picture}
        alt=""
        referrerPolicy="no-referrer"
        style={{ width: size, height: size }}
        className="rounded-full shrink-0 border border-white/20"
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-full shrink-0 bg-gradient-to-br from-cyan-400 via-violet-500 to-fuchsia-500 flex items-center justify-center text-sm font-semibold text-white"
    >
      {initial}
    </div>
  );
};

// Turns plain-text links (like spreadsheet downloads) into clickable links
const renderText = (text: string) => {
  const parts = text.split(/(https?:\/\/[^\s)]+[^\s.,;:!?)])/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <a key={i} href={part} target="_blank" rel="noreferrer" className="underline text-cyan-200 hover:text-white break-all">
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    )
  );
};

type Section = "chat" | "tasks" | "projects" | "events" | "approvals";

export default function Home() {
  // ----- auth state -----
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // ----- app state -----
  const [activeSection, setActiveSection] = useState<Section>("chat");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLog, setChatLog] = useState<{ role: string; text: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [notifPerm, setNotifPerm] = useState<string>("unsupported");
  const recognitionRef = useRef<any>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const notified = useRef<Set<string>>(new Set());

  // ----- helpers -----
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 6000);
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    setMenuOpen(false);
    setChatLog([]);
    setTasks([]);
    setProjects([]);
    setEvents([]);
    setApprovals([]);
    setActiveSection("chat");
  };

  // Every call to the backend goes through here so the login token is always attached
  const api = async (path: string, options: RequestInit = {}) => {
    const res = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        ...((options.headers as Record<string, string>) || {}),
        Authorization: `Bearer ${token}`,
      },
    });
    if (res.status === 401) logout();
    return res;
  };

  const loadList = async (path: string, setter: (v: any[]) => void) => {
    try {
      const res = await api(path);
      const data = await res.json();
      setter(Array.isArray(data) ? data : []);
    } catch {
      /* ignore network errors */
    }
  };

  const fetchTasks = () => loadList("/tasks", setTasks);
  const fetchProjects = () => loadList("/projects", setProjects);
  const fetchEvents = () => loadList("/events", setEvents);
  const fetchApprovals = () => loadList("/approvals", setApprovals);
  const fetchAll = () => {
    fetchTasks();
    fetchProjects();
    fetchEvents();
    fetchApprovals();
  };

  // ----- on first load: pick up the login token from the URL, then verify it -----
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("token");
    if (params.get("auth_error")) setAuthError(true);
    if (urlToken) localStorage.setItem(TOKEN_KEY, urlToken);
    if (urlToken || params.get("auth_error")) {
      window.history.replaceState({}, "", window.location.pathname);
    }

    const saved = localStorage.getItem(TOKEN_KEY);
    if (!saved) {
      setAuthChecked(true);
      return;
    }
    fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${saved}` } })
      .then(async (r) => {
        if (!r.ok) throw new Error("bad token");
        const u = await r.json();
        setToken(saved);
        setUser(u);
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
      })
      .finally(() => setAuthChecked(true));
  }, []);

  // ----- once logged in, load the user's data -----
  useEffect(() => {
    if (user && token) fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, token]);

  // ----- voice input -----
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event: any) => {
      setChatInput(event.results[0][0].transcript);
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
  }, []);

  // ----- notification permission status -----
  useEffect(() => {
    if ("Notification" in window) setNotifPerm(Notification.permission);
  }, []);

  // ----- auto-scroll chat to the newest message -----
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatLog, loading, activeSection]);

  // ----- in-browser reminders (works while this tab is open) -----
  useEffect(() => {
    if (!user || notifPerm !== "granted") return;
    const check = () => {
      const now = new Date();
      tasks.forEach((t) => {
        if (!t.due_date || t.status === "done" || t.status === "completed") return;
        const due = new Date(t.due_date);
        const key = `task-${t.id}-${due.toDateString()}`;
        if (due.toDateString() === now.toDateString() && !notified.current.has(key)) {
          notified.current.add(key);
          new Notification("Task due today", { body: t.title });
        }
      });
      events.forEach((e) => {
        if (!e.event_time) return;
        const diff = new Date(e.event_time).getTime() - now.getTime();
        const key = `event-${e.id}`;
        if (diff > 0 && diff <= 15 * 60 * 1000 && !notified.current.has(key)) {
          notified.current.add(key);
          new Notification("Event starting soon", { body: e.title });
        }
      });
    };
    check();
    const id = setInterval(check, 60000);
    return () => clearInterval(id);
  }, [user, tasks, events, notifPerm]);

  const enableReminders = async () => {
    if (!("Notification" in window)) return;
    const perm = await Notification.requestPermission();
    setNotifPerm(perm);
    setMenuOpen(false);
  };

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert("Voice input isn't supported in this browser. Try Chrome.");
      return;
    }
    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
    } else {
      recognitionRef.current.start();
      setListening(true);
    }
  };

  const sendMessage = async () => {
    const userMsg = chatInput.trim();
    if (!userMsg || loading) return;
    const historyForApi = chatLog.map((m) => ({
      role: m.role === "agent" ? "assistant" : "user",
      content: m.text,
    }));
    setChatLog((prev) => [...prev, { role: "user", text: userMsg }]);
    setChatInput("");
    setLoading(true);
    try {
      const res = await api("/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg, history: historyForApi }),
      });
      const data = await res.json();
      const reply =
        typeof data.response === "string" ? data.response : "Sorry, something went wrong. Please try again.";
      setChatLog((prev) => [...prev, { role: "agent", text: reply }]);
    } catch {
      setChatLog((prev) => [
        ...prev,
        { role: "agent", text: "Sorry, I could not reach the server. Please try again." },
      ]);
    }
    setLoading(false);
    fetchAll();
  };

  const deleteTask = async (id: number) => {
    await api(`/tasks/${id}`, { method: "DELETE" });
    fetchTasks();
  };
  const deleteProject = async (id: number) => {
    await api(`/projects/${id}`, { method: "DELETE" });
    fetchProjects();
  };
  const deleteEvent = async (id: number) => {
    await api(`/events/${id}`, { method: "DELETE" });
    fetchEvents();
  };
  const approveRequest = async (id: number) => {
    try {
      const res = await api(`/approvals/${id}/approve`, { method: "POST" });
      const data = await res.json();
      if (data.error) showToast(data.error);
      else if (data.email_sent) showToast("Email sent from your Gmail ✓");
      else if (data.email_error) showToast("Approved, but the email failed: " + String(data.email_error).slice(0, 160));
      else showToast("Approved");
    } catch {
      showToast("Could not reach the server.");
    }
    fetchApprovals();
  };
  const rejectRequest = async (id: number) => {
    await api(`/approvals/${id}/reject`, { method: "POST" });
    fetchApprovals();
  };

  // ----- styling helpers -----
  const priorityColor = (p: string) =>
    p === "high"
      ? "bg-amber-400/20 text-amber-300 border border-amber-400/30"
      : p === "low"
        ? "bg-slate-500/20 text-slate-300 border border-slate-500/30"
        : "bg-cyan-500/20 text-cyan-200 border border-cyan-400/30";

  const approvalColor = (s: string) =>
    s === "approved"
      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
      : s === "rejected"
        ? "bg-red-500/20 text-red-300 border border-red-500/30"
        : "bg-violet-500/20 text-violet-200 border border-violet-400/30";

  const formatEventTime = (t: string | null) => {
    if (!t) return "No time set";
    const d = new Date(t);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const formatDueDate = (t: string | null) => {
    if (!t) return null;
    const d = new Date(t);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const cardClass =
    "rounded-2xl bg-white/[0.05] border border-white/10 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] p-6";
  const gradientText = "bg-gradient-to-r from-cyan-200 via-violet-200 to-pink-200 bg-clip-text text-transparent";
  const gradientBg = "bg-gradient-to-r from-cyan-400 via-violet-500 to-fuchsia-500";

  const navItems: { id: Section; label: string; icon: ReactNode; count: number }[] = [
    { id: "chat", label: "Chat", icon: <IconChat />, count: 0 },
    { id: "tasks", label: "Tasks", icon: <IconCheck />, count: tasks.length },
    { id: "projects", label: "Projects", icon: <IconFolder />, count: projects.length },
    { id: "events", label: "Events", icon: <IconCalendar />, count: events.length },
    { id: "approvals", label: "Approvals", icon: <IconInbox />, count: approvals.filter((a) => a.status === "pending").length },
  ];

  // ================= SCREEN 1: checking login =================
  if (!authChecked) {
    return (
      <main className="min-h-screen bg-[#050914] flex items-center justify-center">
        <div className={`w-14 h-14 rounded-2xl ${gradientBg} flex items-center justify-center text-white animate-pulse`}>
          <IconBolt />
        </div>
      </main>
    );
  }

  // ================= SCREEN 2: login / landing =================
  if (!user) {
    return (
      <main className="min-h-screen relative overflow-hidden bg-gradient-to-b from-[#050914] via-[#080b1f] to-[#030510] text-white flex items-center justify-center px-6">
        <div className="absolute top-[-15%] left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-cyan-500/15 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-15%] right-[8%] w-96 h-96 bg-fuchsia-500/15 rounded-full blur-[110px]" />
        <div className="absolute bottom-[-10%] left-[5%] w-72 h-72 bg-violet-600/20 rounded-full blur-[100px]" />

        <div className="relative z-10 text-center max-w-lg">
          <div className={`w-20 h-20 mx-auto rounded-3xl ${gradientBg} flex items-center justify-center shadow-[0_0_40px_rgba(139,92,246,0.45)] mb-6 text-white`}>
            <div className="scale-[2]"><IconBolt /></div>
          </div>
          <h1 className={`text-4xl font-bold ${gradientText} mb-2`}>Workora AI</h1>
          <p className="text-slate-400 mb-8">Your AI-powered digital work assistant</p>

          <div className="space-y-3 text-left mb-10">
            {[
              { icon: <IconChat />, text: "Talk naturally, get real work done", color: "text-cyan-300" },
              { icon: <IconCheck />, text: "Tasks, Projects & Calendar, unified", color: "text-violet-300" },
              { icon: <IconInbox />, text: "Human approval before anything is sent", color: "text-pink-300" },
            ].map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-3 bg-white/[0.05] border border-white/10 backdrop-blur-xl rounded-xl px-4 py-3 text-sm text-slate-200 shadow-[0_4px_20px_rgba(0,0,0,0.3)]"
              >
                <span className={item.color}>{item.icon}</span>
                {item.text}
              </div>
            ))}
          </div>

          {authError && (
            <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2 mb-4">
              Sign-in did not complete. Please try again.
            </p>
          )}

          <button
            onClick={() => {
              window.location.href = `${API}/auth/google/login`;
            }}
            className="relative overflow-hidden inline-flex items-center gap-3 bg-white text-slate-800 px-8 py-3.5 rounded-xl font-semibold shadow-[0_0_30px_rgba(139,92,246,0.35)] hover:shadow-[0_0_45px_rgba(34,211,238,0.5)] transition-shadow"
          >
            <span className="relative z-10 flex items-center gap-3">
              <IconGoogle />
              Sign in with Google
            </span>
            <span className="absolute inset-0 shimmer" />
          </button>
          <p className="text-xs text-slate-500 mt-4">
            Gmail access is used only to send emails that you approve.
          </p>
        </div>

        <style jsx>{`
          .shimmer::before {
            content: "";
            position: absolute;
            top: 0;
            left: -75%;
            width: 50%;
            height: 100%;
            background: linear-gradient(120deg, transparent, rgba(139,92,246,0.25), transparent);
            transform: skewX(-20deg);
            animation: shimmerMove 2.5s infinite;
          }
          @keyframes shimmerMove {
            0% { left: -75%; }
            100% { left: 125%; }
          }
        `}</style>
      </main>
    );
  }

  // ================= SCREEN 3: dashboard =================
  const firstName = (user.name || user.email).split(" ")[0];

  return (
    <main className="h-screen flex bg-[#050914] text-white overflow-hidden">
      {/* ---------- Sidebar ---------- */}
      <aside className="w-64 shrink-0 bg-[#070c1a] border-r border-white/10 flex flex-col">
        <div className="flex items-center gap-2 px-5 py-5 border-b border-white/10">
          <div className={`w-8 h-8 rounded-lg ${gradientBg} flex items-center justify-center text-white shrink-0`}>
            <IconBolt />
          </div>
          <span className={`font-semibold ${gradientText}`}>Workora AI</span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition ${activeSection === item.id
                ? "bg-gradient-to-r from-cyan-500/20 via-violet-500/15 to-fuchsia-500/20 text-white border border-white/15"
                : "text-slate-400 hover:bg-white/5 hover:text-slate-200 border border-transparent"
                }`}
            >
              <span className="flex items-center gap-2.5">
                <span className={activeSection === item.id ? "text-cyan-300" : ""}>{item.icon}</span>
                {item.label}
              </span>
              {item.count > 0 && (
                <span className="text-xs bg-white/10 text-slate-300 px-1.5 py-0.5 rounded-full">
                  {item.count}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Account area */}
        <div className="relative border-t border-white/10 p-3">
          {menuOpen && (
            <div className="absolute bottom-full left-3 right-3 mb-2 rounded-xl bg-[#0b1226] border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.6)] p-1.5">
              {notifPerm === "default" && (
                <button
                  onClick={enableReminders}
                  className="w-full text-left text-sm text-slate-200 hover:bg-white/5 rounded-lg px-3 py-2"
                >
                  Enable reminders
                </button>
              )}
              {notifPerm === "granted" && (
                <p className="px-3 py-2 text-xs text-slate-500">Reminders are on</p>
              )}
              {notifPerm === "denied" && (
                <p className="px-3 py-2 text-xs text-slate-500">Reminders are blocked in your browser</p>
              )}
              <button
                onClick={logout}
                className="w-full text-left text-sm text-pink-300 hover:bg-white/5 rounded-lg px-3 py-2"
              >
                Log out
              </button>
            </div>
          )}
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="w-full flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/5 transition text-left"
          >
            <Avatar user={user} />
            <div className="min-w-0">
              <p className="text-sm text-slate-100 truncate">{user.name || user.email}</p>
              <p className="text-xs text-slate-500 truncate">{user.email}</p>
            </div>
          </button>
        </div>
      </aside>

      {/* ---------- Main panel ---------- */}
      <div className="flex-1 min-w-0 h-screen flex flex-col">
        {activeSection === "chat" ? (
          <div className="flex-1 min-h-0 flex flex-col">
            {/* Messages scroll here */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="max-w-3xl mx-auto px-6 py-8 space-y-3">
                {chatLog.length === 0 && (
                  <div className="text-center py-24">
                    <div className="flex justify-center mb-4">
                      <Avatar user={user} size={56} />
                    </div>
                    <h2 className={`text-2xl font-semibold ${gradientText} mb-2`}>Welcome, {firstName}</h2>
                    <p className="text-slate-500 text-sm italic">
                      Try: &quot;Create a high priority task to finish my report&quot;
                    </p>
                  </div>
                )}
                {chatLog.map((msg, i) => (
                  <div key={i} className={msg.role === "user" ? "text-right" : "text-left"}>
                    <span
                      className={
                        msg.role === "user"
                          ? `inline-block ${gradientBg} text-white px-4 py-2 rounded-2xl rounded-br-sm max-w-[80%] text-left whitespace-pre-wrap shadow-[0_4px_20px_rgba(139,92,246,0.3)]`
                          : "inline-block bg-white/[0.07] backdrop-blur-xl text-slate-200 px-4 py-2 rounded-2xl rounded-bl-sm max-w-[80%] whitespace-pre-wrap border border-white/10"
                      }
                    >
                      {renderText(msg.text)}
                    </span>
                  </div>
                ))}
                {loading && (
                  <div className="flex items-center gap-1 text-slate-500 text-sm">
                    <span className="animate-pulse">●</span>
                    <span className="animate-pulse delay-150">●</span>
                    <span className="animate-pulse delay-300">●</span>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            </div>

            {/* Input pinned to the bottom */}
            <div className="shrink-0 border-t border-white/10 bg-[#050914]/90 backdrop-blur-xl px-6 py-4">
              <div className="max-w-3xl mx-auto flex gap-2">
                <input
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 flex-1 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                  placeholder={listening ? "Listening..." : "Type a message..."}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                />
                <button
                  className={`px-4 py-2.5 rounded-xl font-medium transition border flex items-center justify-center ${listening
                    ? "bg-fuchsia-500 border-fuchsia-400 animate-pulse text-white"
                    : "bg-white/5 border-white/10 hover:bg-white/10 text-slate-300"
                    }`}
                  onClick={toggleListening}
                  title="Voice input"
                >
                  <IconMic active={listening} />
                </button>
                <button
                  className={`${gradientBg} hover:opacity-90 text-white px-6 py-2.5 rounded-xl font-semibold transition shadow-[0_4px_20px_rgba(139,92,246,0.35)]`}
                  onClick={sendMessage}
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-8 py-8">
              {activeSection === "tasks" && (
                <div className={cardClass}>
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2 text-cyan-300">
                      <IconCheck />
                      <h2 className="font-semibold text-slate-100">Tasks</h2>
                    </div>
                    <span className="text-xs bg-white/10 text-slate-400 px-2 py-1 rounded-full border border-white/10">
                      {tasks.length}
                    </span>
                  </div>
                  <ul className="space-y-2">
                    {tasks.length === 0 && <p className="text-slate-500 text-sm">No tasks yet.</p>}
                    {tasks.map((task) => (
                      <li
                        key={task.id}
                        className="flex justify-between items-start bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/[0.08] transition"
                      >
                        <div>
                          <p className="font-medium text-slate-100">{task.title}</p>
                          <div className="flex gap-1.5 mt-2 items-center flex-wrap">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${priorityColor(task.priority)}`}>
                              {task.priority}
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-200 border border-violet-400/30">
                              {task.status}
                            </span>
                            {formatDueDate(task.due_date) && (
                              <span className="text-xs text-slate-400">
                                📅 {formatDueDate(task.due_date)}
                              </span>
                            )}
                          </div>
                        </div>
                        <button className="text-slate-600 hover:text-pink-400 text-sm" onClick={() => deleteTask(task.id)}>
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {activeSection === "projects" && (
                <div className={cardClass}>
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2 text-violet-300">
                      <IconFolder />
                      <h2 className="font-semibold text-slate-100">Projects</h2>
                    </div>
                    <span className="text-xs bg-white/10 text-slate-400 px-2 py-1 rounded-full border border-white/10">
                      {projects.length}
                    </span>
                  </div>
                  <ul className="space-y-2">
                    {projects.length === 0 && <p className="text-slate-500 text-sm">No projects yet.</p>}
                    {projects.map((project) => (
                      <li
                        key={project.id}
                        className="flex justify-between items-start bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/[0.08] transition"
                      >
                        <div>
                          <p className="font-medium text-slate-100">{project.name}</p>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-200 border border-violet-400/30 inline-block mt-2">
                            {project.status}
                          </span>
                        </div>
                        <button
                          className="text-slate-600 hover:text-pink-400 text-sm"
                          onClick={() => deleteProject(project.id)}
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {activeSection === "events" && (
                <div className={cardClass}>
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2 text-fuchsia-300">
                      <IconCalendar />
                      <h2 className="font-semibold text-slate-100">Events</h2>
                    </div>
                    <span className="text-xs bg-white/10 text-slate-400 px-2 py-1 rounded-full border border-white/10">
                      {events.length}
                    </span>
                  </div>
                  <ul className="space-y-2">
                    {events.length === 0 && <p className="text-slate-500 text-sm">No events yet.</p>}
                    {events.map((event) => (
                      <li
                        key={event.id}
                        className="flex justify-between items-start bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/[0.08] transition"
                      >
                        <div>
                          <p className="font-medium text-slate-100">{event.title}</p>
                          <span className="text-xs text-slate-400 mt-1 block">
                            {formatEventTime(event.event_time)}
                          </span>
                        </div>
                        <button className="text-slate-600 hover:text-pink-400 text-sm" onClick={() => deleteEvent(event.id)}>
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {activeSection === "approvals" && (
                <div className={cardClass}>
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2 text-pink-300">
                      <IconInbox />
                      <h2 className="font-semibold text-slate-100">Approvals</h2>
                    </div>
                    <span className="text-xs bg-white/10 text-slate-400 px-2 py-1 rounded-full border border-white/10">
                      {approvals.filter((a) => a.status === "pending").length}
                    </span>
                  </div>
                  <ul className="space-y-2">
                    {approvals.length === 0 && (
                      <p className="text-slate-500 text-sm">No approval requests yet.</p>
                    )}
                    {approvals.map((a) => (
                      <li
                        key={a.id}
                        className="bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/[0.08] transition"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium text-slate-100">{a.subject || "(no subject)"}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{a.recipient}</p>
                            {a.body && (
                              <p className="text-xs text-slate-500 mt-1.5">
                                {a.body.length > 100 ? a.body.slice(0, 100) + "..." : a.body}
                              </p>
                            )}
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${approvalColor(a.status)} shrink-0 ml-2`}>
                            {a.status}
                          </span>
                        </div>
                        {a.status === "pending" && (
                          <div className="flex gap-3 mt-3">
                            <button
                              className="text-emerald-400 hover:text-emerald-300 text-xs font-medium"
                              onClick={() => approveRequest(a.id)}
                            >
                              Approve
                            </button>
                            <button
                              className="text-red-400 hover:text-red-300 text-xs font-medium"
                              onClick={() => rejectRequest(a.id)}
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ---------- Toast ---------- */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm rounded-xl bg-[#0b1226] border border-white/15 shadow-[0_8px_32px_rgba(0,0,0,0.6)] px-4 py-3 text-sm text-slate-100">
          {toast}
        </div>
      )}
    </main>
  );
}