import { useEffect, useMemo, useState } from 'react'
import { useAuth, useQuery } from 'deepspace'
import { Button, Input } from '@/components/ui'
import { SceneCanvas } from '../../../components/SceneCanvas'
import { callTabletopAction } from '../../../lib/tabletop-api'
import type { RevealedRegion, SceneEntity } from '../../../actions/tabletop-actions'

interface GmScenePayload {
    gmSceneId: string
    publicSceneId: string
    tableId: string
    hiddenNotes: string
    allEntities: SceneEntity[]
    revealedRegions: RevealedRegion[]
}

interface PublicSceneRow {
    id: string
    data?: {
        tableId?: string
        title?: string
        mapImageUrl?: string
        width?: number
        height?: number
        revealedRegions?: string
    }
    tableId?: string
    title?: string
    mapImageUrl?: string
    width?: number
    height?: number
    revealedRegions?: string
}

export default function GmControlPage() {
    const auth = useAuth() as { token?: string; getToken?: () => Promise<string | null> }
    const [tableTitle, setTableTitle] = useState('')
    const [sceneTitle, setSceneTitle] = useState('')
    const [mapImageUrl, setMapImageUrl] = useState('')
    const [hiddenNotes, setHiddenNotes] = useState('')

    const [tableId, setTableId] = useState('')
    const [inviteCode, setInviteCode] = useState('')
    const [publicSceneId, setPublicSceneId] = useState('')
    const [gmSceneId, setGmSceneId] = useState('')
    const [gmScene, setGmScene] = useState<GmScenePayload | null>(null)
    const [statusMsg, setStatusMsg] = useState('')

    // Live subscription to scenes_public via .records
    const publicScenesQuery = useQuery('scenes_public') as unknown as {
        records?: PublicSceneRow[]
        status?: string
        error?: unknown
    }

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
            })),
        [publicScenesQuery?.records],
    )

    const activePublicScene = useMemo(
        () => publicScenes.find((s) => s.id === publicSceneId),
        [publicScenes, publicSceneId],
    )

    const liveRevealedRegions = useMemo<RevealedRegion[]>(() => {
        if (!activePublicScene?.revealedRegions) return gmScene?.revealedRegions ?? []
        try {
            const parsed: unknown = JSON.parse(activePublicScene.revealedRegions)
            return Array.isArray(parsed) ? (parsed as RevealedRegion[]) : []
        } catch {
            return []
        }
    }, [activePublicScene?.revealedRegions, gmScene?.revealedRegions])

    const resolveBearer = async (): Promise<string> => {
        if (auth.token) return auth.token
        if (auth.getToken) return (await auth.getToken()) ?? ''
        return ''
    }

    const refreshGmScene = async (tId: string, gId: string) => {
        const token = await resolveBearer()
        if (!token) return
        const res = await callTabletopAction<GmScenePayload>(
            'getGmScene',
            { tableId: tId, gmSceneId: gId },
            token,
        )
        if (res.success && res.data) {
            setGmScene(res.data)
        } else if (res.error) {
            setStatusMsg(res.error)
        }
    }

    useEffect(() => {
        if (tableId && gmSceneId) {
            void refreshGmScene(tableId, gmSceneId)
        }
    }, [tableId, gmSceneId])

    const handleCreateTable = async () => {
        const token = await resolveBearer()
        if (!token) return setStatusMsg('Missing session token')

        const res = await callTabletopAction<{ tableId: string; inviteCode: string }>(
            'createTable',
            { title: tableTitle },
            token,
        )
        if (!res.success || !res.data) {
            return setStatusMsg(res.error ?? 'Failed to create table')
        }
        setTableId(res.data.tableId)
        setInviteCode(res.data.inviteCode)
        setStatusMsg(`Table created. Share player URL: /play?tableId=${res.data.tableId}`)
    }

    const handleCreateScene = async () => {
        const token = await resolveBearer()
        if (!token || !tableId) return

        const res = await callTabletopAction<{ publicSceneId: string; gmSceneId: string }>(
            'createScene',
            {
                tableId,
                title: sceneTitle,
                mapImageUrl,
                hiddenNotes,
                setActive: true,
            },
            token,
        )
        if (!res.success || !res.data) {
            return setStatusMsg(res.error ?? 'Failed to create scene')
        }
        setPublicSceneId(res.data.publicSceneId)
        setGmSceneId(res.data.gmSceneId)
        setStatusMsg('Scene active. Drag across the map below to reveal fog to players.')
    }

    const handleRevealRect = async (region: RevealedRegion) => {
        const token = await resolveBearer()
        if (!token || !tableId || !publicSceneId || !gmSceneId) return

        const res = await callTabletopAction(
            'revealRegion',
            { tableId, publicSceneId, gmSceneId, region },
            token,
        )
        if (!res.success) {
            setStatusMsg(res.error ?? 'Failed to reveal region')
            return
        }
        await refreshGmScene(tableId, gmSceneId)
    }

    return (
        <div className="mx-auto max-w-5xl space-y-6 p-6">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-semibold">GM Control Board</h1>
                {inviteCode && (
                    <span className="rounded border border-border bg-card px-3 py-1 font-mono text-xs">
            Invite: {inviteCode} | Player link: /play?tableId={tableId}
          </span>
                )}
            </div>

            {Boolean(publicScenesQuery?.error) && (
                <div className="rounded border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
                    Sync error loading public scenes.
                </div>
            )}

            {statusMsg && (
                <div className="rounded border border-border bg-card px-4 py-2 text-sm text-muted-foreground">
                    {statusMsg}
                </div>
            )}

            {!tableId ? (
                <div className="flex max-w-md gap-2">
                    <Input
                        placeholder="Campaign / Table title"
                        value={tableTitle}
                        onChange={(e) => setTableTitle(e.target.value)}
                    />
                    <Button onClick={handleCreateTable}>Create Table</Button>
                </div>
            ) : (
                <div className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-4">
                    <Input
                        placeholder="Scene title"
                        value={sceneTitle}
                        onChange={(e) => setSceneTitle(e.target.value)}
                    />
                    <Input
                        placeholder="Map image URL (/api/files/...)"
                        value={mapImageUrl}
                        onChange={(e) => setMapImageUrl(e.target.value)}
                    />
                    <Input
                        placeholder="GM-only hidden notes"
                        value={hiddenNotes}
                        onChange={(e) => setHiddenNotes(e.target.value)}
                    />
                    <Button onClick={handleCreateScene}>Create & Activate Scene</Button>
                </div>
            )}

            {publicSceneId && (
                <div className="space-y-4">
                    <SceneCanvas
                        title={activePublicScene?.title ?? sceneTitle}
                        mapImageUrl={activePublicScene?.mapImageUrl ?? mapImageUrl}
                        width={activePublicScene?.width ?? 1920}
                        height={activePublicScene?.height ?? 1080}
                        revealedRegions={liveRevealedRegions}
                        entities={gmScene?.allEntities ?? []}
                        isGm
                        onRevealRect={handleRevealRect}
                    />

                    {gmScene?.hiddenNotes && (
                        <div className="rounded-lg border border-amber-500/40 bg-amber-950/20 p-4 text-sm">
                            <div className="font-semibold text-amber-300">
                                GM-Only Notes (Never sent to players)
                            </div>
                            <p className="mt-1 text-muted-foreground">{gmScene.hiddenNotes}</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}