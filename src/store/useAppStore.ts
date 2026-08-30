import { create } from 'zustand';
import * as db from '../db';
import { uid } from '../lib/id';
import { colorForIndex } from '../lib/people';
import {
  DEFAULT_SETTINGS,
  type Person,
  type Receipt,
  type ReceiptStep,
  type Settings,
} from '../types';

export type Route =
  | { name: 'home' }
  | { name: 'settings' }
  | { name: 'receipt'; id: string; step: ReceiptStep };

type State = {
  ready: boolean;
  people: Person[];
  receipts: Receipt[];
  settings: Settings;
  route: Route;
  online: boolean;
};

type Actions = {
  init: () => Promise<void>;
  navigate: (route: Route) => void;

  addPerson: (name: string) => Promise<Person | null>;
  renamePerson: (id: string, name: string) => Promise<void>;
  removePerson: (id: string) => Promise<void>;

  createReceipt: (partial?: Partial<Receipt>) => Promise<Receipt>;
  updateReceipt: (id: string, patch: Partial<Receipt> | ((r: Receipt) => Receipt)) => void;
  removeReceipt: (id: string) => Promise<void>;
  receiptById: (id: string) => Receipt | undefined;

  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  wipeEverything: () => Promise<void>;
};

export type AppStore = State & Actions;

const pendingWrites = new Map<string, Receipt>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleFlush(): void {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushReceipts();
  }, 400);
}

export async function flushReceipts(): Promise<void> {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  const batch = [...pendingWrites.values()];
  pendingWrites.clear();
  for (const receipt of batch) {
    await db.putReceipt(receipt);
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushReceipts();
  });
  window.addEventListener('pagehide', () => void flushReceipts());
}

export function emptyReceipt(partial: Partial<Receipt> = {}): Receipt {
  const now = new Date().toISOString();
  return {
    id: uid(),
    createdAt: now,
    updatedAt: now,
    merchant: null,
    purchaseDate: null,
    imageBlobKey: '',
    lines: [],
    taxes: [],
    adjustments: [],
    statedSubtotalCents: null,
    statedTotalCents: null,
    tipCents: 0,
    tipBasis: 'subtotal',
    status: 'draft',
    step: 'capture',
    ...partial,
  };
}

export const useAppStore = create<AppStore>((set, get) => ({
  ready: false,
  people: [],
  receipts: [],
  settings: DEFAULT_SETTINGS,
  route: { name: 'home' },
  online: typeof navigator === 'undefined' ? true : navigator.onLine,

  async init() {
    const [people, receipts, settings] = await Promise.all([
      db.listPeople(),
      db.listReceipts(),
      db.getSettings(),
    ]);
    set({ people, receipts, settings, ready: true });
    void db.purgeOldImages(settings.imageRetentionDays);

    const setOnline = () => set({ online: navigator.onLine });
    window.addEventListener('online', setOnline);
    window.addEventListener('offline', setOnline);
  },

  navigate(route) {
    set({ route });
    void flushReceipts();
  },

  async addPerson(name) {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const { people } = get();
    if (people.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) return null;
    const person: Person = {
      id: uid(),
      name: trimmed,
      color: colorForIndex(people.length),
    };
    await db.putPerson(person);
    set({ people: [...people, person] });
    return person;
  },

  async renamePerson(id, name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const people = get().people.map((p) => (p.id === id ? { ...p, name: trimmed } : p));
    const person = people.find((p) => p.id === id);
    if (person) await db.putPerson(person);
    set({ people });
  },

  async removePerson(id) {
    await db.deletePerson(id);
    set({ people: get().people.filter((p) => p.id !== id) });
    const receipts = get().receipts.map((receipt) => {
      if (receipt.status === 'settled') return receipt;
      const lines = receipt.lines.map((line) => ({
        ...line,
        assignments: line.assignments.filter((a) => a.personId !== id),
      }));
      const adjustments = receipt.adjustments.map((adjustment) => ({
        ...adjustment,
        assignments: adjustment.assignments.filter((a) => a.personId !== id),
      }));
      return { ...receipt, lines, adjustments };
    });
    set({ receipts });
    for (const receipt of receipts) pendingWrites.set(receipt.id, receipt);
    await flushReceipts();
  },

  async createReceipt(partial) {
    const receipt = emptyReceipt({ tipBasis: get().settings.defaultTipBasis, ...partial });
    await db.putReceipt(receipt);
    set({ receipts: [receipt, ...get().receipts] });
    return receipt;
  },

  updateReceipt(id, patch) {
    const receipts = get().receipts.map((receipt) => {
      if (receipt.id !== id) return receipt;
      const next =
        typeof patch === 'function' ? patch(receipt) : ({ ...receipt, ...patch } as Receipt);
      return { ...next, updatedAt: new Date().toISOString() };
    });
    set({ receipts });
    const updated = receipts.find((r) => r.id === id);
    if (updated) {
      pendingWrites.set(id, updated);
      scheduleFlush();
    }
  },

  async removeReceipt(id) {
    pendingWrites.delete(id);
    await db.deleteReceipt(id);
    set({ receipts: get().receipts.filter((r) => r.id !== id) });
  },

  receiptById(id) {
    return get().receipts.find((r) => r.id === id);
  },

  async updateSettings(patch) {
    const settings = { ...get().settings, ...patch };
    await db.putSettings(settings);
    set({ settings });
  },

  async wipeEverything() {
    pendingWrites.clear();
    await db.clearAllData();
    set({
      people: [],
      receipts: [],
      settings: DEFAULT_SETTINGS,
      route: { name: 'home' },
    });
  },
}));
