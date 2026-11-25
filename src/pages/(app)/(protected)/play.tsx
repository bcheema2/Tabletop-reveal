import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from 'deepspace'
import { SceneCanvas, type PublicEntity } from '../../../components/SceneCanvas'
import type { RevealedRegion } from '../../../actions/tabletop-actions'

interface TableRecordItem {
    id: string
    data?: {
        title?: string
        activeSceneId?: string
    }
    title?: string
    activeSceneId?: string
}

interface ScenePublicRecordItem {
    id: string
    data?: {
        tableId?: string
        title?: string
        mapImageUrl?: string
        width?: number
        height?: number
        revealedRegions?: string
        revealedEntities?: string
    }
    tableId?: string
    title?: string
    mapImageUrl?: string
    width?: number
    height?: number
    revealedRegions?: string
    revealedEntities?: string
}

export default function PlayerMapPage() {
    const [searchParams] = useSearchParams()
    const tableId = searchParams.get('tableId') ?? ''

    // Players subscribe only to shared/public collections (scenes_gm has member.read = false)
    const tablesQuery = useQuery('tables') as unknown as {
        records?: TableRecordItem[]
        status?: string
        error?: unknown
    }
    const publicScenesQuery = useQuery('scenes_public') as unknown as {
        records?: ScenePublicRecordItem[]
        status?: string
        error?: unknown
    }

    const tables = useMemo(
        () =>
            (Array.isArray(tablesQuery?.records) ? tablesQuery.records : []).map((r) => ({
                id: r.id,
                title: r.data?.title ?? r.title,
                activeSceneId: r.data?.activeSceneId ?? r.activeSceneId,
            })),
        [tablesQuery?.records],
    )

    const publicScenes = useMemo(
        () =>
            (Array.isArray(publicScenesQuery?.records) ? publicScenesQuery.records : []).map((r) => ({
                id: r.id,
                tableId: r.data?.tableId ?? r.tableId,
                title: r.data?.title ?? r.title,
                mapImageUrl: r.data?.mapImageUrl ?? r.mapImageUrl,
                width: r.data?.width ?? r.width,
                height: r.data?.height ?? r.height,
                revealedRegions: r.data?.revealedRegions ?? r.revealedRegions,
                revealedEntities: r.data?.revealedEntities ?? r.revealedEntities,
            })),
        [publicScenesQuery?.records],
    )

    const table = useMemo(() => tables.find((t) => t.id === tableId), [tables, tableId])
    const activeScene = useMemo(
        () => publicScenes.find((s) => s.id === table?.activeSceneId && s.tableId === tableId),
        [publicScenes, table?.activeSceneId, tableId],
    )

    const revealedRegions = useMemo<RevealedRegion[]>(() => {
        if (!activeScene?.revealedRegions) return []
        try {
            const parsed: unknown = JSON.parse(activeScene.revealedRegions)
            return Array.isArray(parsed) ? (parsed as RevealedRegion[]) : []
        } catch {
            return []
        }
    }, [activeScene?.revealedRegions])

    const revealedEntities = useMemo<PublicEntity[]>(() => {
        if (!activeScene?.revealedEntities) return []
        try {
            const parsed: unknown = JSON.parse(activeScene.revealedEntities)
            return Array.isArray(parsed) ? (parsed as PublicEntity[]) : []
        } catch {
            return []
        }
    }, [activeScene?.revealedEntities])

    if (!tableId) {
        return (
            <div className="p-6 text-sm text-muted-foreground">
                Missing <code>?tableId=...</code> query parameter. Open the player link shared by your GM.
            </div>
        )
    }

    if (tablesQuery?.error || publicScenesQuery?.error) {
        return (
            <div className="p-6 text-sm text-destructive">
                Failed to sync session state. Refresh the page or verify you are signed in.
            </div>
        )
    }

    if (tablesQuery?.status === 'loading' || publicScenesQuery?.status === 'loading') {
        return (
            <div className="p-6 text-sm text-muted-foreground">
                Connecting to tabletop session...
            </div>
        )
    }

    if (!table || !activeScene) {
        return (
            <div className="p-6 text-sm text-muted-foreground">
                Waiting for the Game Master to activate a scene...
            </div>
        )
    }

    return (
        <div className="mx-auto max-w-5xl space-y-4 p-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-semibold">{table.title ?? 'Tabletop Session'}</h1>
                    <p className="text-sm text-muted-foreground">Scene: {activeScene.title}</p>
                </div>
                <span className="rounded border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground">
          Live Player View
        </span>
            </div>

            <SceneCanvas
                title={activeScene.title ?? 'Scene'}
                mapImageUrl={activeScene.mapImageUrl}
                width={activeScene.width ?? 1920}
                height={activeScene.height ?? 1080}
                revealedRegions={revealedRegions}
                entities={revealedEntities}
                isGm={false}
            />
        </div>
    )
}