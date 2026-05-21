import React, { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { getCurrentUser } from "./api/client";
import { User } from "./types";
import Login from "./components/Login";
import IUDashboard from "./components/Dashboard/IUDashboard";
import CoordinatorDashboard from "./components/Dashboard/CoordinatorDashboard";
import AdminDashboard from "./components/Dashboard/AdminDashboard";
import FinanceDashboard from "./components/Dashboard/FinanceDashboard";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCurrentUser()
      .then(r => setUser(r.data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={styles.loading}>Loading…</div>;

  const DashboardForRole = () => {
    if (!user) return <Navigate to="/login" />;
    switch (user.role) {
      case "iu":          return <IUDashboard user={user} onLogout={() => setUser(null)} />;
      case "coordinator": return <CoordinatorDashboard user={user} onLogout={() => setUser(null)} />;
      case "admin":       return <AdminDashboard user={user} onLogout={() => setUser(null)} />;
      case "finance":     return <FinanceDashboard user={user} onLogout={() => setUser(null)} />;
      default:            return <Navigate to="/login" />;
    }
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={
          user ? <Navigate to="/" /> : <Login onLogin={setUser} />
        } />
        <Route path="/*" element={<DashboardForRole />} />
      </Routes>
    </BrowserRouter>
  );
}

const styles: Record<string, React.CSSProperties> = {
  loading: { display: "flex", alignItems: "center", justifyContent: "center",
             height: "100vh", fontSize: 18, color: "#4a5568" },
};
