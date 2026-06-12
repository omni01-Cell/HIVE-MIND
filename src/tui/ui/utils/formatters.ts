import * as path from 'path';
import { homedir } from 'os';

export interface ThoughtSummary {
    id: string;
    title: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    durationMs?: number;
    thoughts?: string;
    subject?: string;
}

export function tildeifyPath(filePath: string): string {
    if (!filePath) return '';
    const home = homedir();
    if (filePath.startsWith(home)) {
        return filePath.replace(home, '~');
    }
    return filePath;
}

export function shortenPath(filePath: string, maxLength: number = 30): string {
    if (!filePath) return '';
    if (filePath.length <= maxLength) return filePath;
    const parts = filePath.split(path.sep);
    if (parts.length <= 2) {
        return filePath.substring(filePath.length - maxLength);
    }
    const filename = parts.pop() || '';
    const firstPart = parts[0] || '';
    const remainingLength = maxLength - firstPart.length - filename.length - 4; // 4 for ".../"
    if (remainingLength <= 0) {
        return `...${path.sep}${filename}`;
    }
    // Take as many directories as possible from the end
    let currentPath = '';
    while (parts.length > 0) {
        const nextPart = parts.pop() || '';
        if (currentPath.length + nextPart.length + 1 > remainingLength) {
            break;
        }
        currentPath = nextPart + (currentPath ? path.sep + currentPath : '');
    }
    return `${firstPart}${path.sep}...${path.sep}${currentPath}${path.sep}${filename}`;
}

export function displayContentToString(display: any): string | undefined {
    if (!display) return undefined;
    if (typeof display === 'string') return display;
    if (typeof display.text === 'string') return display.text;
    return JSON.stringify(display);
}

export function parseThought(thought: string | undefined): ThoughtSummary {
    return {
        id: `thought-${Date.now()}`,
        title: 'Thought',
        status: 'completed',
        thoughts: thought || ''
    };
}

export function partListUnionToString(parts: any): string {
    if (!parts) return '';
    if (typeof parts === 'string') return parts;
    if (Array.isArray(parts)) {
        return parts.map(p => p.text || '').join('');
    }
    return parts.text || '';
}

export function formatRelativeTime(timestamp: number | string | undefined): string {
    if (!timestamp) return '';
    const date = typeof timestamp === 'number' ? new Date(timestamp) : new Date(timestamp);
    if (isNaN(date.getTime())) return String(timestamp);
    return date.toLocaleDateString();
}

export function escapeShellArg(arg: string, shellType: string = 'bash'): string {
    if (shellType === 'cmd' || shellType === 'powershell') {
        return `"${arg.replace(/"/g, '""')}"`;
    }
    return `'${arg.replace(/'/g, "'\\''")}'`;
}

export function getShellConfiguration(): { shell: string } {
    return { shell: process.platform === 'win32' ? 'powershell' : 'bash' };
}
