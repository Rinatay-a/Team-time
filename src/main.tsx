import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter, Route, Routes } from 'react-router-dom';
import './styles/index.css';
import { Layout } from './components/layout/Layout';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { CreateMeeting } from './pages/CreateMeeting';
import { ParticipantPage } from './pages/ParticipantPage';
import { ResultsPage } from './pages/ResultsPage';
import { NotFound } from './pages/NotFound';
import { demoRequested, hasSupabaseConfig } from './lib/config';

const app = !hasSupabaseConfig && !demoRequested ? (
  <div className="mx-auto max-w-xl px-4 py-20 text-center">
    <h1 className="text-3xl font-black">Приложение не настроено</h1>
    <p className="mt-4 text-slate-600">Добавьте VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY. Для локального просмотра демо явно задайте VITE_DEMO_MODE=true.</p>
  </div>
) : (
  <HashRouter>
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/admin" element={<Dashboard />} />
        <Route path="/admin/new" element={<CreateMeeting />} />
        <Route path="/admin/meet/:id" element={<ResultsPage />} />
        <Route path="/meet/:id" element={<ParticipantPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  </HashRouter>
);

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode>{app}</React.StrictMode>);
