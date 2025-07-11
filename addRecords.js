const fs = require('fs');
const path = require('path');

function processCSVFiles() {
    try {
        // Leer el archivo principal (greystar_properties.csv)
        const mainFilePath = path.join(__dirname, 'greystar_properties.csv');
        const mainFileContent = fs.readFileSync(mainFilePath, 'utf8');
        
        // Leer el archivo paralelo (greystar_properties_paralell.csv)
        const parallelFilePath = path.join(__dirname, 'greystar_properties_paralell.csv');
        const parallelFileContent = fs.readFileSync(parallelFilePath, 'utf8');
        
        // Parsear CSV principal
        const mainLines = mainFileContent.split('\n').filter(line => line.trim() !== '');
        const mainHeader = mainLines[0];
        const mainRecords = mainLines.slice(1);
        
        // Parsear CSV paralelo
        const parallelLines = parallelFileContent.split('\n').filter(line => line.trim() !== '');
        const parallelRecords = parallelLines.slice(1);
        
        // Extraer todos los teléfonos del archivo paralelo
        const parallelPhones = new Set();
        
        parallelRecords.forEach(record => {
            const columns = parseCSVLine(record);
            if (columns.length >= 7) {
                const phone = columns[6].trim(); // Campo phone está en la posición 6
                if (phone && phone !== '') {
                    parallelPhones.add(phone);
                }
            }
        });
        
        console.log(`Archivo principal: ${mainRecords.length} registros`);
        console.log(`Archivo paralelo: ${parallelRecords.length} registros`);
        console.log(`Teléfonos únicos en archivo paralelo: ${parallelPhones.size}`);
        
        // Filtrar registros del archivo principal que NO están en el paralelo
        const uniqueRecords = [];
        let foundCount = 0;
        
        mainRecords.forEach(record => {
            const columns = parseCSVLine(record);
            if (columns.length >= 7) {
                const phone = columns[6].trim(); // Campo phone está en la posición 6
                
                // Si el teléfono no está en el archivo paralelo, agregar el registro
                if (!parallelPhones.has(phone)) {
                    uniqueRecords.push(record);
                } else {
                    foundCount++;
                }
            }
        });
        
        console.log(`Registros encontrados en ambos archivos: ${foundCount}`);
        console.log(`Registros únicos del archivo principal: ${uniqueRecords.length}`);
        
        // Crear el nuevo archivo
        const outputFilePath = path.join(__dirname, 'greystar_properties_lote1.csv');
        const outputContent = [mainHeader, ...uniqueRecords].join('\n');
        
        fs.writeFileSync(outputFilePath, outputContent, 'utf8');
        
        console.log(`\n✓ Archivo creado exitosamente: greystar_properties_lote1.csv`);
        console.log(`Total de registros en el nuevo archivo: ${uniqueRecords.length}`);
        
        // Mostrar algunos ejemplos de registros únicos
        console.log('\nEjemplos de registros únicos:');
        uniqueRecords.slice(0, 5).forEach((record, index) => {
            const columns = parseCSVLine(record);
            console.log(`${index + 1}. ${columns[1]} - ${columns[6]}`); // communityName - phone
        });
        
    } catch (error) {
        console.error('Error procesando archivos CSV:', error.message);
    }
}

// Función para parsear líneas CSV considerando comas dentro de comillas
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                // Doble comilla escapada
                current += '"';
                i++; // Saltar la siguiente comilla
            } else {
                // Alternar estado de comillas
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            // Coma fuera de comillas, es un separador
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    
    // Agregar el último campo
    result.push(current.trim());
    
    return result;
}

// Ejecutar la función
processCSVFiles();