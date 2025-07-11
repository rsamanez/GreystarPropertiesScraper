const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

// Archivos para persistencia
const LINKS_FILE = 'greystar_links.json';
const PROGRESS_FILE = 'greystar_progress.json';
const CSV_FILE = 'greystar_properties.csv';

async function scrapeGreystarProperties() {
    console.log('Iniciando scraping de Greystar Properties...');

    let communityLinks = [];
    let processedUrls = new Set();

    // Paso 1: Cargar o extraer enlaces
    if (fs.existsSync(LINKS_FILE)) {
        console.log('Archivo de enlaces encontrado, cargando enlaces existentes...');
        const linksData = loadLinks();
        communityLinks = linksData.links || linksData;
    } else {
        console.log('Archivo de enlaces no encontrado, extrayendo enlaces...');
        communityLinks = await extractLinks();
        saveLinks(communityLinks);
    }

    // Paso 2: Cargar progreso previo si existe
    if (fs.existsSync(PROGRESS_FILE)) {
        console.log('Archivo de progreso encontrado, cargando progreso previo...');
        const progressData = loadProgress();
        processedUrls = new Set(progressData.processedUrls);
        console.log(`Progreso previo: ${processedUrls.size} URLs ya procesadas`);
    } else {
        console.log('No hay progreso previo, iniciando desde cero...');
        initializeProgress();
    }

    // Paso 3: Filtrar enlaces ya procesados
    const remainingLinks = communityLinks.filter(link => !processedUrls.has(link.communityUrl));
    console.log(`Total de enlaces: ${communityLinks.length}`);
    console.log(`Ya procesados: ${processedUrls.size}`);
    console.log(`Restantes por procesar: ${remainingLinks.length}`);

    if (remainingLinks.length === 0) {
        console.log('✓ Todos los enlaces ya han sido procesados!');
        return;
    }

    // Paso 4: Inicializar CSV si no existe
    initializeCSV();

    // Paso 5: Procesar enlaces restantes en paralelo
    await processLinksInParallel(remainingLinks);

    console.log('✓ Scraping completado exitosamente!');
}

async function extractLinks() {
    console.log('Navegando a la página principal de Greystar...');

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
            timeout: 60000
        });

        await new Promise(resolve => setTimeout(resolve, 5000));

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
        return communityLinks;

    } catch (error) {
        console.error('Error extrayendo enlaces:', error);
        await tempBrowser.close();
        throw error;
    }
}

async function processLinksInParallel(communityLinks) {
    const CONCURRENT_WORKERS = 10;
    const chunks = [];
    const chunkSize = Math.ceil(communityLinks.length / CONCURRENT_WORKERS);
    
    for (let i = 0; i < communityLinks.length; i += chunkSize) {
        chunks.push(communityLinks.slice(i, i + chunkSize));
    }

    console.log(`Procesando ${communityLinks.length} comunidades con ${CONCURRENT_WORKERS} workers en paralelo...`);

    const results = await Promise.all(
        chunks.map((chunk, index) => processChunk(chunk, index))
    );

    let totalProcessed = 0;
    results.forEach(result => {
        totalProcessed += result.processed;
    });

    console.log(`\n✓ Procesamiento completado! ${totalProcessed} comunidades procesadas en esta sesión`);
}

// Función para validar que el registro tenga datos mínimos requeridos
function isValidRecord(communityData, addressParts, community) {
    const hasPhone = communityData.phone && communityData.phone.trim() !== '';
    const hasZip = addressParts.zip && addressParts.zip.trim() !== '';
    const hasState = addressParts.state && addressParts.state.trim() !== '';
    const hasAddressOrCity = (addressParts.address && addressParts.address.trim() !== '') || 
                            (addressParts.city && addressParts.city.trim() !== '');
    
    return hasPhone && hasZip && hasState && hasAddressOrCity;
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
    const processedUrls = [];

    try {
        console.log(`Worker ${workerIndex}: Procesando ${communities.length} comunidades`);

        for (const community of communities) {
            try {
                await page.goto(community.communityUrl, {
                    waitUntil: 'networkidle2',
                    timeout: 20000
                });

                await new Promise(resolve => setTimeout(resolve, 1000));

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

                // VALIDAR DATOS ANTES DE GUARDAR
                if (!isValidRecord(communityData, addressParts, community)) {
                    console.log(`Worker ${workerIndex}: ⚠️  Registro incompleto omitido - ${community.communityName}`);
                    console.log(`  - Teléfono: ${communityData.phone || 'NO'}`);
                    console.log(`  - Código postal: ${addressParts.zip || 'NO'}`);
                    console.log(`  - Estado: ${addressParts.state || 'NO'}`);
                    console.log(`  - Dirección/Ciudad: ${addressParts.address || addressParts.city || 'NO'}`);
                    
                    // Marcar como procesado pero no guardar en CSV
                    processedUrls.push(community.communityUrl);
                    processedCount++;

                    // IMPORTANTE: Actualizar progreso inmediatamente
                    updateProgress([community.communityUrl]);
                    continue; // Saltar al siguiente registro
                }

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

                // Escribir al CSV solo si pasó la validación
                writeToCSV(csvData);

                // Marcar como procesado
                processedUrls.push(community.communityUrl);
                processedCount++;

                console.log(`Worker ${workerIndex}: ✓ Procesado ${processedCount}/${communities.length} - ${community.communityName}`);

                // IMPORTANTE: Actualizar progreso inmediatamente después de cada registro
                updateProgress([community.communityUrl]);

            } catch (error) {
                console.error(`Worker ${workerIndex}: ✗ Error procesando ${community.communityName}:`, error.message);
                
                // Marcar como procesado pero no guardar datos erróneos
                processedUrls.push(community.communityUrl);
                processedCount++;

                // IMPORTANTE: Actualizar progreso incluso en caso de error
                updateProgress([community.communityUrl]);
            }

            // Pausa entre requests
            await new Promise(resolve => setTimeout(resolve, 800));
        }

       // Actualizar progreso final del worker (por si acaso)
        updateProgress(processedUrls);

        console.log(`Worker ${workerIndex}: Completado - ${processedCount} comunidades procesadas`);
        
    } catch (error) {
        console.error(`Worker ${workerIndex}: Error general:`, error);

        // Guardar progreso aunque haya error general
        if (processedUrls.length > 0) {
            updateProgress(processedUrls);
        }
    } finally {
        await browser.close();
    }

    return { processed: processedCount };
}

// Funciones de utilidad para manejo de archivos
function loadLinks() {
    try {
        const data = fs.readFileSync(LINKS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error cargando enlaces:', error);
        return [];
    }
}

function saveLinks(links) {
    try {
        const data = {
            extractedAt: new Date().toISOString(),
            totalLinks: links.length,
            links: links
        };
        fs.writeFileSync(LINKS_FILE, JSON.stringify(data, null, 2), 'utf8');
        console.log(`✓ Enlaces guardados en ${LINKS_FILE}`);
    } catch (error) {
        console.error('Error guardando enlaces:', error);
    }
}

function loadProgress() {
    try {
        const data = fs.readFileSync(PROGRESS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error cargando progreso:', error);
        return { processedUrls: [] };
    }
}

function initializeProgress() {
    const progressData = {
        startedAt: new Date().toISOString(),
        processedUrls: []
    };
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progressData, null, 2), 'utf8');
}

function updateProgress(newProcessedUrls) {
    try {
        let currentProgress;
        
        // Intentar cargar progreso existente
        if (fs.existsSync(PROGRESS_FILE)) {
            currentProgress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
        } else {
            currentProgress = { 
                startedAt: new Date().toISOString(),
                processedUrls: [] 
            };
        }
        
        // Combinar URLs procesadas (evitar duplicados)
        const allProcessedUrls = [...new Set([...currentProgress.processedUrls, ...newProcessedUrls])];
        
        const updatedProgress = {
            startedAt: currentProgress.startedAt,
            processedUrls: allProcessedUrls,
            lastUpdated: new Date().toISOString(),
            totalProcessed: allProcessedUrls.length
        };
        
        // Escribir de forma sincronizada
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(updatedProgress, null, 2), 'utf8');
        
        // Log para debug
        console.log(`📊 Progreso actualizado: ${allProcessedUrls.length} URLs procesadas`);
        
    } catch (error) {
        console.error('Error actualizando progreso:', error);
        
        // Fallback: escribir directamente
        const fallbackProgress = {
            startedAt: new Date().toISOString(),
            processedUrls: newProcessedUrls,
            lastUpdated: new Date().toISOString(),
            totalProcessed: newProcessedUrls.length,
            error: error.message
        };
        
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(fallbackProgress, null, 2), 'utf8');
    }
}

function initializeCSV() {
    if (!fs.existsSync(CSV_FILE)) {
        const csvHeaders = ['state_name', 'communityName', 'address', 'city', 'state_code', 'zip', 'phone', 'email'];
        fs.writeFileSync(CSV_FILE, csvHeaders.join(',') + '\n', 'utf8');
        console.log(`✓ Archivo CSV inicializado: ${CSV_FILE}`);
    }
}

function writeToCSV(csvData) {
    const escapedData = csvData.map(value => {
        if (typeof value === 'string' && value.includes(',')) {
            return `"${value.replace(/"/g, '""')}"`;
        }
        return value || '';
    });

    fs.appendFileSync(CSV_FILE, escapedData.join(',') + '\n', 'utf8');
}

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

// Ejecutar la función principal
scrapeGreystarProperties().catch(console.error);