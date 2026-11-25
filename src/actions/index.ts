import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'

import {
    createScene,
    createTable,
    getGmScene,
    revealRegion,
} from './tabletop-actions.js'

export const actions: Record<string, ActionHandler<Env>> = {
    createTable,
    createScene,
    revealRegion,
    getGmScene,
}

