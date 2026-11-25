import type { ActionResult, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker.js'

export interface ActionContext {
    userId: string
    params: Record<string, unknown>
    tools: ActionTools
    env: Env
    callerJwt: string
}

export interface RevealedRegion {
    id: string
    kind: 'rect' | 'circle' | 'polygon' | 'cell'
    points: Array<{ x: number; y: number }>
    revealedAt: string
}

export interface SceneEntity {
    id: string
    kind: 'token' | 'encounter' | 'note' | 'door'
    label: string
    gmNotes: string
    x: number
    y: number
    isRevealed: boolean
}

interface TableRecord {
    title?: string
    gmUserId?: string
    inviteCode?: string
    activeSceneId?: string
    status?: string
}

interface ScenePublicRecord {
    tableId?: string
    title?: string
    mapImageUrl?: string
    width?: number
    height?: number
    revealMode?: string
    revealedRegions?: string | RevealedRegion[]
    revealedEntities?: string | Array<Omit<SceneEntity, 'gmNotes' | 'isRevealed'>>
}

interface SceneGmRecord {
    tableId?: string
    publicSceneId?: string
    gmUserId?: string
    hiddenNotes?: string
    allEntities?: string | SceneEntity[]
}

function parseJsonArray<T>(raw: string | T[] | undefined): T[] {
    if (Array.isArray(raw)) return raw
    if (typeof raw !== 'string' || !raw) return []
    try {
        const parsed: unknown = JSON.parse(raw)
        return Array.isArray(parsed) ? (parsed as T[]) : []
    } catch {
        return []
    }
}

function projectPlayerEntities(
    entities: SceneEntity[],
): Array<Omit<SceneEntity, 'gmNotes' | 'isRevealed'>> {
    return entities
        .filter((entity) => entity.isRevealed)
        .map(({ gmNotes: _gmNotes, isRevealed: _isRevealed, ...publicEntity }) => publicEntity)
}

function generateInviteCode(): string {
    return Math.random().toString(36).slice(2, 8).toUpperCase()
}

export async function createTable(
    { userId, params, tools }: ActionContext,
): Promise<ActionResult<{ tableId: string; inviteCode: string; gmUserId: string; title: string }>> {
    if (!userId) return { success: false, error: 'Unauthorized' }

    const title = typeof params.title === 'string' ? params.title.trim() : ''
    if (!title) return { success: false, error: 'Table title is required' }

    const inviteCode =
        typeof params.inviteCode === 'string' && params.inviteCode.trim()
            ? params.inviteCode.trim().toUpperCase()
            : generateInviteCode()

    const now = new Date().toISOString()
    const tableRes = await tools.create('tables', {
        title,
        gmUserId: userId,
        inviteCode,
        activeSceneId: '',
        status: 'active',
    })
    if (!tableRes.success || !tableRes.data) {
        return { success: false, error: tableRes.error ?? 'Failed to create table' }
    }

    const tableId = String((tableRes.data as { id?: string; recordId?: string }).id ?? '')
    if (tableId) {
        await tools.create('table_members', {
            tableId,
            userId,
            displayName: typeof params.displayName === 'string' && params.displayName.trim()
                ? params.displayName.trim()
                : 'Game Master',
            role: 'gm',
            joinedAt: now,
        })
    }

    return {
        success: true,
        data: { tableId, inviteCode, gmUserId: userId, title },
    }
}

export async function createScene(
    { userId, params, tools }: ActionContext,
): Promise<ActionResult<{ tableId: string; publicSceneId: string; gmSceneId: string }>> {
    if (!userId) return { success: false, error: 'Unauthorized' }

    const tableId = typeof params.tableId === 'string' ? params.tableId.trim() : ''
    const title = typeof params.title === 'string' ? params.title.trim() : ''
    if (!tableId || !title) {
        return { success: false, error: 'tableId and title are required' }
    }

    // Ownership check: verify caller owns the parent table before creating scene rows.
    const tableRes = await tools.get('tables', tableId)
    const tableData = (tableRes.data as { record?: { data?: TableRecord } } | undefined)?.record?.data
    if (!tableRes.success || !tableData) {
        return { success: false, error: 'Table not found' }
    }
    if (tableData.gmUserId !== userId) {
        return { success: false, error: 'Forbidden: only the table GM can create scenes' }
    }

    const width = typeof params.width === 'number' && params.width > 0 ? Math.floor(params.width) : 1920
    const height =
        typeof params.height === 'number' && params.height > 0 ? Math.floor(params.height) : 1080
    const revealMode =
        typeof params.revealMode === 'string' && params.revealMode.trim()
            ? params.revealMode.trim()
            : 'regions'
    const mapImageUrl = typeof params.mapImageUrl === 'string' ? params.mapImageUrl.trim() : ''
    const hiddenNotes = typeof params.hiddenNotes === 'string' ? params.hiddenNotes : ''

    const initialEntities: SceneEntity[] = Array.isArray(params.entities)
        ? (params.entities as SceneEntity[])
        : []

    const publicSceneRes = await tools.create('scenes_public', {
        tableId,
        title,
        mapImageUrl,
        width,
        height,
        revealMode,
        revealedRegions: JSON.stringify([]),
        revealedEntities: JSON.stringify(projectPlayerEntities(initialEntities)),
    })
    if (!publicSceneRes.success || !publicSceneRes.data) {
        return { success: false, error: publicSceneRes.error ?? 'Failed to create public scene' }
    }

    const publicSceneId = String((publicSceneRes.data as { id?: string }).id ?? '')

    const gmSceneRes = await tools.create('scenes_gm', {
        tableId,
        publicSceneId,
        gmUserId: userId,
        hiddenNotes,
        allEntities: JSON.stringify(initialEntities),
    })
    if (!gmSceneRes.success || !gmSceneRes.data) {
        return { success: false, error: gmSceneRes.error ?? 'Failed to create GM scene' }
    }

    const gmSceneId = String((gmSceneRes.data as { id?: string }).id ?? '')

    if (params.setActive === true && publicSceneId) {
        await tools.update('tables', tableId, { activeSceneId: publicSceneId })
    }

    return {
        success: true,
        data: { tableId, publicSceneId, gmSceneId },
    }
}

export async function revealRegion(
    { userId, params, tools }: ActionContext,
): Promise<
    ActionResult<{
        publicSceneId: string
        region: RevealedRegion
        totalRevealedRegions: number
    }>
> {
    if (!userId) return { success: false, error: 'Unauthorized' }

    const tableId = typeof params.tableId === 'string' ? params.tableId.trim() : ''
    const publicSceneId =
        typeof params.publicSceneId === 'string' ? params.publicSceneId.trim() : ''
    const gmSceneId = typeof params.gmSceneId === 'string' ? params.gmSceneId.trim() : ''
    const region = params.region as RevealedRegion | undefined

    if (!tableId || !publicSceneId || !gmSceneId || !region?.id || !Array.isArray(region.points)) {
        return {
            success: false,
            error: 'tableId, publicSceneId, gmSceneId, and valid region are required',
        }
    }

    // Ownership check: verify table GM matches caller and both scenes belong to tableId.
    const tableRes = await tools.get('tables', tableId)
    const tableData = (tableRes.data as { record?: { data?: TableRecord } } | undefined)?.record?.data
    if (!tableRes.success || !tableData) {
        return { success: false, error: 'Table not found' }
    }
    if (tableData.gmUserId !== userId) {
        return { success: false, error: 'Forbidden: only the table GM can reveal regions' }
    }

    const [publicRes, gmRes] = await Promise.all([
        tools.get('scenes_public', publicSceneId),
        tools.get('scenes_gm', gmSceneId),
    ])
    const publicData = (publicRes.data as { record?: { data?: ScenePublicRecord } } | undefined)
        ?.record?.data
    const gmData = (gmRes.data as { record?: { data?: SceneGmRecord } } | undefined)?.record?.data

    if (!publicData || !gmData || publicData.tableId !== tableId || gmData.tableId !== tableId) {
        return { success: false, error: 'Scene does not belong to the specified table' }
    }
    if (gmData.gmUserId !== userId || gmData.publicSceneId !== publicSceneId) {
        return { success: false, error: 'Forbidden: invalid GM scene ownership or pairing' }
    }

    const existingRegions = parseJsonArray<RevealedRegion>(publicData.revealedRegions)
    const nextRegion: RevealedRegion = {
        id: region.id,
        kind: region.kind ?? 'rect',
        points: region.points,
        revealedAt: new Date().toISOString(),
    }
    const dedupedRegions = [
        ...existingRegions.filter((item) => item.id !== nextRegion.id),
        nextRegion,
    ]

    const updateRes = await tools.update('scenes_public', publicSceneId, {
        revealedRegions: JSON.stringify(dedupedRegions),
    })
    if (!updateRes.success) {
        return { success: false, error: updateRes.error ?? 'Failed to update revealed regions' }
    }

    return {
        success: true,
        data: {
            publicSceneId,
            region: nextRegion,
            totalRevealedRegions: dedupedRegions.length,
        },
    }
}

export async function getGmScene(
    { userId, params, tools }: ActionContext,
): Promise<
    ActionResult<{
        gmSceneId: string
        publicSceneId: string
        tableId: string
        hiddenNotes: string
        allEntities: SceneEntity[]
        revealedRegions: RevealedRegion[]
    }>
> {
    if (!userId) return { success: false, error: 'Unauthorized' }

    const tableId = typeof params.tableId === 'string' ? params.tableId.trim() : ''
    const gmSceneId = typeof params.gmSceneId === 'string' ? params.gmSceneId.trim() : ''
    if (!tableId || !gmSceneId) {
        return { success: false, error: 'tableId and gmSceneId are required' }
    }

    // Ownership check: only the GM who owns the table and GM scene may read hidden notes/entities.
    const tableRes = await tools.get('tables', tableId)
    const tableData = (tableRes.data as { record?: { data?: TableRecord } } | undefined)?.record?.data
    if (!tableRes.success || !tableData) {
        return { success: false, error: 'Table not found' }
    }
    if (tableData.gmUserId !== userId) {
        return { success: false, error: 'Forbidden: GM access required' }
    }

    const gmRes = await tools.get('scenes_gm', gmSceneId)
    const gmData = (gmRes.data as { record?: { data?: SceneGmRecord } } | undefined)?.record?.data
    if (!gmRes.success || !gmData || gmData.tableId !== tableId || gmData.gmUserId !== userId) {
        return { success: false, error: 'GM scene not found or unauthorized' }
    }

    let publicSceneData: ScenePublicRecord | null = null
    if (gmData.publicSceneId) {
        const publicRes = await tools.get('scenes_public', gmData.publicSceneId)
        publicSceneData =
            (publicRes.data as { record?: { data?: ScenePublicRecord } } | undefined)?.record?.data ?? null
    }

    return {
        success: true,
        data: {
            gmSceneId,
            publicSceneId: gmData.publicSceneId ?? '',
            tableId,
            hiddenNotes: gmData.hiddenNotes ?? '',
            allEntities: parseJsonArray<SceneEntity>(gmData.allEntities),
            revealedRegions: parseJsonArray<RevealedRegion>(publicSceneData?.revealedRegions),
        },
    }
}