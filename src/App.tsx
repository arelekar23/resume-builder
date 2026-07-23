import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import PublicOnlyRoute from "@/components/PublicOnlyRoute";
import Login from "./routes/Login";
import Editor from "./routes/Editor";
import Profile from "./routes/Profile";
import { useEffect } from "react";
import { track } from "@vercel/analytics/react";

function RouteTracker() {
  const location = useLocation();
  useEffect(() => {
    track("pageview", { url: location.pathname + location.search });
  }, [location]);

  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <RouteTracker />
        <Routes>
          <Route
            path="/login"
            element={
              <PublicOnlyRoute>
                <Login />
              </PublicOnlyRoute>
            }
          />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Editor />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
