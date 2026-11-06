import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/context/AuthContext';
import { SettingsProvider } from '@/context/SettingsContext';
import { SyncProvider } from '@/context/SyncContext';
import App from '@/app/App';
import '@/index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 15000,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SettingsProvider>
          <SyncProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
            <Toaster position="top-right" richColors closeButton />
          </SyncProvider>
        </SettingsProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
