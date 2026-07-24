import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock fs BEFORE importing the target module
jest.unstable_mockModule('fs', () => ({
  existsSync: jest.fn(),
  unlinkSync: jest.fn(),
}));

const fs = await import('fs');
const { cleanupTempFiles } = await import('../../../utils/audioConverter');

describe('audioConverter.cleanupTempFiles', () => {
    let consoleWarnMock: any;

    beforeEach(() => {
        (fs.existsSync as jest.Mock).mockReset();
        (fs.unlinkSync as jest.Mock).mockReset();
        (fs.existsSync as jest.Mock).mockReturnValue(false);
        consoleWarnMock = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should ignore falsy paths without calling fs methods', () => {
        cleanupTempFiles(null, undefined, '');
        expect(fs.existsSync).not.toHaveBeenCalled();
        expect(fs.unlinkSync).not.toHaveBeenCalled();
    });

    it('should not call unlinkSync if file does not exist', () => {
        (fs.existsSync as jest.Mock).mockReturnValue(false);
        cleanupTempFiles('path/to/nonexistent/file.ogg');

        expect(fs.existsSync).toHaveBeenCalledWith('path/to/nonexistent/file.ogg');
        expect(fs.unlinkSync).not.toHaveBeenCalled();
    });

    it('should call unlinkSync if file exists', () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        cleanupTempFiles('path/to/existing/file.ogg');

        expect(fs.existsSync).toHaveBeenCalledWith('path/to/existing/file.ogg');
        expect(fs.unlinkSync).toHaveBeenCalledWith('path/to/existing/file.ogg');
    });

    it('should handle multiple paths correctly', () => {
        (fs.existsSync as jest.Mock).mockImplementation((path: any) => path === 'file1.ogg' || path === 'file3.ogg');

        cleanupTempFiles('file1.ogg', 'file2.ogg', 'file3.ogg');

        expect(fs.existsSync).toHaveBeenCalledTimes(3);
        expect(fs.unlinkSync).toHaveBeenCalledTimes(2);
        expect(fs.unlinkSync).toHaveBeenCalledWith('file1.ogg');
        expect(fs.unlinkSync).toHaveBeenCalledWith('file3.ogg');
    });

    it('should catch errors from unlinkSync and log a warning', () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        const error = new Error('Permission denied');
        (fs.unlinkSync as jest.Mock).mockImplementation(() => {
            throw error;
        });

        cleanupTempFiles('path/to/error/file.ogg');

        expect(fs.unlinkSync).toHaveBeenCalledWith('path/to/error/file.ogg');
        expect(consoleWarnMock).toHaveBeenCalledWith('[AudioConverter] Cleanup failed:', 'path/to/error/file.ogg');
    });
});
