import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env';

export class DatabaseService {
  private static instance: DatabaseService;
  private firestore: admin.firestore.Firestore | null = null;
  private isFirebaseActive: boolean = false;
  private localDbPath: string;
  private memoryStore: Record<string, Record<string, any>> = {};

  private constructor() {
    this.localDbPath = path.resolve(process.cwd(), '.data', 'gamescope_db.json');
    this.initFirebase();
    if (!this.isFirebaseActive) {
      this.initLocalStore();
    }
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  private initFirebase() {
    try {
      if (admin.apps.length > 0) {
        this.firestore = admin.firestore();
        this.isFirebaseActive = true;
        console.log('[Database] Connected to existing Firebase Admin instance.');
        return;
      }

      // Check service account file path
      if (env.FIREBASE.serviceAccountPath && fs.existsSync(env.FIREBASE.serviceAccountPath)) {
        admin.initializeApp({
          credential: admin.credential.cert(env.FIREBASE.serviceAccountPath)
        });
        this.firestore = admin.firestore();
        this.isFirebaseActive = true;
        console.log(`[Database] Initialized Firebase Admin from service account file: ${env.FIREBASE.serviceAccountPath}`);
        return;
      }

      // Check explicit environment credentials
      if (env.FIREBASE.projectId && env.FIREBASE.clientEmail && env.FIREBASE.privateKey) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: env.FIREBASE.projectId,
            clientEmail: env.FIREBASE.clientEmail,
            privateKey: env.FIREBASE.privateKey
          })
        });
        this.firestore = admin.firestore();
        this.isFirebaseActive = true;
        console.log(`[Database] Initialized Firebase Admin for project: ${env.FIREBASE.projectId}`);
        return;
      }

      console.warn('[Database] Firebase credentials not configured. Running in persistent local store mode (.data/gamescope_db.json).');
    } catch (err: any) {
      console.warn('[Database] Firebase initialization note:', err.message, 'Falling back to persistent local store.');
    }
  }

  private initLocalStore() {
    try {
      const dir = path.dirname(this.localDbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (fs.existsSync(this.localDbPath)) {
        const raw = fs.readFileSync(this.localDbPath, 'utf-8');
        this.memoryStore = JSON.parse(raw);
      } else {
        this.memoryStore = {};
        this.saveLocalStore();
      }
    } catch (e) {
      this.memoryStore = {};
    }
  }

  private saveLocalStore() {
    try {
      const dir = path.dirname(this.localDbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.localDbPath, JSON.stringify(this.memoryStore, null, 2), 'utf-8');
    } catch (e) {
      console.error('[Database] Failed to write local store:', e);
    }
  }

  public isUsingFirebase(): boolean {
    return this.isFirebaseActive;
  }

  public getFirestore(): admin.firestore.Firestore | null {
    return this.firestore;
  }

  /* ------------------- Generic CRUD Operations ------------------- */

  public async getDoc<T = any>(collection: string, docId: string): Promise<T | null> {
    if (this.isFirebaseActive && this.firestore) {
      const snap = await this.firestore.collection(collection).doc(docId).get();
      return snap.exists ? (snap.data() as T) : null;
    }

    if (!this.memoryStore[collection]) return null;
    return this.memoryStore[collection][docId] ? (this.memoryStore[collection][docId] as T) : null;
  }

  public async setDoc<T = any>(collection: string, docId: string, data: T, merge: boolean = true): Promise<void> {
    if (this.isFirebaseActive && this.firestore) {
      await this.firestore.collection(collection).doc(docId).set(data as any, { merge });
      return;
    }

    if (!this.memoryStore[collection]) {
      this.memoryStore[collection] = {};
    }

    if (merge && this.memoryStore[collection][docId]) {
      this.memoryStore[collection][docId] = {
        ...this.memoryStore[collection][docId],
        ...data
      };
    } else {
      this.memoryStore[collection][docId] = { ...data };
    }
    this.saveLocalStore();
  }

  public async updateDoc(collection: string, docId: string, data: Partial<any>): Promise<void> {
    if (this.isFirebaseActive && this.firestore) {
      await this.firestore.collection(collection).doc(docId).update(data);
      return;
    }

    if (!this.memoryStore[collection] || !this.memoryStore[collection][docId]) {
      throw new Error(`Document ${docId} not found in collection ${collection}`);
    }
    this.memoryStore[collection][docId] = {
      ...this.memoryStore[collection][docId],
      ...data
    };
    this.saveLocalStore();
  }

  public async deleteDoc(collection: string, docId: string): Promise<void> {
    if (this.isFirebaseActive && this.firestore) {
      await this.firestore.collection(collection).doc(docId).delete();
      return;
    }

    if (this.memoryStore[collection] && this.memoryStore[collection][docId]) {
      delete this.memoryStore[collection][docId];
      this.saveLocalStore();
    }
  }

  public async getCollection<T = any>(
    collection: string,
    filterFn?: (item: T) => boolean,
    sortFn?: (a: T, b: T) => number,
    limit?: number
  ): Promise<T[]> {
    if (this.isFirebaseActive && this.firestore) {
      const snap = await this.firestore.collection(collection).get();
      let items: T[] = snap.docs.map(d => d.data() as T);
      if (filterFn) items = items.filter(filterFn);
      if (sortFn) items.sort(sortFn);
      if (limit && limit > 0) items = items.slice(0, limit);
      return items;
    }

    if (!this.memoryStore[collection]) return [];
    let items = Object.values(this.memoryStore[collection]) as T[];
    if (filterFn) items = items.filter(filterFn);
    if (sortFn) items.sort(sortFn);
    if (limit && limit > 0) items = items.slice(0, limit);
    return items;
  }
}

export const db = DatabaseService.getInstance();
