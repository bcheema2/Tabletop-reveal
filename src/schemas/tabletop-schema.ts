import type { CollectionSchema } from 'deepspace/schema'

export const tablesSchema: CollectionSchema = {
    name: 'tables',
    columns: [
        { name: 'title', storage: 'text', interpretation: 'plain' },
        { name: 'gmUserId', storage: 'text', interpretation: 'plain' },
        { name: 'inviteCode', storage: 'text', interpretation: 'plain' },
        { name: 'activeSceneId', storage: 'text', interpretation: 'plain' },
        { name: 'status', storage: 'text', interpretation: 'plain' },
    ],
    permissions: {
        viewer: { read: false, create: false, update: false, delete: false },
        member: { read: true, create: false, update: false, delete: false },
        admin: { read: true, create: true, update: true, delete: true },
    },
}

export const tableMembersSchema: CollectionSchema = {
    name: 'table_members',
    columns: [
        { name: 'tableId', storage: 'text', interpretation: 'plain' },
        { name: 'userId', storage: 'text', interpretation: 'plain' },
        { name: 'displayName', storage: 'text', interpretation: 'plain' },
        { name: 'role', storage: 'text', interpretation: 'plain' },
        { name: 'joinedAt', storage: 'text', interpretation: 'plain' },
    ],
    permissions: {
        viewer: { read: false, create: false, update: false, delete: false },
        member: { read: true, create: false, update: 'own', delete: false },
        admin: { read: true, create: true, update: true, delete: true },
    },
}

export const scenesPublicSchema: CollectionSchema = {
    name: 'scenes_public',
    columns: [
        { name: 'tableId', storage: 'text', interpretation: 'plain' },
        { name: 'title', storage: 'text', interpretation: 'plain' },
        { name: 'mapImageUrl', storage: 'text', interpretation: 'plain' },
        { name: 'width', storage: 'number', interpretation: 'plain' },
        { name: 'height', storage: 'number', interpretation: 'plain' },
        { name: 'revealMode', storage: 'text', interpretation: 'plain' },
        { name: 'revealedRegions', storage: 'text', interpretation: 'json' },
        { name: 'revealedEntities', storage: 'text', interpretation: 'json' },
    ],
    permissions: {
        viewer: { read: false, create: false, update: false, delete: false },
        member: { read: true, create: false, update: false, delete: false },
        admin: { read: true, create: true, update: true, delete: true },
    },
}

export const scenesGmSchema: CollectionSchema = {
    name: 'scenes_gm',
    columns: [
        { name: 'tableId', storage: 'text', interpretation: 'plain' },
        { name: 'publicSceneId', storage: 'text', interpretation: 'plain' },
        { name: 'gmUserId', storage: 'text', interpretation: 'plain' },
        { name: 'hiddenNotes', storage: 'text', interpretation: 'plain' },
        { name: 'allEntities', storage: 'text', interpretation: 'json' },
    ],
    permissions: {
        viewer: { read: false, create: false, update: false, delete: false },
        member: { read: false, create: false, update: false, delete: false },
        admin: { read: true, create: true, update: true, delete: true },
    },
}

export const tabletopSchemas: CollectionSchema[] = [
    tablesSchema,
    tableMembersSchema,
    scenesPublicSchema,
    scenesGmSchema,
]