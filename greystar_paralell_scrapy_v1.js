const puppeteer = require('puppeteer-core');
const fs = require('fs');

async function scrapeGreystarProperties() {
    console.log('Navegando a la página principal de Greystar...');

    // Crear un browser temporal solo para extraer los enlaces
    const tempBrowser = await puppeteer.launch({
        executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        headless: true,
        defaultViewport: { width: 1280, height: 720 },
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-default-apps',
            '--disable-extensions'
        ]
    });

    const tempPage = await tempBrowser.newPage();

    try {
        await tempPage.goto('https://www.greystar.com/properties', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log('Extrayendo enlaces de comunidades...');

        const communityLinks = await tempPage.evaluate(() => {
            const links = [];
            const sections = document.querySelectorAll('.sitemap-serp-section');

            sections.forEach(section => {
                const stateElement = section.querySelector('h2 a');
                const state = stateElement ? stateElement.textContent.trim() : '';

                const communityElements = section.querySelectorAll('.sitemap-serp-section-second-level h3 a');

                communityElements.forEach(communityElement => {
                    const communityName = communityElement.textContent.trim();
                    const communityUrl = communityElement.href;

                    if (communityName && communityUrl) {
                        links.push({
                            state,
                            communityName,
                            communityUrl
                        });
                    }
                });
            });

            return links;
        });

        await tempBrowser.close();

        console.log(`Total de comunidades encontradas: ${communityLinks.length}`);

        // Crear archivo CSV
        const csvHeaders = ['state_name', 'communityName', 'address', 'city', 'state_address', 'zip', 'phone', 'email'];
        fs.writeFileSync('greystar_properties.csv', csvHeaders.join(',') + '\n', 'utf8');

        // Dividir las comunidades en chunks para procesar en paralelo
        const CONCURRENT_WORKERS = 10;
        const chunks = [];
        for (let i = 0; i < communityLinks.length; i += Math.ceil(communityLinks.length / CONCURRENT_WORKERS)) {
            chunks.push(communityLinks.slice(i, i + Math.ceil(communityLinks.length / CONCURRENT_WORKERS)));
        }

        console.log(`Procesando ${communityLinks.length} comunidades con ${CONCURRENT_WORKERS} workers en paralelo...`);

        // Procesar chunks en paralelo
        const results = await Promise.all(
            chunks.map((chunk, index) => processChunk(chunk, index))
        );

        // Combinar resultados
        let totalProcessed = 0;
        results.forEach(result => {
            totalProcessed += result.processed;
        });

        console.log(`\n✓ Scraping completado! ${totalProcessed} comunidades procesadas`);
        console.log('Datos guardados en greystar_properties.csv');

    } catch (error) {
        console.error('Error durante el scraping:', error);
        await tempBrowser.close();
    }
}

async function processChunk(communities, workerIndex) {
    const browser = await puppeteer.launch({
        executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        headless: true,
        defaultViewport: { width: 1280, height: 720 },
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-default-apps',
            '--disable-extensions',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding'
        ]
    });

    const page = await browser.newPage();
    let processedCount = 0;

    try {
        console.log(`Worker ${workerIndex}: Procesando ${communities.length} comunidades`);

        for (const community of communities) {
            try {
                await page.goto(community.communityUrl, {
                    waitUntil: 'networkidle2',
                    timeout: 15000 // Reducido para ser más agresivo
                });

                await new Promise(resolve => setTimeout(resolve, 1000)); // Reducido

                const communityData = await page.evaluate(() => {
                    let fullAddress = '';
                    let phone = '';

                    // Método 1: Buscar en JSON-LD estructurado
                    const jsonScripts = document.querySelectorAll('script[type="application/ld+json"]');
                    for (const script of jsonScripts) {
                        try {
                            const data = JSON.parse(script.textContent);
                            if (data.address) {
                                if (typeof data.address === 'string') {
                                    fullAddress = data.address;
                                } else if (data.address.streetAddress) {
                                    fullAddress = `${data.address.streetAddress}, ${data.address.addressLocality}, ${data.address.addressRegion} ${data.address.postalCode}`;
                                }
                                break;
                            }
                        } catch (e) {
                            // Continuar si hay error parsing JSON
                        }
                    }

                    // Método 2: Buscar en meta tags
                    if (!fullAddress) {
                        const metaTags = document.querySelectorAll('meta[property], meta[name]');
                        for (const meta of metaTags) {
                            const content = meta.getAttribute('content');
                            if (content && content.match(/\d+.*?(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way).*?[A-Z]{2}\s+\d{5}/i)) {
                                fullAddress = content;
                                break;
                            }
                        }
                    }

                    // Método 3: Buscar en todo el texto de la página
                    if (!fullAddress) {
                        const bodyText = document.body.innerText || document.body.textContent;

                        const addressPatterns = [
                            /(\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Circle|Cir|Court|Ct|Place|Pl)\s*[A-Za-z\s]*,?\s*[A-Za-z\s]+,?\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?)/gi,
                            /(\d+[^,]*(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Circle|Cir|Court|Ct|Place|Pl)[^,]*,\s*[A-Za-z\s]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?)/gi
                        ];

                        for (const pattern of addressPatterns) {
                            const matches = bodyText.match(pattern);
                            if (matches && matches.length > 0) {
                                fullAddress = matches[0].trim();
                                break;
                            }
                        }
                    }

                    // Método 4: Buscar elementos específicos
                    if (!fullAddress) {
                        const addressSelectors = [
                            '[class*="address"]',
                            '[class*="location"]',
                            '[class*="contact"]',
                            '[data-*="address"]',
                            '.property-info',
                            '.contact-info'
                        ];

                        for (const selector of addressSelectors) {
                            const elements = document.querySelectorAll(selector);
                            for (const element of elements) {
                                const text = element.textContent.trim();
                                if (text.match(/\d+.*?(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way).*?[A-Z]{2}\s+\d{5}/i)) {
                                    fullAddress = text;
                                    break;
                                }
                            }
                            if (fullAddress) break;
                        }
                    }

                    // Buscar teléfono
                    const phoneElement = document.querySelector('a[href^="tel:"]');
                    if (phoneElement) {
                        phone = phoneElement.href.replace('tel:', '').trim();
                        phone = phone.replace(/\D/g, '');
                        if (phone.length === 10) {
                            phone = `+1 ${phone.substring(0, 3)} ${phone.substring(3, 6)} ${phone.substring(6)}`;
                        } else if (phone.length === 11 && phone.startsWith('1')) {
                            phone = `+1 ${phone.substring(1, 4)} ${phone.substring(4, 7)} ${phone.substring(7)}`;
                        }
                    }

                    if (!phone) {
                        const allText = document.body.textContent;
                        const phonePattern = /(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/;
                        const phoneMatch = allText.match(phonePattern);
                        if (phoneMatch) {
                            phone = `+1 ${phoneMatch[1]} ${phoneMatch[2]} ${phoneMatch[3]}`;
                        }
                    }

                    return {
                        fullAddress: fullAddress.replace(/\s+/g, ' ').trim(),
                        phone: phone.replace(/\s+/g, ' ').trim()
                    };
                });

                // Parsear dirección
                const addressParts = parseAddress(communityData.fullAddress);

                // Construir email
                let email = '';
                if (community.communityName) {
                    const cleanName = community.communityName
                        .toLowerCase()
                        .replace(/[^a-z0-9\s]/g, '')
                        .replace(/\s+/g, '')
                        .trim();

                    if (cleanName) {
                        email = `${cleanName}mgr@greystar.com`;
                    }
                }

                const csvData = [
                    community.state,
                    community.communityName,
                    addressParts.address,
                    addressParts.city,
                    addressParts.state,
                    addressParts.zip,
                    communityData.phone,
                    email
                ];

                const escapedData = csvData.map(value => {
                    if (typeof value === 'string' && value.includes(',')) {
                        return `"${value.replace(/"/g, '""')}"`;
                    }
                    return value || '';
                });

                // Escribir de forma sincronizada para evitar conflictos
                fs.appendFileSync('greystar_properties.csv', escapedData.join(',') + '\n', 'utf8');

                processedCount++;
                console.log(`Worker ${workerIndex}: Procesado ${processedCount}/${communities.length} - ${community.communityName}`);

            } catch (error) {
                console.error(`Worker ${workerIndex}: Error procesando ${community.communityName}:`, error.message);
                
                // Agregar fila con error
                const csvData = [
                    community.state,
                    community.communityName,
                    '', '', '', '', '', // address, city, state, zip, phone
                    community.communityName ? `${community.communityName.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '')}mgr@greystar.com` : ''
                ];

                const escapedData = csvData.map(value => {
                    if (typeof value === 'string' && value.includes(',')) {
                        return `"${value.replace(/"/g, '""')}"`;
                    }
                    return value || '';
                });

                fs.appendFileSync('greystar_properties.csv', escapedData.join(',') + '\n', 'utf8');
            }

            // Pausa muy corta entre requests
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        console.log(`Worker ${workerIndex}: Completado - ${processedCount} comunidades procesadas`);
        
    } catch (error) {
        console.error(`Worker ${workerIndex}: Error general:`, error);
    } finally {
        await browser.close();
    }

    return { processed: processedCount };
}

// Función para parsear dirección (misma que antes)
function parseAddress(fullAddress) {
    if (!fullAddress) {
        return { address: '', city: '', state: '', zip: '' };
    }

    const cleanAddress = fullAddress.replace(/\s+/g, ' ').trim();
    const pattern = /^(.+?)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/;
    const match = cleanAddress.match(pattern);

    if (match) {
        const beforeStateZip = match[1].trim();
        const state = match[2].trim();
        const zip = match[3].trim();

        const streetTypes = ['Street', 'St', 'Avenue', 'Ave', 'Road', 'Rd', 'Boulevard', 'Blvd', 'Drive', 'Dr', 'Lane', 'Ln', 'Way', 'Circle', 'Cir', 'Court', 'Ct', 'Place', 'Pl', 'Highway', 'Hwy'];

        for (const streetType of streetTypes) {
            const streetPattern = new RegExp(`^(.+?\\s+${streetType})(?:\\s+(.+))?$`, 'i');
            const streetMatch = beforeStateZip.match(streetPattern);

            if (streetMatch) {
                const address = streetMatch[1].trim();
                const city = streetMatch[2] ? streetMatch[2].trim() : '';

                return { address, city, state, zip };
            }
        }

        const words = beforeStateZip.split(' ');
        if (words.length >= 4) {
            const address = words.slice(0, 3).join(' ');
            const city = words.slice(3).join(' ');
            return { address, city, state, zip };
        } else if (words.length >= 2) {
            const midPoint = Math.floor(words.length / 2);
            const address = words.slice(0, midPoint).join(' ');
            const city = words.slice(midPoint).join(' ');
            return { address, city, state, zip };
        }
    }

    return { address: fullAddress, city: '', state: '', zip: '' };
}

// Ejecutar la función
scrapeGreystarProperties();