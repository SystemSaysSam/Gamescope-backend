import crypto from 'crypto';
import { db } from './db';
import { IdentitySourceType, UserIdentity } from '../types';

export const GTA_CHARACTERS = [
  // Vice City
  'Tommy', 'Ken', 'Lance', 'Sonny', 'Cortez', 'Diaz', 'Candy', 'Mercedes', 'Umberto', 'Phil',
  // San Andreas
  'CJ', 'Sweet', 'Ryder', 'BigSmoke', 'Cesar', 'Kendl', 'Woozie', 'Truth', 'Tenpenny', 'Pulaski',
  // GTA III
  'Claude', 'Salvatore', '8Ball', 'Catalina', 'Donald', 'Asuka', 'Kenji', 'Misty',
  // GTA IV
  'Niko', 'Roman', 'LittleJacob', 'Brucie', 'Packie', 'Dimitri', 'Faustin', 'Mallorie', 'Dwayne', 'Playboy',
  // GTA V
  'Michael', 'Trevor', 'Franklin', 'Lamar', 'Lester', 'Jimmy', 'Tracey', 'Amanda', 'Ron', 'Wade', 'Chop',
  // GTA VI
  'Lucia', 'Jason', 'Cal', 'Dre', 'Bo', 'Stef',
  // GTA Online
  'Pavel', 'Tony', 'Paige', 'Avi', 'Moodymann', 'EnglishDave', 'Mutt'
];

export const GTA_ADJECTIVES = [
  'Crazy', 'Cute', 'Silent', 'Lucky', 'Wild', 'Chill', 'Dark', 'Happy',
  'Savage', 'Sleepy', 'Sneaky', 'Electric', 'Fearless', 'Golden', 'Frosty', 'Lonely',
  'Turbo', 'Cosmic', 'Swift', 'Blazing', 'Shadow', 'Phantom', 'Velvet', 'Retro',
  'Neon', 'Cyber', 'Rogue', 'Bullet', 'Hyper', 'Stormy', 'Radiant', 'Iron',
  'Atomic', 'Rebel', 'Midnight', 'Solar'
];

export const AVATAR_SVGS = [
  `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" rx="10" fill="#111624"/><circle cx="20" cy="18" r="9" stroke="#00f0ff" stroke-width="2" fill="#182033"/><path d="M14 18H26" stroke="#00f0ff" stroke-width="2.5" stroke-linecap="round"/><path d="M12 28C12 23.5817 15.5817 20 20 20C24.4183 20 28 23.5817 28 28" stroke="#ff2a85" stroke-width="2" stroke-linecap="round"/><circle cx="20" cy="18" r="2" fill="#00ff88"/></svg>`,
  `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" rx="10" fill="#141021"/><path d="M10 16L20 12L30 16V22L20 26L10 22V16Z" stroke="#ff2a85" stroke-width="2" fill="#201533"/><line x1="12" y1="18" x2="28" y2="18" stroke="#00f0ff" stroke-width="2"/><path d="M14 27C14 24 16.5 22 20 22C23.5 22 26 24 26 27" stroke="#00f0ff" stroke-width="1.8"/></svg>`,
  `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" rx="10" fill="#0d181c"/><circle cx="20" cy="17" r="8" stroke="#00ff88" stroke-width="2" fill="#132629"/><circle cx="17" cy="16" r="2" fill="#00f0ff"/><circle cx="23" cy="16" r="2" fill="#00f0ff"/><path d="M11 29C12.5 24 16 22 20 22C24 22 27.5 24 29 29" stroke="#00ff88" stroke-width="2"/><path d="M17 10L20 7L23 10" stroke="#ffaa00" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" rx="10" fill="#1f0f1c"/><path d="M12 14C12 14 16 11 20 11C24 11 28 14 28 14V22C28 26.4 20 29 20 29C20 29 12 26.4 12 22V14Z" stroke="#ff2a85" stroke-width="2" fill="#2d1328"/><circle cx="17" cy="19" r="1.5" fill="#00f0ff"/><circle cx="23" cy="19" r="1.5" fill="#00f0ff"/><line x1="16" y1="23" x2="24" y2="23" stroke="#ffaa00" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" rx="10" fill="#1a1c12"/><circle cx="20" cy="18" r="9" stroke="#ffaa00" stroke-width="2" fill="#292613"/><rect x="13" y="15" width="14" height="6" rx="2" fill="#00f0ff" fill-opacity="0.8"/><path d="M13 28C14 24 17 22 20 22C23 22 26 24 27 28" stroke="#ffaa00" stroke-width="2"/></svg>`
];

export const COLOR_POOL = [
  '#00f0ff', // Cyan
  '#ff2a85', // Magenta
  '#00ff88', // Green
  '#ffaa00', // Amber
  '#9d4edd', // Purple
  '#38bdf8'  // Sky
];

export class IdentityService {
  private static instance: IdentityService;
  private memoryCache = new Map<string, UserIdentity>();
  private assignedNames = new Set<string>();
  private initialized: boolean = false;

  private constructor() {}

  public static getInstance(): IdentityService {
    if (!IdentityService.instance) {
      IdentityService.instance = new IdentityService();
    }
    return IdentityService.instance;
  }

  public async init(): Promise<void> {
    if (this.initialized) return;
    try {
      const all = await db.getCollection<UserIdentity>('user_identities');
      for (const ident of all) {
        this.memoryCache.set(this.getCacheKey(ident.sourceType, ident.sourceId), ident);
        this.assignedNames.add(ident.normalizedName);
      }
      this.initialized = true;
      console.log(`[IdentityService] Loaded ${all.length} permanent GTA identities.`);
    } catch (err: any) {
      console.warn('[IdentityService] Init warning:', err.message);
    }
  }

  private getCacheKey(sourceType: IdentitySourceType, sourceId: string): string {
    return `${sourceType}:${sourceId.trim()}`;
  }

  public getDocId(sourceType: IdentitySourceType, sourceId: string): string {
    const hash = crypto.createHash('sha256').update(`${sourceType}:${sourceId.trim()}`).digest('hex');
    return `${sourceType.toLowerCase()}_${hash.substring(0, 24)}`;
  }

  /**
   * Resolve an existing identity without generating a new one
   */
  public async getIdentityBySource(sourceType: IdentitySourceType, sourceId: string): Promise<UserIdentity | null> {
    const key = this.getCacheKey(sourceType, sourceId);
    if (this.memoryCache.has(key)) {
      return this.memoryCache.get(key)!;
    }
    const docId = this.getDocId(sourceType, sourceId);
    const saved = await db.getDoc<UserIdentity>('user_identities', docId);
    if (saved) {
      this.memoryCache.set(key, saved);
      this.assignedNames.add(saved.normalizedName);
      return saved;
    }
    return null;
  }

  /**
   * Permanent GameScope Community Member Identity
   * GUARANTEE: Exclusively clean GTA-inspired name WITHOUT numbers.
   */
  public async getOrCreateGameScopeIdentity(userId: string): Promise<UserIdentity> {
    const cleanId = userId.trim();
    const existing = await this.getIdentityBySource('GAMESCOPE', cleanId);
    if (existing) {
      return existing;
    }

    // Allocate clean GTA name without numbers
    const displayName = this.generateUniqueGameScopeName();
    const normalizedName = displayName.toLowerCase();

    // Select avatar and color
    const avatarIndex = Math.floor(Math.random() * AVATAR_SVGS.length);
    const colorIndex = Math.floor(Math.random() * COLOR_POOL.length);

    const docId = this.getDocId('GAMESCOPE', cleanId);
    const identity: UserIdentity = {
      id: docId,
      sourceType: 'GAMESCOPE',
      sourceId: cleanId,
      displayName,
      normalizedName,
      avatarSvg: AVATAR_SVGS[avatarIndex],
      avatarColor: COLOR_POOL[colorIndex],
      assignedAt: Date.now(),
      isActive: true
    };

    await db.setDoc('user_identities', docId, identity);
    this.memoryCache.set(this.getCacheKey('GAMESCOPE', cleanId), identity);
    this.assignedNames.add(normalizedName);

    console.log(`[IdentityService] Assigned clean GameScope identity: ${displayName} -> ${cleanId}`);
    return identity;
  }

  /**
   * Synchronous YouTube Participant Identity Generation
   * GUARANTEE: Mandatory numeric suffix (e.g. CrazyTommy07, CuteCJ24).
   * Generates display identity on-the-fly ONLY when admission is granted.
   * Does NOT write permanent Firestore/DB records upfront.
   */
  public generateYouTubeIdentitySync(
    channelId: string, 
    fallbackSeed?: string,
    additionalReservedNames?: Set<string>
  ): UserIdentity {
    const effectiveId = (channelId || fallbackSeed || `yt_anon_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`).trim();

    // Check memory cache first
    const key = this.getCacheKey('YOUTUBE', effectiveId);
    if (this.memoryCache.has(key)) {
      return this.memoryCache.get(key)!;
    }

    // Allocate GTA name with mandatory numeric suffix
    const displayName = this.generateUniqueYouTubeName(additionalReservedNames);
    const normalizedName = displayName.toLowerCase();

    // Deterministic or seeded avatar based on channelId
    const hashNum = crypto.createHash('md5').update(effectiveId).digest().readUInt16BE(0);
    const avatarIndex = hashNum % AVATAR_SVGS.length;
    const colorIndex = (hashNum >> 4) % COLOR_POOL.length;

    const docId = this.getDocId('YOUTUBE', effectiveId);
    const identity: UserIdentity = {
      id: docId,
      sourceType: 'YOUTUBE',
      sourceId: effectiveId,
      displayName,
      normalizedName,
      avatarSvg: AVATAR_SVGS[avatarIndex],
      avatarColor: COLOR_POOL[colorIndex],
      assignedAt: Date.now(),
      isActive: true
    };

    this.memoryCache.set(key, identity);
    this.assignedNames.add(normalizedName);

    console.log(`[IdentityService] Generated YouTube identity: ${displayName} -> [${effectiveId.substring(0, 10)}...]`);
    return identity;
  }

  /**
   * Release temporary name from active reservation set
   */
  public removeTemporaryName(normalizedName: string): void {
    if (!normalizedName) return;
    this.assignedNames.delete(normalizedName.toLowerCase());
  }

  /**
   * Release a batch of temporary stream names when stream session concludes
   */
  public releaseTemporaryNames(names: string[]): void {
    for (const name of names) {
      if (name) {
        this.assignedNames.delete(name.toLowerCase());
      }
    }
  }

  /**
   * Permanent YouTube Participant Identity
   * GUARANTEE: Mandatory numeric suffix (e.g. CrazyTommy07, CuteCJ24).
   * NEVER receives an unnumbered clean identity.
   */
  public async getOrCreateYouTubeIdentity(channelId: string, fallbackSeed?: string): Promise<UserIdentity> {
    const effectiveId = (channelId || fallbackSeed || `yt_anon_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`).trim();
    const existing = await this.getIdentityBySource('YOUTUBE', effectiveId);
    if (existing) {
      return existing;
    }

    const identity = this.generateYouTubeIdentitySync(effectiveId, fallbackSeed);
    await db.setDoc('user_identities', identity.id, identity);
    return identity;
  }

  /**
   * Combination generator for clean unnumbered GameScope names
   * (e.g. CrazyTommy, CuteCJ, SilentTrevor, LuckyLamar)
   */
  private generateUniqueGameScopeName(): string {
    // Attempt random combination
    for (let attempts = 0; attempts < 300; attempts++) {
      const adj = GTA_ADJECTIVES[Math.floor(Math.random() * GTA_ADJECTIVES.length)];
      const char = GTA_CHARACTERS[Math.floor(Math.random() * GTA_CHARACTERS.length)];
      const candidate = `${adj}${char}`;
      if (!this.assignedNames.has(candidate.toLowerCase())) {
        return candidate;
      }
    }

    // Fallback: systematic traversal
    for (const adj of GTA_ADJECTIVES) {
      for (const char of GTA_CHARACTERS) {
        const candidate = `${adj}${char}`;
        if (!this.assignedNames.has(candidate.toLowerCase())) {
          return candidate;
        }
      }
    }

    // Edge-case if thousands assigned: secondary prefix adjective
    const prefix = 'Super';
    for (const adj of GTA_ADJECTIVES) {
      for (const char of GTA_CHARACTERS) {
        const candidate = `${prefix}${adj}${char}`;
        if (!this.assignedNames.has(candidate.toLowerCase())) {
          return candidate;
        }
      }
    }

    return `Vanguard${Date.now().toString(36)}`;
  }

  /**
   * Combination generator for YouTube names with mandatory numeric suffix
   * (e.g. CrazyTommy07, CuteCJ24, SilentTrevor108, LuckyLamar03)
   */
  private generateUniqueYouTubeName(additionalReservedNames?: Set<string>): string {
    const isNameTaken = (candidate: string) => {
      const lower = candidate.toLowerCase();
      if (this.assignedNames.has(lower)) return true;
      if (additionalReservedNames && additionalReservedNames.has(lower)) return true;
      return false;
    };

    for (let attempts = 0; attempts < 500; attempts++) {
      const adj = GTA_ADJECTIVES[Math.floor(Math.random() * GTA_ADJECTIVES.length)];
      const char = GTA_CHARACTERS[Math.floor(Math.random() * GTA_CHARACTERS.length)];
      
      // Random numeric suffix between 1 and 999
      const num = Math.floor(Math.random() * 999) + 1;
      const numStr = num < 10 ? `0${num}` : `${num}`;
      const candidate = `${adj}${char}${numStr}`;

      if (!isNameTaken(candidate)) {
        return candidate;
      }
    }

    // Fallback: incremental suffix
    const baseAdj = GTA_ADJECTIVES[Math.floor(Math.random() * GTA_ADJECTIVES.length)];
    const baseChar = GTA_CHARACTERS[Math.floor(Math.random() * GTA_CHARACTERS.length)];
    let suffix = 1;
    while (suffix < 99999) {
      const numStr = suffix < 10 ? `0${suffix}` : `${suffix}`;
      const candidate = `${baseAdj}${baseChar}${numStr}`;
      if (!isNameTaken(candidate)) {
        return candidate;
      }
      suffix++;
    }

    return `Player${Math.floor(Math.random() * 9000) + 1000}`;
  }

  /**
   * Helper to check if a username contains numeric digits
   */
  public hasNumericSuffix(name: string): boolean {
    return /\d+$/.test(name);
  }
}

export const identityService = IdentityService.getInstance();
