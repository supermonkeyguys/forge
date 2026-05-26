/**
 * useMe — 验证当前 token 并恢复用户信息。
 * 在应用启动时调用，刷新后自动恢复登录状态。
 */
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { api } from '../api/client.js';
import { parseWithFallback } from '../api/schema.js';
import { useAuthStore, selectToken } from './auth-store.js';
const UserSchema = z.object({
    data: z.object({
        id: z.string(),
        email: z.string(),
        name: z.string(),
        createdAt: z.string(),
    }),
});
export function useMe() {
    const token = useAuthStore(selectToken);
    return useQuery({
        queryKey: ['me', token],
        queryFn: async () => {
            const raw = await api.get('/api/v1/auth/me', token ?? undefined);
            const parsed = parseWithFallback(UserSchema, raw, {
                data: { id: '', email: '', name: '', createdAt: '' },
            });
            if (!parsed.data.id)
                return null;
            return parsed.data;
        },
        enabled: token !== null,
        staleTime: 5 * 60 * 1000,
        retry: false,
    });
}
