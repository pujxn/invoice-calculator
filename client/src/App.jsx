import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext.jsx';
import RequireAuth from './auth/RequireAuth.jsx';
import LoginPage from './pages/LoginPage.jsx';
import HomePage from './pages/HomePage.jsx';
import RequireRole from './roles/RequireRole.jsx';
import MyListPage from './roles/MyListPage.jsx';
import AdminPage from './roles/AdminPage.jsx';
import AgentDetailPage from './roles/AgentDetailPage.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          {/* Every route nested here needs a signed-in user. */}
          <Route element={<RequireAuth />}>
            <Route path="/" element={<HomePage />} />
            <Route element={<RequireRole role="agent" />}>
              <Route path="/list" element={<MyListPage />} />
            </Route>
            <Route element={<RequireRole role="superadmin" />}>
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/admin/agents/:phone" element={<AgentDetailPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
