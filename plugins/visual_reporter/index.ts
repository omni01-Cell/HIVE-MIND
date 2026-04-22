import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const plugin = {
    name: 'visual_reporter',
    version: '1.0.0',
    description: 'Génère des rapports visuels (PDF, Graphiques) pour prouver le travail.',

    tools: [
        {
            name: 'generate_pdf_report',
            description: 'Génère un rapport PDF professionnel avec titre, contenu formaté et métadonnées. Utile pour résumer des recherches ou des longues analyses.',
            parameters: {
                type: 'object',
                properties: {
                    title: { type: 'string', description: 'Le titre principal du rapport' },
                    content: { type: 'string', description: 'Le corps du texte. Supporte les sauts de ligne (\\n).' },
                    filename: { type: 'string', description: 'Nom du fichier sans extension (ex: rapport_veille)' },
                    sections: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                heading: { type: 'string' },
                                text: { type: 'string' }
                            }
                        },
                        description: 'Optionnel: Sections structurées pour un meilleur formatage'
                    }
                },
                required: ['title', 'content', 'filename']
            }
        }
    ],

    /**
     * Exécute l'outil demandé (Standard Loader Signature)
     */
    async execute(args: any, context: any, toolName: any) {
        const { transport, chatId } = context;
        if (toolName === 'generate_pdf_report') {
            return await this.generatePdfReport(args, transport, chatId);
        }
        throw new Error(`Outil inconnu: ${toolName}`);
    },

    /**
     * Génère un PDF et l'envoie
     */
    async generatePdfReport({ title, content, filename, sections }: any, transport: any, chatId: any) {
        try {
            const safeFilename = (filename || 'rapport').replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const tempDir = path.join(__dirname, '..', '..', 'temp');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

            const filePath = path.join(tempDir, `${safeFilename}_${Date.now()}.pdf`);

            // Création du document
            const doc = new PDFDocument({ margin: 50 });
            const stream = fs.createWriteStream(filePath);
            doc.pipe(stream);

            // Header
            doc.fontSize(20).text(title, { align: 'center', underline: true });
            doc.moveDown();
            doc.fontSize(10).text(`Généré par Erina (Bot WhatsApp) - ${new Date().toLocaleString()}`, { align: 'right', italic: true });
            doc.moveDown(2);

            // Contenu Principal
            doc.fontSize(12).text(content, {
                align: 'justify',
                paragraphGap: 5
            });

            // Sections Optionnelles
            if (sections && Array.isArray(sections)) {
                doc.moveDown();
                for (const section of sections) {
                    if (section.heading) {
                        doc.moveDown();
                        doc.fontSize(14).text(section.heading, { bold: true });
                        doc.moveDown(0.5);
                    }
                    if (section.text) {
                        doc.fontSize(12).text(section.text, { align: 'justify', paragraphGap: 5 });
                    }
                }
            }

            // Footer
            doc.fontSize(8).text('HiveMind V3 Architecture - Antigravity Agent', 50, doc.page.height - 50, {
                align: 'center',
                color: 'grey'
            });

            doc.end();

            // Attendre la fin de l'écriture
            await new Promise((resolve: any) => stream.on('finish', resolve));

            // Envoyer le document
            await transport.sendFile(chatId, filePath, `${title}.pdf`, `📄 Voici le rapport demandé : *${title}*`);

            // Nettoyage (Optionnel : on garde un peu pour debug ou on supprime ?)
            // Pour l'instant on garde, un job cron (tempCleanup) s'en chargera

            return {
                success: true,
                message: `PDF généré et envoyé : ${filePath}`,
                file_path: filePath
            };

        } catch (error: any) {
            console.error('[VisualReporter] Erreur génération PDF:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
};

export default plugin;
