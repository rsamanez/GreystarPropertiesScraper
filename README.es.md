# Greystar Properties Scraper

[![English](https://img.shields.io/badge/lang-English-blue.svg)](README.md)
[![Español](https://img.shields.io/badge/lang-Español-red.svg)](README.es.md)

## Language / Idioma

- [🇺🇸 English Version](README.md)
- [🇪🇸 Versión en Español](README.es.md)

---

## Descripción General

Este scraper está diseñado para extraer información de propiedades de Greystar de manera robusta y eficiente, utilizando procesamiento paralelo y manejo de errores avanzado.

## Características Principales

### 🔄 Procesamiento Resiliente
- **Reanudación automática**: Si el proceso se interrumpe, continúa desde donde se quedó
- **Persistencia de estado**: Guarda progreso en archivos JSON para recuperación
- **Manejo de errores robusto**: Continúa procesando aunque algunos sitios fallen

### ⚡ Procesamiento Paralelo
- **10 workers concurrentes**: Procesa múltiples propiedades simultáneamente
- **Distribución inteligente**: Divide las tareas equitativamente entre workers
- **Optimización de recursos**: Configuración específica para headless browsing

### 🎯 Validación de Datos
- **Filtrado de calidad**: Solo guarda registros con información completa
- **Campos requeridos**: Teléfono, código postal, estado y dirección/ciudad
- **Logging detallado**: Muestra qué registros se omiten y por qué

## Arquitectura del Sistema

### Archivos de Persistencia

| Archivo | Propósito | Formato |
|---------|-----------|---------|
| `greystar_links.json` | Lista completa de enlaces extraídos | JSON |
| `greystar_progress.json` | URLs ya procesadas para reanudación | JSON |
| `greystar_properties.csv` | Datos extraídos en formato CSV | CSV |

### Flujo de Procesamiento

1. **Extracción de Enlaces** (Solo primera vez)
   - Navega a `https://www.greystar.com/properties`
   - Extrae todos los enlaces de propiedades por estado
   - Guarda en `greystar_links.json`

2. **Verificación de Progreso**
   - Carga progreso previo de `greystar_progress.json`
   - Filtra enlaces ya procesados
   - Continúa solo con enlaces pendientes

3. **Procesamiento Paralelo**
   - Divide enlaces en 10 chunks
   - Procesa cada chunk en un worker separado
   - Actualiza progreso después de cada registro

4. **Validación y Guardado**
   - Valida que cada registro tenga datos mínimos
   - Guarda solo registros completos en CSV
   - Marca todos los intentos como procesados

## Métodos de Extracción de Datos

### 🔍 Estrategia Multi-Método

1. **JSON-LD Estructurado**
   ```javascript
   // Busca en scripts con structured data
   script[type="application/ld+json"]
   ```

2. **Meta Tags**
   ```javascript
   // Busca en meta properties y names
   meta[property], meta[name]
   ```

3. **Análisis de Texto**
   ```javascript
   // Patrones regex para direcciones completas
   /(\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave...).*[A-Z]{2}\s+\d{5})/gi
   ```

4. **Selectores Específicos**
   ```javascript
   // Elementos con clases relacionadas a direcciones
   [class*="address"], [class*="location"], [class*="contact"]
   ```

### 📞 Extracción de Teléfonos

1. **Enlaces telefónicos**
   ```javascript
   a[href^="tel:"]
   ```

2. **Patrones en texto**
   ```javascript
   /(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/
   ```

## Validación de Datos

### Criterios de Validación

Un registro se considera válido si tiene:
- ✅ **Teléfono**: Formato válido con código de país
- ✅ **Código Postal**: Formato USA (5 dígitos o 5+4)
- ✅ **Estado**: Código de 2 letras (ej: CA, NY, TX)
- ✅ **Dirección o Ciudad**: Al menos uno de los dos campos

### Ejemplo de Validación

```javascript
function isValidRecord(communityData, addressParts, community) {
    const hasPhone = communityData.phone && communityData.phone.trim() !== '';
    const hasZip = addressParts.zip && addressParts.zip.trim() !== '';
    const hasState = addressParts.state && addressParts.state.trim() !== '';
    const hasAddressOrCity = (addressParts.address && addressParts.address.trim() !== '') || 
                            (addressParts.city && addressParts.city.trim() !== '');
    
    return hasPhone && hasZip && hasState && hasAddressOrCity;
}
```

## Configuración del Sistema

### Configuración del Navegador

```javascript
{
    headless: true,                    // Modo sin interfaz gráfica
    timeout: 20000,                    // 20 segundos por página
    workers: 10,                       // Procesamiento paralelo
    delay: 800,                        // Pausa entre requests (ms)
    retries: 3                         // Intentos por URL
}
```

### Argumentos de Chrome

```javascript
[
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-extensions',
    '--disable-background-timer-throttling'
]
```

## Estructura de Datos

### Formato CSV de Salida

```csv
state_name,communityName,address,city,state_address,zip,phone,email
```

### Ejemplo de Registro

```csv
California,"The Residences at Marina Bay","1000 Marina Bay Dr","Richmond","CA","94804","+1 510 555 1234","residencesmarinabay@greystar.com"
```

### Formato JSON de Enlaces

```json
{
    "extractedAt": "2025-07-10T21:25:05.595Z",
    "totalLinks": 3341,
    "links": [
        {
            "state": "California",
            "communityName": "The Residences at Marina Bay",
            "communityUrl": "https://www.greystar.com/properties/..."
        }
    ]
}
```

## Manejo de Errores

### Tipos de Errores Manejados

1. **Timeouts de Página**
   - Timeout configurado a 20 segundos
   - Marca como procesado y continúa

2. **Errores de Navegación**
   - Páginas no encontradas (404)
   - Problemas de conectividad
   - Continúa con el siguiente enlace

3. **Errores de Extracción**
   - Páginas con estructura diferente
   - JavaScript no ejecutado
   - Guarda registro vacío pero marcado como procesado

4. **Errores de Validación**
   - Datos incompletos
   - Formatos incorrectos
   - Omite del CSV pero marca como procesado

## Logging y Monitoreo

### Niveles de Logging

```javascript
// Información general
console.log('Worker 0: ✓ Procesado 15/335 - Community Name');

// Advertencias (datos incompletos)
console.log('Worker 0: ⚠️ Registro incompleto omitido - Community Name');

// Errores
console.error('Worker 0: ✗ Error procesando Community Name: timeout');
```

### Métricas de Progreso

- Total de enlaces encontrados
- Enlaces ya procesados
- Enlaces restantes
- Registros válidos guardados
- Registros omitidos por validación

## Instalación

```bash
# Clonar el repositorio
git clone <repository-url>
cd greystarScrapy

# Instalar dependencias
npm install

# Ejecutar el scraper
node greystar_paralell_scrapy_v2.js
```

## Requisitos

- Node.js 14+
- Google Chrome (para Puppeteer)
- 8GB+ RAM (recomendado para procesamiento paralelo)

## Uso

El scraper automáticamente:
1. Extraerá enlaces de propiedades si no se ha hecho antes
2. Reanudará desde la última propiedad procesada
3. Guardará datos en CSV mientras procesa
4. Manejará errores de manera elegante

## Salida

El scraper genera:
- `greystar_properties.csv`: Archivo principal con todas las propiedades extraídas
- `greystar_links.json`: Cache de todos los enlaces de propiedades
- `greystar_progress.json`: Seguimiento de progreso para reanudación

## Contribuir

1. Hacer fork del repositorio
2. Crear una rama de características
3. Hacer commit de los cambios
4. Push a la rama
5. Crear un Pull Request

## Licencia

Este proyecto está licenciado bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para detalles.

## Palabras Clave

`web-scraping`, `puppeteer`, `greystar`, `bienes-raices`, `property-scraper`, `nodejs`, `procesamiento-paralelo`, `extraccion-datos`, `automatizacion`, `exportar-csv`, `propiedades-alquiler`, `apartment-scraper`, `headless-browser`, `scraping-resiliente`, `datos-propiedades`

---

**Nota**: Este sistema está diseñado para ser robusto y eficiente, pero siempre respeta los términos de servicio del sitio web objetivo y implementa delays apropiados para evitar sobrecargar el servidor.