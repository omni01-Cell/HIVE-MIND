// plugins/send_email/index.js
// Plugin pour envoyer des emails via une automatisation externe

export default {
    name: 'send_email',
    description: 'Envoie un email à un destinataire.',
    version: '1.0.0',
    enabled: true,

    toolDefinition: {
        type: 'function',
        function: {
            name: 'send_email',
            description: 'Envoie un email à un destinataire.',
            parameters: {
                type: 'object',
                properties: {
                    email: {
                        type: 'string',
                        description: 'L\'adresse email du destinataire.'
                    },
                    header: {
                        type: 'string',
                        description: 'Le sujet de l\'email.'
                    },
                    message: {
                        type: 'string',
                        description: 'Le contenu détaillé de l\'email.'
                    }
                },
                required: ['email', 'header', 'message']
            }
        }
    },

    async execute(args: any, context: any) {
        const { email, header, message } = args;
        
        // URL du Webhook (à configurer avec le workflow d'envoi d'email)
        const WEBHOOK_URL = 'https://idarkshelly-idarshelly.hf.space/webhook/n8n-email-webhook';

        try {
            console.log(`[send_email] Envoi d'email à ${email}...`);
            
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
                throw new Error(`Le service externe a répondu avec l'erreur: ${response.status} - ${errorData}`);
            }

            return {
                success: true,
                message: `L'email a été envoyé avec succès à ${email}.`,
                data: { email, header }
            };

        } catch (error: any) {
            console.error('[send_email] Erreur lors de l\'envoi:', error);
            return {
                success: false,
                message: `Impossible d'envoyer l'email : ${error.message}`
            };
        }
    }
};
