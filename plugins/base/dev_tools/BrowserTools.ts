import { browserService } from '../../../services/browser/BrowserService.js';

const MAX_SNAPSHOT_LENGTH = 50000;

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

export default {
    name: 'dev_tools_browser',
    description: 'SOTA web navigation tools (agent-browser). Allows navigating, clicking, filling forms, and extracting content.',
    version: '1.0.0',
    enabled: true,

    toolDefinitions: [
        {
            type: 'function',
            function: {
                name: 'browser_open',
                description: 'Opens a URL in the browser.',
                parameters: {
                    type: 'object',
                    properties: {
                        url: { type: 'string', description: 'The URL to open.' }
                    },
                    required: ['url']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'browser_snapshot',
                description: 'Captures the accessibility tree of the current page with references (@e1, @e2...).',
                parameters: {
                    type: 'object',
                    properties: {
                        interactive_only: { type: 'boolean', description: 'If true, only returns interactive elements.', default: true }
                    }
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'browser_click',
                description: 'Clicks an element via its reference (@eN) or a CSS selector.',
                parameters: {
                    type: 'object',
                    properties: {
                        selector: { type: 'string', description: 'The reference (@e1) or CSS selector.' }
                    },
                    required: ['selector']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'browser_fill',
                description: 'Fills a form field after clearing it.',
                parameters: {
                    type: 'object',
                    properties: {
                        selector: { type: 'string', description: 'The reference (@e1) or CSS selector.' },
                        value: { type: 'string', description: 'The value to enter.' }
                    },
                    required: ['selector', 'value']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'browser_type',
                description: 'Types text character by character (useful for autocomplete).',
                parameters: {
                    type: 'object',
                    properties: {
                        selector: { type: 'string', description: 'The reference (@e1) or CSS selector.' },
                        text: { type: 'string', description: 'The text to type.' }
                    },
                    required: ['selector', 'text']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'browser_screenshot',
                description: 'Captures a screenshot of the current page. You MUST provide a descriptive filename (e.g. "hacker_news_home", "github_trending").',
                parameters: {
                    type: 'object',
                    properties: {
                        name: { type: 'string', description: 'Descriptive filename for the screenshot (without extension).' },
                        url: { type: 'string', description: 'Optional URL to navigate to before taking the screenshot. Very useful if you haven\'t opened the page yet.' },
                        full_page: { type: 'boolean', description: 'If true, takes a full-page screenshot capturing the entire scrollable content.' }
                    },
                    required: ['name']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'browser_get_text',
                description: 'Extracts text from an element.',
                parameters: {
                    type: 'object',
                    properties: {
                        selector: { type: 'string', description: 'The reference (@e1) or CSS selector.' }
                    },
                    required: ['selector']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'browser_eval',
                description: 'Executes JavaScript in the context of the page.',
                parameters: {
                    type: 'object',
                    properties: {
                        javascript: { type: 'string', description: 'The JS code to execute.' }
                    },
                    required: ['javascript']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'browser_scroll',
                description: 'Scrolls the page.',
                parameters: {
                    type: 'object',
                    properties: {
                        direction: { type: 'string', enum: ['up', 'down', 'left', 'right'], description: 'Scroll direction.' },
                        pixels: { type: 'number', description: 'Number of pixels to scroll.' }
                    },
                    required: ['direction']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'browser_wait',
                description: 'Waits for an element, text, or URL pattern to appear.',
                parameters: {
                    type: 'object',
                    properties: {
                        selector: { type: 'string', description: 'Selector to wait for.' },
                        text: { type: 'string', description: 'Text to wait for.' },
                        url: { type: 'string', description: 'URL to wait for.' },
                        timeout: { type: 'number', description: 'Timeout in ms.' }
                    }
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'browser_press',
                description: 'Presses a key on the keyboard.',
                parameters: {
                    type: 'object',
                    properties: {
                        key: { type: 'string', description: 'The key (Enter, Tab, Escape...).' }
                    },
                    required: ['key']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'browser_back',
                description: 'Goes back to the previous page.',
                parameters: { type: 'object', properties: {} }
            }
        },
        {
            type: 'function',
            function: {
                name: 'browser_close',
                description: 'Closes the current browsing session.',
                parameters: { type: 'object', properties: {} }
            }
        }
    ],

    async execute(args: any, context: any, toolName: string) {
        const { chatId } = context;
        const session = browserService.getSessionName(chatId);

        try {
            if (context.onProgress) context.onProgress(`Browser: ${toolName}...`);

            let result: any;

            switch (toolName) {
                case 'browser_open':
                    result = await browserService.open(args.url, session);
                    if (result.success) {
                        // Implicitly wait for SPA rendering
                        await delay(3000);
                    }
                    break;
                case 'browser_snapshot':
                    result = await browserService.snapshot(session, args.interactive_only ?? true);
                    break;
                case 'browser_click':
                    result = await browserService.click(args.selector, session);
                    break;
                case 'browser_fill':
                    result = await browserService.fill(args.selector, args.value, session);
                    break;
                case 'browser_type':
                    result = await browserService.type(args.selector, args.text, session);
                    break;
                case 'browser_screenshot':
                    // Auto-navigate if URL is provided
                    if (args.url) {
                        const openRes = await browserService.open(args.url, session);
                        if (openRes.success) {
                            await delay(3000);
                        }
                    }

                    // Wait for any pending animations or lazy-loaded content
                    await delay(2000);
                    
                    // Prevent transparent backgrounds from rendering as black
                    await browserService.evaluate('if(!document.body.style.backgroundColor) document.body.style.backgroundColor = "white";', session);
                    
                    let baseName = args.name;
                    if (!baseName) {
                        try {
                            const titleResult = await browserService.evaluate('document.title', session);
                            if (titleResult && titleResult.success && titleResult.data && titleResult.data.result) {
                                baseName = titleResult.data.result.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').substring(0, 30);
                            }
                        } catch(e) {}
                        if (!baseName) baseName = "page_capture";
                    }

                    const fileName = `screenshot_${baseName}_${Date.now()}.png`;
                    
                    result = await browserService.screenshot(session, fileName, args.full_page);
                    break;
                case 'browser_get_text':
                    result = await browserService.getText(args.selector, session);
                    break;
                case 'browser_eval':
                    result = await browserService.evaluate(args.javascript, session);
                    break;
                case 'browser_scroll':
                    result = await browserService.scroll(args.direction, args.pixels, session);
                    break;
                case 'browser_wait':
                    result = await browserService.wait(args, session);
                    break;
                case 'browser_press':
                    result = await browserService.press(args.key, session);
                    break;
                case 'browser_back':
                    result = await browserService.back(session);
                    break;
                case 'browser_close':
                    result = await browserService.close(session);
                    break;
                default:
                    return { success: false, message: `Unknown browser tool: ${toolName}` };
            }

            if (!result.success) {
                return {
                    success: false,
                    llmOutput: `Browser Error (${toolName}): ${result.error}`,
                    userOutput: `❌ *Browser Error* (${toolName}): ${result.error}`
                };
            }

            // Troncature pour Snapshot
            if (toolName === 'browser_snapshot' && result.snapshot && result.snapshot.length > MAX_SNAPSHOT_LENGTH) {
                result.snapshot = result.snapshot.substring(0, MAX_SNAPSHOT_LENGTH) + '\n... [TRUNCATED]';
            }

            // For screenshot, we send the file to the user
            if (toolName === 'browser_screenshot' && result.filePath && context.transport) {
                await context.transport.sendMedia(chatId, result.filePath, { caption: 'Screenshot' }, context.sourceChannel);
            }

            return {
                success: true,
                llmOutput: result,
                userOutput: `🌐 *Browser* (${toolName}): ✅ Success`
            };

        } catch (error: any) {
            return {
                success: false,
                llmOutput: `Fatal Browser Error (${toolName}): ${error.message}`,
                userOutput: `❌ *Browser Fatal Error* (${toolName}): ${error.message}`
            };
        }
    }
};
