export interface ActionResponse<T> {
    success: boolean
    data?: T
    error?: string
    code?: string
}

export async function callTabletopAction<TData>(
    actionName: string,
    params: Record<string, unknown>,
    token: string,
): Promise<ActionResponse<TData>> {
    const res = await fetch(`/api/actions/${encodeURIComponent(actionName)}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(params),
    })

    const payload = (await res.json()) as ActionResponse<TData>
    if (!res.ok && payload.success !== false) {
        return { success: false, error: payload.error ?? `Request failed (${res.status})` }
    }
    return payload
}