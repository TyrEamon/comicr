import type { MangaImageRecord, MangaItem } from './types'

const DB_NAME = 'comics-app-db'
const DB_VERSION = 1

type StoreName = 'mangas' | 'images'

let dbPromise: Promise<IDBDatabase> | null = null

export function openAppDb(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result

      if (!db.objectStoreNames.contains('mangas')) {
        db.createObjectStore('mangas', { keyPath: 'id' })
      }

      if (!db.objectStoreNames.contains('images')) {
        const imageStore = db.createObjectStore('images', { keyPath: 'id' })
        imageStore.createIndex('mangaId', 'mangaId', { unique: false })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'))
  })

  return dbPromise
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

async function storeTransaction(storeName: StoreName, mode: IDBTransactionMode) {
  const db = await openAppDb()
  const transaction = db.transaction(storeName, mode)
  return transaction.objectStore(storeName)
}

export async function putRecord<T>(storeName: StoreName, value: T) {
  const store = await storeTransaction(storeName, 'readwrite')
  await requestToPromise(store.put(value))
}

export async function getRecord<T>(storeName: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const store = await storeTransaction(storeName, 'readonly')
  return requestToPromise(store.get(key)) as Promise<T | undefined>
}

export async function getAllRecords<T>(storeName: StoreName): Promise<T[]> {
  const store = await storeTransaction(storeName, 'readonly')
  return requestToPromise(store.getAll()) as Promise<T[]>
}

export async function deleteRecord(storeName: StoreName, key: IDBValidKey) {
  const store = await storeTransaction(storeName, 'readwrite')
  await requestToPromise(store.delete(key))
}

export async function getImagesByManga(mangaId: string): Promise<MangaImageRecord[]> {
  const db = await openAppDb()
  const transaction = db.transaction('images', 'readonly')
  const index = transaction.objectStore('images').index('mangaId')
  const images = await requestToPromise(index.getAll(mangaId)) as MangaImageRecord[]
  return images.sort((left, right) => left.index - right.index)
}

export async function deleteImagesByManga(mangaId: string) {
  const db = await openAppDb()
  const transaction = db.transaction('images', 'readwrite')
  const index = transaction.objectStore('images').index('mangaId')
  const request = index.openCursor(mangaId)

  await new Promise<void>((resolve, reject) => {
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) {
        resolve()
        return
      }

      cursor.delete()
      cursor.continue()
    }
    request.onerror = () => reject(request.error ?? new Error('Failed to delete manga images'))
  })
}

export async function listMangas(): Promise<MangaItem[]> {
  const mangas = await getAllRecords<MangaItem>('mangas')
  return mangas.sort((left, right) => right.updatedAt - left.updatedAt)
}

