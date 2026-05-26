import { jsx as _jsx } from "react/jsx-runtime";
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from './routes.js';
import './styles/global.css';
const queryClient = new QueryClient({
    defaultOptions: {
        queries: { retry: 1, staleTime: 30_000 },
        mutations: { retry: 0 },
    },
});
const root = document.getElementById('root');
createRoot(root).render(_jsx(StrictMode, { children: _jsx(QueryClientProvider, { client: queryClient, children: _jsx(BrowserRouter, { children: _jsx(AppRoutes, {}) }) }) }));
