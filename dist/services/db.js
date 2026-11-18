"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = exports.DatabaseService = void 0;
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const env_1 = require("../config/env");
class DatabaseService {
    static instance;
    firestore = null;
    isFirebaseActive = false;
    localDbPath;
    memoryStore = {};
    constructor() {
        this.localDbPath = path_1.default.resolve(process.cwd(), '.data', 'gamescope_db.json');
        this.initFirebase();
        if (!this.isFirebaseActive) {
            this.initLocalStore();
        }
    }
    static getInstance() {
        if (!DatabaseService.instance) {
            DatabaseService.instance = new DatabaseService();
        }
        return DatabaseService.instance;
    }
    initFirebase() {
        try {
            if (firebase_admin_1.default.apps.length > 0) {
                this.firestore = firebase_admin_1.default.firestore();
                this.isFirebaseActive = true;
                console.log('[Database] Connected to existing Firebase Admin instance.');
                return;
            }
            // Check service account file path
            if (env_1.env.FIREBASE.serviceAccountPath && fs_1.default.existsSync(env_1.env.FIREBASE.serviceAccountPath)) {
                firebase_admin_1.default.initializeApp({
                    credential: firebase_admin_1.default.credential.cert(env_1.env.FIREBASE.serviceAccountPath)
                });
                this.firestore = firebase_admin_1.default.firestore();
                this.isFirebaseActive = true;
                console.log(`[Database] Initialized Firebase Admin from service account file: ${env_1.env.FIREBASE.serviceAccountPath}`);
                return;
            }
            // Check explicit environment credentials
            if (env_1.env.FIREBASE.projectId && env_1.env.FIREBASE.clientEmail && env_1.env.FIREBASE.privateKey) {
                firebase_admin_1.default.initializeApp({
                    credential: firebase_admin_1.default.credential.cert({
                        projectId: env_1.env.FIREBASE.projectId,
                        clientEmail: env_1.env.FIREBASE.clientEmail,
                        privateKey: env_1.env.FIREBASE.privateKey
                    })
                });
                this.firestore = firebase_admin_1.default.firestore();
                this.isFirebaseActive = true;
                console.log(`[Database] Initialized Firebase Admin for project: ${env_1.env.FIREBASE.projectId}`);
                return;
            }
            console.warn('[Database] Firebase credentials not configured. Running in persistent local store mode (.data/gamescope_db.json).');
        }
        catch (err) {
            console.warn('[Database] Firebase initialization note:', err.message, 'Falling back to persistent local store.');
        }
    }
    initLocalStore() {
        try {
            const dir = path_1.default.dirname(this.localDbPath);
            if (!fs_1.default.existsSync(dir)) {
                fs_1.default.mkdirSync(dir, { recursive: true });
            }
            if (fs_1.default.existsSync(this.localDbPath)) {
                const raw = fs_1.default.readFileSync(this.localDbPath, 'utf-8');
                this.memoryStore = JSON.parse(raw);
            }
            else {
                this.memoryStore = {};
                this.saveLocalStore();
            }
        }
        catch (e) {
            this.memoryStore = {};
        }
    }
    saveLocalStore() {
        try {
            const dir = path_1.default.dirname(this.localDbPath);
            if (!fs_1.default.existsSync(dir)) {
                fs_1.default.mkdirSync(dir, { recursive: true });
            }
            fs_1.default.writeFileSync(this.localDbPath, JSON.stringify(this.memoryStore, null, 2), 'utf-8');
        }
        catch (e) {
            console.error('[Database] Failed to write local store:', e);
        }
    }
    isUsingFirebase() {
        return this.isFirebaseActive;
    }
    getFirestore() {
        return this.firestore;
    }
    /* ------------------- Generic CRUD Operations ------------------- */
    async getDoc(collection, docId) {
        if (this.isFirebaseActive && this.firestore) {
            const snap = await this.firestore.collection(collection).doc(docId).get();
            return snap.exists ? snap.data() : null;
        }
        if (!this.memoryStore[collection])
            return null;
        return this.memoryStore[collection][docId] ? this.memoryStore[collection][docId] : null;
    }
    async setDoc(collection, docId, data, merge = true) {
        if (this.isFirebaseActive && this.firestore) {
            await this.firestore.collection(collection).doc(docId).set(data, { merge });
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
        }
        else {
            this.memoryStore[collection][docId] = { ...data };
        }
        this.saveLocalStore();
    }
    async updateDoc(collection, docId, data) {
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
    async deleteDoc(collection, docId) {
        if (this.isFirebaseActive && this.firestore) {
            await this.firestore.collection(collection).doc(docId).delete();
            return;
        }
        if (this.memoryStore[collection] && this.memoryStore[collection][docId]) {
            delete this.memoryStore[collection][docId];
            this.saveLocalStore();
        }
    }
    async getCollection(collection, filterFn, sortFn, limit) {
        if (this.isFirebaseActive && this.firestore) {
            const snap = await this.firestore.collection(collection).get();
            let items = snap.docs.map(d => d.data());
            if (filterFn)
                items = items.filter(filterFn);
            if (sortFn)
                items.sort(sortFn);
            if (limit && limit > 0)
                items = items.slice(0, limit);
            return items;
        }
        if (!this.memoryStore[collection])
            return [];
        let items = Object.values(this.memoryStore[collection]);
        if (filterFn)
            items = items.filter(filterFn);
        if (sortFn)
            items.sort(sortFn);
        if (limit && limit > 0)
            items = items.slice(0, limit);
        return items;
    }
}
exports.DatabaseService = DatabaseService;
exports.db = DatabaseService.getInstance();
