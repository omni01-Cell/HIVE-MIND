// Email sending plugin via external automation

export default {
    name: 'send_email',
    description: 'Sends an email to a recipient.',
    version: '1.0.0',
    enabled: true,

    toolDefinition: {
        type: 'function',
        function: {
            name: 'send_email',
            description: 'Sends an email to a recipient.',
            parameters: {
                type: 'object',
                properties: {
                    email: {
                        type: 'string',
                        description: 'Recipient email address.'
                    },
                    header: {
                        type: 'string',
                        description: 'Email subject.'
                    },
                    message: {
                        type: 'string',
                        description: 'Detailed email content.'
                    }
                },
                required: ['email', 'header', 'message']
            }
        }
    },

    async execute(args: any, context: any, toolName?: string) {
        const { email, header, message } = args;
        const { sender } = context || {};

        // Webhook URL (to be configured with the email sending workflow)
        const WEBHOOK_URL = 'https://idarkshelly-idarshelly.hf.space/webhook/n8n-email-webhook';

        try {
            console.log(`[send_email] Sending email to ${email}...`);
            
            const response = await fetch(WEBHOOK_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email,
                    header,
                    message
                })
            });

            if (!response.ok) {
                const errorData = await response.text();
                throw new Error(`External service responded with error: ${response.status} - ${errorData}`);
            }

            return {
                success: true,
                message: `Email sent successfully to ${email}.`,
                data: { email, header }
            };

        } catch (error: any) {
            console.error('[send_email] Error during sending:', error);
            return {
                success: false,
                message: `Could not send email: ${error.message}`
            };
        }
    }
};
