const puppeteer = require('puppeteer-core');
const fs = require('fs');

async function scrapeGreystarProperties() {
    const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    defaultViewport: { width: 1280, height: 720 }, // Viewport fijo más pequeño
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

    try {
        console.log('Navegando a la página principal de Greystar...');

        await page.goto('https://www.greystar.com/properties', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log('Extrayendo enlaces de comunidades...');

        const communityLinks = await page.evaluate(() => {
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

        console.log(`Total de comunidades encontradas: ${communityLinks.length}`);

        const csvHeaders = ['state', 'communityName', 'address', 'city', 'state', 'zip', 'phone', 'email'];
        fs.writeFileSync('greystar_properties.csv', csvHeaders.join(',') + '\n', 'utf8');

        let processedCount = 0;
        const totalLinks = communityLinks.length;

        for (const community of communityLinks) {
            processedCount++;
            console.log(`\nProcesando ${processedCount}/${totalLinks}: ${community.communityName} (${community.state})`);

            try {
                await page.goto(community.communityUrl, {
                    waitUntil: 'networkidle2',
                    timeout: 20000
                });

                await new Promise(resolve => setTimeout(resolve, 2000));

                // Enfoque completamente nuevo para extraer la dirección
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

                        // Buscar patrones completos de dirección en el texto
                        const addressPatterns = [
                            // Patrón 1: Número + Calle + Tipo + Ciudad + Estado + Código postal
                            /(\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Circle|Cir|Court|Ct|Place|Pl)\s*[A-Za-z\s]*,?\s*[A-Za-z\s]+,?\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?)/gi,
                            // Patrón 2: Dirección más flexible
                            /(\d+[^,]*(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Circle|Cir|Court|Ct|Place|Pl)[^,]*,\s*[A-Za-z\s]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?)/gi
                        ];

                        for (const pattern of addressPatterns) {
                            const matches = bodyText.match(pattern);
                            if (matches && matches.length > 0) {
                                // Tomar la primera coincidencia válida
                                fullAddress = matches[0].trim();
                                break;
                            }
                        }
                    }

                    // Método 4: Buscar elementos específicos que contengan direcciones
                    if (!fullAddress) {
                        // Buscar en elementos que comúnmente contienen direcciones
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

                    console.log('Dirección encontrada:', fullAddress);
                    return {
                        fullAddress: fullAddress.replace(/\s+/g, ' ').trim(),
                        phone: phone.replace(/\s+/g, ' ').trim()
                    };
                });

                // Función mejorada para parsear la dirección específicamente para estos formatos
                function parseAddress(fullAddress) {
                    if (!fullAddress) {
                        return { address: '', city: '', state: '', zip: '' };
                    }

                    console.log('Parseando dirección:', fullAddress);

                    const cleanAddress = fullAddress.replace(/\s+/g, ' ').trim();

                    // Patrón específico para formato: "dirección ciudad ESTADO código_postal"
                    const pattern = /^(.+?)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/;
                    const match = cleanAddress.match(pattern);

                    if (match) {
                        const beforeStateZip = match[1].trim(); // Todo antes del estado y código postal
                        const state = match[2].trim();
                        const zip = match[3].trim();

                        // Separar dirección de ciudad
                        // Buscar tipos de calle comunes
                        const streetTypes = ['Street', 'St', 'Avenue', 'Ave', 'Road', 'Rd', 'Boulevard', 'Blvd', 'Drive', 'Dr', 'Lane', 'Ln', 'Way', 'Circle', 'Cir', 'Court', 'Ct', 'Place', 'Pl', 'Highway', 'Hwy'];

                        for (const streetType of streetTypes) {
                            const streetPattern = new RegExp(`^(.+?\\s+${streetType})(?:\\s+(.+))?$`, 'i');
                            const streetMatch = beforeStateZip.match(streetPattern);

                            if (streetMatch) {
                                const address = streetMatch[1].trim();
                                const city = streetMatch[2] ? streetMatch[2].trim() : '';

                                return {
                                    address: address,
                                    city: city,
                                    state: state,
                                    zip: zip
                                };
                            }
                        }

                        // Si no encontramos tipo de calle, dividir por número de palabras
                        const words = beforeStateZip.split(' ');
                        if (words.length >= 4) {
                            // Asumir que las primeras 3+ palabras son la dirección y el resto la ciudad
                            const address = words.slice(0, 3).join(' ');
                            const city = words.slice(3).join(' ');

                            return {
                                address: address,
                                city: city,
                                state: state,
                                zip: zip
                            };
                        } else if (words.length >= 2) {
                            // Si hay pocas palabras, dividir por la mitad
                            const midPoint = Math.floor(words.length / 2);
                            const address = words.slice(0, midPoint).join(' ');
                            const city = words.slice(midPoint).join(' ');

                            return {
                                address: address,
                                city: city,
                                state: state,
                                zip: zip
                            };
                        }
                    }

                    // Si no se puede parsear, devolver todo en address
                    return {
                        address: fullAddress,
                        city: '',
                        state: '',
                        zip: ''
                    };
                }

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

                fs.appendFileSync('greystar_properties.csv', escapedData.join(',') + '\n', 'utf8');

                console.log(`✓ Procesado: ${community.communityName}`);
                console.log(`  Dirección completa: ${communityData.fullAddress}`);
                console.log(`  Dirección: ${addressParts.address}`);
                console.log(`  Ciudad: ${addressParts.city}`);
                console.log(`  Estado: ${addressParts.state}`);
                console.log(`  Código postal: ${addressParts.zip}`);
                console.log(`  Teléfono: ${communityData.phone || 'No encontrado'}`);
                console.log(`  Email: ${email}`);

            } catch (error) {
                console.error(`✗ Error procesando ${community.communityName}:`, error.message);

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

            await new Promise(resolve => setTimeout(resolve, 2000));

            // Límite para pruebas
            // if (processedCount >= 5) {
            //     console.log('Límite de prueba alcanzado');
            //     break;
            // }
        }

        console.log(`\n✓ Scraping completado! ${processedCount} comunidades procesadas`);
        console.log('Datos guardados en greystar_properties.csv');

    } catch (error) {
        console.error('Error durante el scraping:', error);

        try {
            await page.screenshot({ path: 'greystar_error_screenshot.png', fullPage: true });
            console.log('Screenshot de error guardado');
        } catch (e) {
            console.log('No se pudo guardar screenshot');
        }
    } finally {
        await browser.close();
    }
}

scrapeGreystarProperties();