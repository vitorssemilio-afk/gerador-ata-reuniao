import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { AtaDetalhe } from './pages/AtaDetalhe';
import { Atas } from './pages/Atas';
import { ConectarGoogleCallback } from './pages/ConectarGoogleCallback';
import { Integracoes } from './pages/Integracoes';
import { Login } from './pages/Login';
import { NovaAta } from './pages/NovaAta';
import { ReunioesDetectadas } from './pages/ReunioesDetectadas';

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Atas />} />
              <Route path="/nova" element={<NovaAta />} />
              <Route path="/integracoes" element={<Integracoes />} />
              <Route path="/reunioes-detectadas" element={<ReunioesDetectadas />} />
              <Route path="/conectar-google/callback" element={<ConectarGoogleCallback />} />
              <Route path="/:id" element={<AtaDetalhe />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
