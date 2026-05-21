import React, { useState } from "react";
import { login } from "../api/client";
import { User } from "../types";

interface Props { onLogin: (user: User) => void; }

export default function Login({ onLogin }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await login(username, password);
      onLogin(res.data.user);
    } catch {
      setError("Invalid username or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.page}>
      <div style={s.card}>
        <h1 style={s.title}>Regreports PIMS</h1>
        <p style={s.sub}>Pretreatment Information Management System</p>
        <form onSubmit={handleSubmit}>
          <label style={s.label}>Username</label>
          <input style={s.input} value={username}
            onChange={e => setUsername(e.target.value)} autoFocus required />
          <label style={s.label}>Password</label>
          <input style={s.input} type="password" value={password}
            onChange={e => setPassword(e.target.value)} required />
          {error && <p style={s.error}>{error}</p>}
          <button style={s.btn} type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page:  { display:"flex", alignItems:"center", justifyContent:"center", minHeight:"100vh", background:"#ebf8ff" },
  card:  { background:"#fff", borderRadius:10, padding:"40px 48px", width:380, boxShadow:"0 4px 24px rgba(0,0,0,0.10)" },
  title: { color:"#1a365d", fontSize:28, fontWeight:700, marginBottom:4 },
  sub:   { color:"#4a5568", fontSize:14, marginBottom:28 },
  label: { display:"block", fontSize:13, fontWeight:600, color:"#2d3748", marginBottom:4 },
  input: { display:"block", width:"100%", padding:"8px 10px", marginBottom:16,
           border:"1px solid #cbd5e0", borderRadius:5, fontSize:14 },
  btn:   { width:"100%", padding:"10px 0", background:"#2b6cb0", color:"#fff",
           border:"none", borderRadius:5, fontSize:15, fontWeight:600, cursor:"pointer" },
  error: { color:"#c53030", fontSize:13, marginBottom:10 },
};
