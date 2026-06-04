// Manual mock for hnswlib-node (native C++ module)
// Used in tests only — real module loaded in production

const mockInstance = {
    addPoint: jest.fn(),
    searchKnn: jest.fn(() => ({ neighbors: [], distances: [] })),
    getCurrentCount: jest.fn(() => 0),
    initIndex: jest.fn(),
    readIndexSync: jest.fn(),
    writeIndexSync: jest.fn(),
    getPoint: jest.fn(() => []),
};

export class HierarchicalNSW {
    constructor() {
        Object.assign(this, mockInstance);
    }
}

export default { HierarchicalNSW };
