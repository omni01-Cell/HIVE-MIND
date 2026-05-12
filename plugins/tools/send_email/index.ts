// WHY: Email sending via n8n webhook automation (HiveMind-SendEmail workflow).
// The n8n workflow (Webhook → Send Email) handles SMTP delivery via Gmail.

interface SendEmailArgs {
    email: string;
    header: string;
    message: string;
}

interface SendEmailResult {
    success: boolean;
    message: string;
    data?: { email: string; header: string };
}

const N8N_WEBHOOK_URL = 'http://13.53.192.140:5678/webhook/hive-send-email';
const REQUEST_TIMEOUT_MS = 15_000;

export default {
    name: 'send_email',
    description: 'Sends an email to a recipient via the n8n automation workflow.',
    version: '2.0.0',
    enabled: true,

    toolDefinition: {
        type: 'function' as const,
        function: {
            name: 'send_email',
            description: 'Sends an email to a recipient. Supports HTML content in the message body.',
            parameters: {
                type: 'object',
                properties: {
                    email: {
                        type: 'string',
                        description: 'Recipient email address (e.g. user@example.com).'
                    },
                    header: {
                        type: 'string',
                        description: 'Email subject line.'
                    },
                    message: {
                        type: 'string',
                        description: 'Email body content. Supports HTML formatting.'
                    }
                },
                required: ['email', 'header', 'message']
            }
        }
    },

    async execute(args: SendEmailArgs): Promise<SendEmailResult> {
        const { email, header, message } = args;

        if (!email || !header || !message) {
            return {
                success: false,
                message: 'Missing required fields: email, header, and message are all required.'
            };
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return {
                success: false,
                message: `Invalid email address format: "${email}".`
            };
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        try {
            console.log(`[send_email] Sending email to ${email} via n8n webhook...`);

            const response = await fetch(N8N_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, header, message }),
                signal: controller.signal
            });

            if (!response.ok) {
                const errorBody = await response.text();
                return {
                    success: false,
                    message: `n8n webhook returned HTTP ${response.status}: ${errorBody}`
                };
            }

            console.log(`[send_email] Email queued successfully for ${email}.`);
            return {
                success: true,
                message: `Email sent successfully to ${email}.`,
                data: { email, header }
            };
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : String(error);
            const isTimeout = errMsg.includes('abort');
            console.error(`[send_email] ${isTimeout ? 'Timeout' : 'Error'} sending to ${email}:`, errMsg);
            return {
                success: false,
                message: isTimeout
                    ? `Email sending timed out after ${REQUEST_TIMEOUT_MS / 1000}s.`
                    : `Could not send email: ${errMsg}`
            };
        } finally {
            clearTimeout(timeoutId);
        }
    }
};
