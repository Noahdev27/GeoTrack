/** Doublures en mémoire des plugins Capacitor, partagées par les tests. */
export const memoryStore = new Map<string, string>();

export const preferencesMock = {
  Preferences: {
    get: async ({ key }: { key: string }) => ({ value: memoryStore.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => void memoryStore.set(key, value),
    remove: async ({ key }: { key: string }) => void memoryStore.delete(key),
  },
};

export const networkMock = {
  Network: {
    getStatus: async () => ({ connected: true, connectionType: 'wifi' }),
    addListener: async () => ({ remove: async () => {} }),
  },
};
