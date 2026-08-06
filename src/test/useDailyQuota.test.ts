import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useDailyQuota } from '../hooks/useDailyQuota'

// fake-indexeddb provides an in-memory IndexedDB for jsdom, which has none
// built in. Re-assigning a fresh instance before each test gives full
// isolation — no leftover data leaking between test cases.
import { IDBFactory } from 'fake-indexeddb'

const IDB_NAME = '7331676E616C2D636F6E766572746572-ration'
const IDB_STORE = 'usage'

function todayKey(): string {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

// Direct read used only to verify what actually landed in IndexedDB,
// independent of the hook's own internals.
function readIdbDirect(): Promise<number> {
    return new Promise((resolve) => {
        const req = indexedDB.open(IDB_NAME, 1)
        req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE)
        req.onsuccess = () => {
            const db = req.result
            const tx = db.transaction(IDB_STORE, 'readonly')
            const getReq = tx.objectStore(IDB_STORE).get(todayKey())
            getReq.onsuccess = () => resolve(typeof getReq.result === 'number' ? getReq.result : 0)
            getReq.onerror = () => resolve(0)
        }
        req.onerror = () => resolve(0)
    })
}

beforeEach(() => {
    localStorage.clear()
        // Fresh in-memory IndexedDB for every test.
        ; (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory()
})

describe('useDailyQuota', () => {
    it('starts at zero used with full remaining', () => {
        const { result } = renderHook(() => useDailyQuota(5))
        expect(result.current.used).toBe(0)
        expect(result.current.remaining).toBe(5)
    })

    it('increments used and decrements remaining on consume', () => {
        const { result } = renderHook(() => useDailyQuota(5))
        act(() => result.current.consume())
        expect(result.current.used).toBe(1)
        expect(result.current.remaining).toBe(4)
    })

    it('never goes below zero remaining once exhausted', () => {
        const { result } = renderHook(() => useDailyQuota(1))
        act(() => result.current.consume())
        act(() => result.current.consume())
        expect(result.current.remaining).toBe(0)
    })

    it('writes consumed count to IndexedDB, not just localStorage', async () => {
        const { result } = renderHook(() => useDailyQuota(5))
        act(() => result.current.consume())
        act(() => result.current.consume())
        await waitFor(async () => {
            expect(await readIdbDirect()).toBe(2)
        })
    })
    it('recovers count from IndexedDB when localStorage was cleared', async () => {
        const first = renderHook(() => useDailyQuota(5))
        act(() => first.result.current.consume())
        act(() => first.result.current.consume())
        act(() => first.result.current.consume())

        // Wait for the fire-and-forget IndexedDB write to actually land.
        await waitFor(async () => {
            expect(await readIdbDirect()).toBe(3)
        })

        // Simulate someone clearing only localStorage.
        localStorage.clear()

        const second = renderHook(() => useDailyQuota(5))
        // Initial synchronous read is 0 (localStorage was wiped)...
        expect(second.result.current.used).toBe(0)

        // ...but the reconciliation effect should pull it back from IndexedDB.
        await waitFor(() => {
            expect(second.result.current.used).toBe(3)
        })
        expect(second.result.current.remaining).toBe(2)
    })

    it('syncs localStorage value up to IndexedDB when IndexedDB was the one cleared', async () => {
        const first = renderHook(() => useDailyQuota(5))
        act(() => first.result.current.consume())
        act(() => first.result.current.consume())

        await waitFor(async () => {
            expect(await readIdbDirect()).toBe(2)
        })

            // Simulate IndexedDB being cleared while localStorage survives.
            ; (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory()

        renderHook(() => useDailyQuota(5))

        // The reconciliation effect should write localStorage's surviving
        // value (2) back into the now-empty IndexedDB.
        await waitFor(async () => {
            expect(await readIdbDirect()).toBe(2)
        })
    })

    it('persists usage across hook instances on the same day', () => {
        const first = renderHook(() => useDailyQuota(5))
        act(() => first.result.current.consume())

        const second = renderHook(() => useDailyQuota(5))
        expect(second.result.current.used).toBe(1)
    })

})