import { useCallback, useEffect, useRef, useState } from 'react'

function resolveDailyLimit(): number {
    const envLimit = Number(import.meta.env.VITE_DAILY_LIMIT)
    if (!Number.isNaN(envLimit) && envLimit > 0) return envLimit
    return import.meta.env.DEV ? 1000 : 5
}

const STORAGE_PREFIX = '7331676E616C2D636F6E766572746572:usage:'
const IDB_NAME = '7331676E616C2D636F6E766572746572-ration'
const IDB_STORE = 'usage'

function todayKey(): string {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

// --- localStorage (fast, synchronous — used for the initial render) ---

function readLocalStorageCount(): number {
    try {
        const raw = localStorage.getItem(STORAGE_PREFIX + todayKey())
        return raw ? Math.max(0, parseInt(raw, 10) || 0) : 0
    } catch {
        return 0
    }
}

function writeLocalStorageCount(count: number): void {
    try {
        localStorage.setItem(STORAGE_PREFIX + todayKey(), String(count))
    } catch {
        // Private browsing / storage disabled — falls through to IndexedDB only.
    }
}

// --- IndexedDB (separate storage bucket — raises the bar past clearing localStorage alone) ---

function openIdb(): Promise<IDBDatabase | null> {
    return new Promise((resolve) => {
        if (!('indexedDB' in window)) {
            resolve(null)
            return
        }
        const req = indexedDB.open(IDB_NAME, 1)
        req.onupgradeneeded = () => {
            req.result.createObjectStore(IDB_STORE)
        }
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => resolve(null) // blocked/private-mode failure — degrade to localStorage only
    })
}

async function readIdbCount(): Promise<number> {
    const db = await openIdb()
    if (!db) return 0
    return new Promise((resolve) => {
        try {
            const tx = db.transaction(IDB_STORE, 'readonly')
            const req = tx.objectStore(IDB_STORE).get(todayKey())
            req.onsuccess = () => resolve(typeof req.result === 'number' ? req.result : 0)
            req.onerror = () => resolve(0)
        } catch {
            resolve(0)
        }
    })
}

async function writeIdbCount(count: number): Promise<void> {
    const db = await openIdb()
    if (!db) return
    return new Promise((resolve) => {
        try {
            const tx = db.transaction(IDB_STORE, 'readwrite')
            tx.objectStore(IDB_STORE).put(count, todayKey())
            tx.oncomplete = () => resolve()
            tx.onerror = () => resolve()
        } catch {
            resolve()
        }
    })
}

// --- Hook ---

export function useDailyQuota(limit = resolveDailyLimit()) {
    // Synchronous initial value from localStorage — IndexedDB reconciles a beat later.
    const countRef = useRef(readLocalStorageCount())
    const [used, setUsed] = useState(countRef.current)

    useEffect(() => {
        let cancelled = false
        readIdbCount().then((idbCount) => {
            if (cancelled) return
            // Take the max of both sources: if one storage was cleared but not
            // the other, the surviving value wins rather than resetting to zero.
            if (idbCount > countRef.current) {
                countRef.current = idbCount
                writeLocalStorageCount(idbCount) // sync the higher value back down
                setUsed(idbCount)
            } else if (countRef.current > 0) {
                writeIdbCount(countRef.current) // sync localStorage's value up, in case IDB was the one cleared
            }
        })
        return () => {
            cancelled = true
        }
    }, [])

    const remainingNow = useCallback(() => Math.max(0, limit - countRef.current), [limit])

    const consume = useCallback(() => {
        countRef.current += 1
        writeLocalStorageCount(countRef.current)
        writeIdbCount(countRef.current) // fire-and-forget; UI already updated optimistically
        setUsed(countRef.current)
    }, [])

    return { limit, used, remaining: Math.max(0, limit - used), remainingNow, consume }
}

