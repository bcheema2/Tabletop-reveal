import { useRef, useState, type PointerEvent } from 'react'
import type { RevealedRegion, SceneEntity } from '../actions/tabletop-actions'

export interface PublicEntity {
    id: string
    kind: 'token' | 'encounter' | 'note' | 'door'
    label: string
    x: number
    y: number
}

interface SceneCanvasProps {
    title: string
    mapImageUrl?: string
    width: number
    height: number
    revealedRegions: RevealedRegion[]
    entities: Array<PublicEntity | SceneEntity>
    isGm?: boolean
    onRevealRect?: (region: RevealedRegion) => void
}

export function SceneCanvas({
                                title,
                                mapImageUrl,
                                width,
                                height,
                                revealedRegions,
                                entities,
                                isGm = false,
                                onRevealRect,
                            }: SceneCanvasProps) {
    const containerRef = useRef<HTMLDivElement | null>(null)
    const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
    const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null)

    const toNormalized = (e: PointerEvent<HTMLDivElement>) => {
        const rect = containerRef.current?.getBoundingClientRect()
        if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 }
        return {
            x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
            y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
        }
    }

    const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
        if (!isGm || !onRevealRect) return
        e.currentTarget.setPointerCapture(e.pointerId)
        const pt = toNormalized(e)
        setDragStart(pt)
        setDragCurrent(pt)
    }

    const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
        if (!dragStart) return
        setDragCurrent(toNormalized(e))
    }

    const handlePointerUp = () => {
        if (!dragStart || !dragCurrent || !onRevealRect) {
            setDragStart(null)
            setDragCurrent(null)
            return
        }
        const minX = Math.min(dragStart.x, dragCurrent.x)
        const minY = Math.min(dragStart.y, dragCurrent.y)
        const maxX = Math.max(dragStart.x, dragCurrent.x)
        const maxY = Math.max(dragStart.y, dragCurrent.y)

        if (maxX - minX > 0.01 && maxY - minY > 0.01) {
            onRevealRect({
                id: crypto.randomUUID(),
                kind: 'rect',
                points: [
                    { x: minX, y: minY },
                    { x: maxX, y: maxY },
                ],
                revealedAt: new Date().toISOString(),
            })
        }
        setDragStart(null)
        setDragCurrent(null)
    }

    const maskId = `fog-mask-${title.replace(/\W+/g, '-').toLowerCase()}`

    return (
        <div
            ref={containerRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            style={{ aspectRatio: `${width} / ${height}` }}
            className={`relative w-full overflow-hidden rounded-lg border border-border bg-muted select-none ${
                isGm ? 'cursor-crosshair' : 'cursor-default'
            }`}
        >
            {mapImageUrl ? (
                <img
                    src={mapImageUrl}
                    alt={title}
                    draggable={false}
                    className="h-full w-full object-cover"
                />
            ) : (
                <div className="flex h-full w-full items-center justify-center bg-slate-900 text-sm text-slate-400">
                    {title} ({width}×{height})
                </div>
            )}

            {/* Fog layer: SVG mask punches transparent holes for each revealed rectangle */}
            <svg
                viewBox="0 0 1 1"
                preserveAspectRatio="none"
                className="pointer-events-none absolute inset-0 h-full w-full"
            >
                <defs>
                    <mask id={maskId}>
                        <rect x="0" y="0" width="1" height="1" fill="white" />
                        {revealedRegions.map((region) => {
                            const [p1, p2] = region.points
                            if (!p1 || !p2) return null
                            return (
                                <rect
                                    key={region.id}
                                    x={Math.min(p1.x, p2.x)}
                                    y={Math.min(p1.y, p2.y)}
                                    width={Math.abs(p2.x - p1.x)}
                                    height={Math.abs(p2.y - p1.y)}
                                    fill="black"
                                />
                            )
                        })}
                    </mask>
                </defs>

                <rect
                    x="0"
                    y="0"
                    width="1"
                    height="1"
                    fill={isGm ? 'rgba(15, 23, 42, 0.55)' : 'rgb(2, 6, 23)'}
                    mask={`url(#${maskId})`}
                />

                {/* Live drag preview box for GM */}
                {isGm && dragStart && dragCurrent && (
                    <rect
                        x={Math.min(dragStart.x, dragCurrent.x)}
                        y={Math.min(dragStart.y, dragCurrent.y)}
                        width={Math.abs(dragCurrent.x - dragStart.x)}
                        height={Math.abs(dragCurrent.y - dragStart.y)}
                        fill="rgba(56, 189, 248, 0.2)"
                        stroke="rgb(56, 189, 248)"
                        strokeWidth="0.004"
                    />
                )}
            </svg>

            {/* Entities (already filtered to revealed-only for players) */}
            {entities.map((entity) => {
                const hiddenFromPlayers = 'isRevealed' in entity && !entity.isRevealed
                return (
                    <div
                        key={entity.id}
                        style={{ left: `${entity.x * 100}%`, top: `${entity.y * 100}%` }}
                        className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full px-2 py-0.5 text-xs font-medium shadow ${
                            hiddenFromPlayers
                                ? 'border border-amber-400 bg-amber-950/90 text-amber-200'
                                : 'border border-emerald-400 bg-emerald-950/90 text-emerald-100'
                        }`}
                    >
                        {entity.label}
                        {hiddenFromPlayers ? ' (Hidden)' : ''}
                    </div>
                )
            })}
        </div>
    )
}