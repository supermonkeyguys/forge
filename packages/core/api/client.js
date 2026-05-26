/**
 * HTTP client — the ONLY place in packages/core that calls fetch.
 * All other files must go through this module.
 */
const BASE_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL)
    || '';
export class ApiError extends Error {
    status;
    code;
    field;
    constructor(status, code, message, field) {
        super(message);
        this.status = status;
        this.code = code;
        this.field = field;
        this.name = 'ApiError';
    }
}
async function request(path, options = {}) {
    const { token, ...fetchOptions } = options;
    const headers = {
        'Content-Type': 'application/json',
        ...fetchOptions.headers,
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${BASE_URL}${path}`, { ...fetchOptions, headers });
    if (!res.ok) {
        const body = await res.json().catch(() => ({
            error: { code: 'UNKNOWN', message: res.statusText },
        }));
        throw new ApiError(res.status, body.error.code, body.error.message, body.error.field);
    }
    return res.json();
}
export const api = {
    get(path, token) {
        return request(path, { method: 'GET', token });
    },
    getList(path, token) {
        return request(path, { method: 'GET', token });
    },
    post(path, body, token) {
        return request(path, {
            method: 'POST',
            body: JSON.stringify(body),
            token,
        });
    },
    put(path, body, token) {
        return request(path, {
            method: 'PUT',
            body: JSON.stringify(body),
            token,
        });
    },
    delete(path, token) {
        return request(path, { method: 'DELETE', token });
    },
};
