import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { api } from '../api/client.js';
import { parseWithFallback } from '../api/schema.js';
import { useAuthStore } from './auth-store.js';
const AuthTokenSchema = z.object({
    data: z.object({
        token: z.string(),
        user: z.object({
            id: z.string(),
            email: z.string(),
            name: z.string(),
            createdAt: z.string(),
        }),
    }),
});
export function useLogin() {
    const setToken = useAuthStore((s) => s.setToken);
    return useMutation({
        mutationFn: async (input) => {
            const raw = await api.post('/api/v1/auth/login', input);
            return parseWithFallback(AuthTokenSchema, raw, 
            // fallback will cause mutation to appear succeeded with empty data
            // but the missing token means UI will redirect to login again
            { data: { token: '', user: { id: '', email: '', name: '', createdAt: '' } } }).data;
        },
        onSuccess: (data) => {
            if (data.token) {
                setToken(data.token, data.user);
            }
        },
    });
}
