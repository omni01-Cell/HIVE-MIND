// tests/unit/plugins/visualReporterPlugin.test.ts
import { describe, it, beforeEach, afterEach, jest, expect } from '@jest/globals';
import path from 'path';

const mockPipe = jest.fn();
const mockText = jest.fn();
const mockMoveDown = jest.fn();
const mockFontSize = jest.fn().mockReturnValue({ text: mockText });
const mockEnd = jest.fn();

jest.unstable_mockModule('pdfkit', () => {
    return {
        default: jest.fn().mockImplementation(() => ({
            pipe: mockPipe,
            fontSize: mockFontSize,
            moveDown: mockMoveDown,
            text: mockText,
            end: mockEnd,
            page: { height: 800 }
        }))
    };
});

jest.unstable_mockModule('fs', () => ({
    default: {
        existsSync: jest.fn().mockReturnValue(true),
        mkdirSync: jest.fn(),
        createWriteStream: jest.fn().mockReturnValue({
            on: jest.fn((event, cb: any) => {
                if (event === 'finish') cb();
            })
        }),
        readFileSync: jest.fn().mockReturnValue(JSON.stringify({ fullName: 'Bot' }))
    },
    readFileSync: jest.fn().mockReturnValue(JSON.stringify({ fullName: 'Bot' }))
}));

const { default: VisualReporterPlugin } = await import('../../../plugins/tools/visual_reporter/index.js');

describe('Visual Reporter Plugin', () => {
    let mockTransport: any;
    let baseContext: any;

    beforeEach(() => {
        jest.clearAllMocks();
        mockTransport = {
            sendFile: (jest.fn() as any).mockResolvedValue(undefined)
        };
        baseContext = {
            chatId: '123@g.us',
            transport: mockTransport
        };
    });

    it('should validate context', async () => {
        const result = await VisualReporterPlugin.execute({}, {}, 'generate_pdf_report');
        expect(result.success).toBe(false);
        expect(result.message).toContain('CONTEXT_ERROR');
    });

    it('should generate and send PDF report', async () => {
        const args = {
            title: 'Test Report',
            content: 'Hello this is a test',
            filename: 'test_report'
        };

        const result = await VisualReporterPlugin.execute(args, baseContext, 'generate_pdf_report');

        expect(result.success).toBe(true);
        expect(mockTransport.sendFile).toHaveBeenCalled();
        expect(result.message).toContain('PDF generated and sent');
    });

    it('should include sections if provided', async () => {
        const args = {
            title: 'Test Report',
            content: 'Hello this is a test',
            filename: 'test_report',
            sections: [
                { heading: 'Section 1', text: 'Text 1' }
            ]
        };

        const result = await VisualReporterPlugin.execute(args, baseContext, 'generate_pdf_report');

        expect(result.success).toBe(true);
        expect(mockTransport.sendFile).toHaveBeenCalled();
        expect(result.message).toContain('PDF generated and sent');
    });

    it('should handle unknown tools', async () => {
        const result = await VisualReporterPlugin.execute({}, baseContext, 'unknown_tool');
        expect(result.success).toBe(false);
        expect(result.message).toContain('Unknown tool');
    });
});
