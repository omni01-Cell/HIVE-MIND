// tests/unit/services/MediaIndexer.test.ts
import { describe, it, beforeEach, afterEach, jest, expect } from '@jest/globals';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { MultimodalEmbeddingService } from '../../../services/ai/MultimodalEmbeddingService.js';
import { MediaIndexer } from '../../../services/media/MediaIndexer.js';

// ── Mock fetch ──────────────────────────────────────────────────────────

const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
const originalFetch = global.fetch;

const FAKE_VECTOR = Array.from({ length: 3072 }, () => 0.5);

// ── Tests ──────────────────────────────────────────────────────────────

describe('MediaIndexer', () => {
    const TEST_KEY = 'test-gemini-key';
    const TEST_DB = join('/tmp', `test-mediaindexer-${Date.now()}`);

    let embeddingService: MultimodalEmbeddingService;
    let indexer: MediaIndexer;

    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch = mockFetch;
        if (!existsSync(TEST_DB)) {
            mkdirSync(TEST_DB, { recursive: true });
        }
        embeddingService = new MultimodalEmbeddingService({ geminiKey: TEST_KEY, dbPath: TEST_DB });
        embeddingService.init();
        indexer = new MediaIndexer(embeddingService);
    });

    afterEach(() => {
        global.fetch = originalFetch;
        if (existsSync(TEST_DB)) {
            rmSync(TEST_DB, { recursive: true });
        }
    });

    // ── indexFile ──

    describe('indexFile', () => {
        it('should index an image file successfully', async () => {
            // Create a fake image file
            const imgPath = join(TEST_DB, 'test.jpg');
            writeFileSync(imgPath, Buffer.from([0xff, 0xd8, 0xff, 0xe0])); // JPEG magic bytes

            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ embedding: { values: FAKE_VECTOR } }),
            } as Response);

            const result = await indexer.indexFile('ctx1', imgPath);

            expect(result.success).toBe(true);
            expect(result.modality).toBe('image');
            expect(result.fileId).toBeDefined();
            expect(result.fileId.length).toBeGreaterThan(0);
            expect(embeddingService.getEntryCount()).toBe(1);
        });

        it('should index a video file', async () => {
            const vidPath = join(TEST_DB, 'test.mp4');
            writeFileSync(vidPath, Buffer.from([0x00, 0x00, 0x00, 0x1c]));

            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ embedding: { values: FAKE_VECTOR } }),
            } as Response);

            const result = await indexer.indexFile('ctx1', vidPath);
            expect(result.success).toBe(true);
            expect(result.modality).toBe('video');
        });

        it('should index an audio file', async () => {
            const audioPath = join(TEST_DB, 'test.mp3');
            writeFileSync(audioPath, Buffer.from([0xff, 0xfb]));

            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ embedding: { values: FAKE_VECTOR } }),
            } as Response);

            const result = await indexer.indexFile('ctx1', audioPath);
            expect(result.success).toBe(true);
            expect(result.modality).toBe('audio');
        });

        it('should index a PDF file', async () => {
            const pdfPath = join(TEST_DB, 'test.pdf');
            writeFileSync(pdfPath, Buffer.from('%PDF-1.4'));

            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ embedding: { values: FAKE_VECTOR } }),
            } as Response);

            const result = await indexer.indexFile('ctx1', pdfPath);
            expect(result.success).toBe(true);
            expect(result.modality).toBe('document');
        });

        it('should fail for unsupported text files', async () => {
            const txtPath = join(TEST_DB, 'readme.md');
            writeFileSync(txtPath, '# Hello');

            const result = await indexer.indexFile('ctx1', txtPath);
            expect(result.success).toBe(false);
            expect(result.error).toContain('Unsupported modality');
        });

        it('should fail when embedding API fails', async () => {
            const imgPath = join(TEST_DB, 'fail.jpg');
            writeFileSync(imgPath, Buffer.from([0xff, 0xd8]));

            mockFetch.mockResolvedValue({
                ok: false,
                json: async () => ({ error: { message: 'quota' } }),
            } as Response);

            const result = await indexer.indexFile('ctx1', imgPath);
            expect(result.success).toBe(false);
            expect(result.error).toContain('Embedding failed');
        });

        it('should store correct metadata in the entry', async () => {
            const imgPath = join(TEST_DB, 'meta.jpg');
            writeFileSync(imgPath, Buffer.from([0xff, 0xd8]));

            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ embedding: { values: FAKE_VECTOR } }),
            } as Response);

            const result = await indexer.indexFile('ctx2', imgPath);
            const entry = embeddingService.getEntry(result.fileId);

            expect(entry).toBeDefined();
            expect(entry?.contextId).toBe('ctx2');
            expect(entry?.fileName).toBe('meta.jpg');
            expect(entry?.modality).toBe('image');
            expect(entry?.mimeType).toBe('image/jpeg');
            expect(entry?.fileSize).toBe(2);
        });

        it('should not crash on non-existent file', async () => {
            const result = await indexer.indexFile('ctx1', '/nonexistent/file.jpg');
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });
    });

    // ── indexDirectory ──

    describe('indexDirectory', () => {
        it('should index all indexable files in a directory', async () => {
            writeFileSync(join(TEST_DB, 'a.jpg'), Buffer.from([0xff, 0xd8]));
            writeFileSync(join(TEST_DB, 'b.mp4'), Buffer.from([0x00]));
            writeFileSync(join(TEST_DB, 'c.txt'), 'skip me');

            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ embedding: { values: FAKE_VECTOR } }),
            } as Response);

            const results = await indexer.indexDirectory('ctx1', TEST_DB);
            expect(results).toHaveLength(2);
            expect(results.every((r) => r.success)).toBe(true);
        });

        it('should handle empty directory', async () => {
            const emptyDir = join(TEST_DB, 'empty');
            mkdirSync(emptyDir);

            const results = await indexer.indexDirectory('ctx1', emptyDir);
            expect(results).toHaveLength(0);
        });
    });

    // ── previewEmbedding ──

    describe('previewEmbedding', () => {
        it('should return a vector without storing', async () => {
            const imgPath = join(TEST_DB, 'preview.jpg');
            writeFileSync(imgPath, Buffer.from([0xff, 0xd8]));

            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ embedding: { values: FAKE_VECTOR } }),
            } as Response);

            const vector = await indexer.previewEmbedding(imgPath);
            expect(vector).toEqual(FAKE_VECTOR);
            expect(embeddingService.getEntryCount()).toBe(0);
        });

        it('should return null for text files', async () => {
            const vector = await indexer.previewEmbedding('/some/file.md');
            expect(vector).toBeNull();
        });
    });

    // ── applyRetention ──

    describe('applyRetention', () => {
        it('should remove old entries', () => {
            // Add entry with old date
            embeddingService.addEntry(
                { contextId: 'c1', filePath: '/old.jpg', fileName: 'old.jpg', modality: 'image', mimeType: 'image/jpeg', fileSize: 100, contentSummary: null, metadata: {} },
                FAKE_VECTOR,
            );
            // Manually set createdAt to 60 days ago
            const entries = (embeddingService as any).entries;
            entries[0].createdAt = new Date(Date.now() - 60 * 86400000).toISOString();

            const removed = indexer.applyRetention();
            expect(removed).toBe(1);
            expect(embeddingService.getEntryCount()).toBe(0);
        });

        it('should keep recent entries', () => {
            embeddingService.addEntry(
                { contextId: 'c1', filePath: '/recent.jpg', fileName: 'recent.jpg', modality: 'image', mimeType: 'image/jpeg', fileSize: 100, contentSummary: null, metadata: {} },
                FAKE_VECTOR,
            );

            const removed = indexer.applyRetention();
            expect(removed).toBe(0);
            expect(embeddingService.getEntryCount()).toBe(1);
        });

        it('should return 0 when nothing to remove', () => {
            expect(indexer.applyRetention()).toBe(0);
        });
    });
});
