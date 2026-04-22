// @ts-nocheck
import * as cheerio from 'cheerio';
import { container } from '../../core/container.js';

/**
 * Scraper E-Commerce léger
 * Tente d'extraire les infos clés (Prix, Titre, Stock) d'une page produit.
 */
export const scraper = {

    /**
     * Visite une page et extrait les infos produit
     * @param {string} url 
     */
    async scrapeProductPage(url: any) {
        console.log(`[ShoppingScraper] 🕵️‍♂️ Visite: ${url}`);

        try {
            // 1. Fetch de la page (headers navigateur pour éviter blocage simple)
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7'
                }
            });

            if (!response.ok) {
                return { success: false, message: `Erreur HTTP ${response.status}` };
            }

            const html = await response.text();
            const $ = cheerio.load(html);

            const data = {
                title: null,
                price: null,
                currency: null,
                image: null,
                stock: null,
                url: url
            };

            // STRATÉGIE 1 : OpenGraph & Meta Tags (Le plus fiable pour le titre/image)
            data.title = $('meta[property="og:title"]').attr('content') || $('title').text();
            data.image = $('meta[property="og:image"]').attr('content');
            data.price = $('meta[property="product:price:amount"]').attr('content') ||
                $('meta[name="twitter:data1"]').attr('content'); // Parfois utilisé
            data.currency = $('meta[property="product:price:currency"]').attr('content');

            // STRATÉGIE 2 : Schema.org JSON-LD (Le Graal pour le E-Commerce)
            $('script[type="application/ld+json"]').each((i: any, el: any) => {
                try {
                    const json = JSON.parse($(el).html());
                    // On cherche un objet @type "Product"
                    const product = Array.isArray(json) ? json.find((i: any) => i['@type'] === 'Product') : (json['@type'] === 'Product' ? json : null);

                    if (product) {
                        if (!data.title) data.title = product.name;
                        if (!data.image) data.image = Array.isArray(product.image) ? product.image[0] : product.image;

                        // Gestion des offres
                        if (product.offers) {
                            const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
                            if (offer) {
                                if (!data.price) data.price = offer.price;
                                if (!data.currency) data.currency = offer.priceCurrency;

                                // Stock check
                                if (offer.availability) {
                                    data.stock = offer.availability.includes('InStock') ? 'En Stock' : 'Rupture';
                                }
                            }
                        }
                    }
                } catch (e: any) { /* Ignore JSON parse errors */ }
            });

            // STRATÉGIE 3 : Sélecteurs CSS Heuristiques (Si tout le reste échoue)
            // Jumia, Amazon, CDiscount patterns
            if (!data.price) {
                const priceSelectors = [
                    '.price', '#priceblock_ourprice', '.a-price-whole', // Amazon
                    '.-b -ltr -tal -fs24', // Jumia (très spécifique, peut casser)
                    '.product-price', '.current-price'
                ];
                for (const sel of priceSelectors) {
                    const txt = $(sel).first().text().trim();
                    if (txt) {
                        data.price = txt; // Sera une string brute genre "15 000 FCFA"
                        break;
                    }
                }
            }

            // Nettoyage final
            if (data.title) data.title = data.title.trim();
            if (data.price) {
                // Si c'est numérique pur, on garde. Si c'est du texte, on nettoie un peu.
            } else {
                data.price = "Prix non détecté (voir lien)";
            }

            return {
                success: true,
                data: data
            };

        } catch (error: any) {
            console.error('[ShoppingScraper] Parsing Error:', error);
            return { success: false, message: error.message };
        }
    }
};
