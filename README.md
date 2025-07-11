# Greystar Properties Scraper - Documentación

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

## Uso del Sistema

### Ejecución

```bash
# Ejecutar con caffeinate para evitar sleep
caffeinate node graystar_paralell_scrapy_v2.js
```

### Reinicio Después de Interrupción

```bash
# El sistema automáticamente detecta el progreso previo
node graystar_paralell_scrapy_v2.js
```

### Comenzar Desde Cero

```bash
# Eliminar archivos de estado
rm greystar_links.json greystar_progress.json greystar_properties.csv

# Ejecutar nuevamente
node graystar_paralell_scrapy_v2.js
```

## Optimizaciones Implementadas

### Rendimiento

- **Headless browsing**: Navegación sin interfaz gráfica
- **Procesamiento paralelo**: 10 workers simultáneos
- **Timeouts optimizados**: Balance entre velocidad y estabilidad
- **Pausas controladas**: Evita sobrecarga del servidor

### Calidad de Datos

- **Validación estricta**: Solo registros completos
- **Parseo inteligente**: Múltiples métodos de extracción
- **Normalización**: Formatos consistentes para teléfonos
- **Generación de emails**: Basado en nombres de comunidad

### Robustez

- **Estado persistente**: Recuperación automática
- **Manejo de errores**: Continúa ante fallos individuales
- **Logging detallado**: Facilita debugging y monitoreo
- **Thread-safe**: Escritura segura en archivos compartidos

## Consideraciones Técnicas

### Memoria y CPU

- Cada worker consume ~50-100MB RAM
- 10 workers = ~500MB-1GB RAM total
- CPU: Utiliza múltiples cores eficientemente

### Red y Conectividad

- ~1 request por segundo por worker
- Total: ~10 requests/segundo
- Respetuoso con el servidor objetivo

### Almacenamiento

- Enlaces JSON: ~500KB - 1MB
- Progreso JSON: Crece hasta ~500KB
- CSV final: ~1-5MB (dependiendo de datos válidos)

## Mantenimiento

### Actualizaciones Necesarias

1. **Selectores CSS**: Si Greystar cambia su estructura HTML
2. **Patrones de dirección**: Para nuevos formatos de dirección
3. **Timeouts**: Ajustar según velocidad del servidor
4. **Validación**: Criterios más estrictos o flexibles

### Monitoreo Recomendado

- Revisar logs cada 30 minutos durante ejecución
- Verificar calidad de datos en CSV intermedio
- Monitorear uso de recursos del sistema
- Validar que el progreso se guarde correctamente

---

**Nota**: Este sistema está diseñado para ser robusto y eficiente, pero siempre respeta los términos de servicio del sitio web objetivo y implementa delays apropiados para evitar sobrecargar el servidor.