# Greystar Properties Scraper

[![English](https://img.shields.io/badge/lang-English-blue.svg)](README.md)
[![Español](https://img.shields.io/badge/lang-Español-red.svg)](README.es.md)

## Language / Idioma

- [🇺🇸 English Version](README.md)
- [🇪🇸 Versión en Español](README.es.md)

---

## Overview

This scraper is designed to extract property information from Greystar in a robust and efficient way, using parallel processing and advanced error handling.

## Key Features

### 🔄 Resilient Processing
- **Automatic resumption**: If the process is interrupted, it continues from where it left off
- **State persistence**: Saves progress in JSON files for recovery
- **Robust error handling**: Continues processing even if some sites fail

### ⚡ Parallel Processing
- **10 concurrent workers**: Processes multiple properties simultaneously
- **Intelligent distribution**: Divides tasks evenly among workers
- **Resource optimization**: Specific configuration for headless browsing

### 🎯 Data Validation
- **Quality filtering**: Only saves records with complete information
- **Required fields**: Phone, zip code, state, and address/city
- **Detailed logging**: Shows which records are skipped and why

## System Architecture

### Persistence Files

| File | Purpose | Format |
|------|---------|--------|
| `greystar_links.json` | Complete list of extracted links | JSON |
| `greystar_progress.json` | Already processed URLs for resumption | JSON |
| `greystar_properties.csv` | Extracted data in CSV format | CSV |

### Processing Flow

1. **Link Extraction** (First time only)
   - Navigates to `https://www.greystar.com/properties`
   - Extracts all property links by state
   - Saves to `greystar_links.json`

2. **Progress Verification**
   - Loads previous progress from `greystar_progress.json`
   - Filters already processed links
   - Continues only with pending links

3. **Parallel Processing**
   - Divides links into 10 chunks
   - Processes each chunk in a separate worker
   - Updates progress after each record

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd greystarScrapy

# Install dependencies
npm install

# Run the scraper
node greystar_paralell_scrapy_v2.js
```

## Requirements

- Node.js 14+
- Google Chrome (for Puppeteer)
- 8GB+ RAM (recommended for parallel processing)

## Usage

The scraper will automatically:
1. Extract property links if not already done
2. Resume from the last processed property
3. Save data to CSV as it processes
4. Handle errors gracefully

## Output

The scraper generates:
- `greystar_properties.csv`: Main data file with all extracted properties
- `greystar_links.json`: Cache of all property links
- `greystar_progress.json`: Progress tracking for resumption

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Keywords

`web-scraping`, `puppeteer`, `greystar`, `real-estate`, `property-scraper`, `nodejs`, `parallel-processing`, `data-extraction`, `automation`, `csv-export`, `rental-properties`, `apartment-scraper`, `headless-browser`, `resilient-scraping`, `property-data`

4. **Validation and Saving**
   - Validates that each record has minimum data
   - Saves only complete records to CSV
   - Marks all attempts as processed

## Data Extraction Methods

### 🔍 Multi-Method Strategy

1. **Structured JSON-LD**
   ```javascript
   // Search in scripts with structured data
   script[type="application/ld+json"]
   ```

2. **Meta Tags**
   ```javascript
   // Search in meta properties and names
   meta[property], meta[name]
   ```

3. **Text Analysis**
   ```javascript
   // Regex patterns for complete addresses
   /(\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave...).*[A-Z]{2}\s+\d{5})/gi
   ```

4. **Specific Selectors**
   ```javascript
   // Elements with address-related classes
   [class*="address"], [class*="location"], [class*="contact"]
   ```

### 📞 Phone Extraction

1. **Phone links**
   ```javascript
   a[href^="tel:"]
   ```

2. **Text patterns**
   ```javascript
   /(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/
   ```

## Data Validation

### Validation Criteria

A record is considered valid if it has:
- ✅ **Phone**: Valid format with country code
- ✅ **Zip Code**: USA format (5 digits or 5+4)
- ✅ **State**: 2-letter code (e.g., CA, NY, TX)
- ✅ **Address or City**: At least one of the two fields

### Validation Example

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

## System Configuration

### Browser Configuration

```javascript
{
    headless: true,                    // Headless mode
    timeout: 20000,                    // 20 seconds per page
    workers: 10,                       // Parallel processing
    delay: 800,                        // Pause between requests (ms)
    retries: 3                         // Attempts per URL
}
```

### Chrome Arguments

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

## Data Structure

### CSV Output Format

```csv
state_name,communityName,address,city,state_address,zip,phone,email
```

### Record Example

```csv
California,"The Residences at Marina Bay","1000 Marina Bay Dr","Richmond","CA","94804","+1 510 555 1234","residencesmarinabay@greystar.com"
```

### JSON Links Format

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

## Error Handling

### Types of Handled Errors

1. **Page Timeouts**
   - Timeout configured to 20 seconds
   - Marks as processed and continues

2. **Navigation Errors**
   - Pages not found (404)
   - Connectivity issues
   - Continues with next link

3. **Extraction Errors**
   - Pages with different structure
   - JavaScript not executed
   - Saves empty record but marks as processed

4. **Validation Errors**
   - Incomplete data
   - Incorrect formats
   - Skips from CSV but marks as processed

## Logging and Monitoring

### Logging Levels

```javascript
// General information
console.log('Worker 0: ✓ Processed 15/335 - Community Name');

// Warnings (incomplete data)
console.log('Worker 0: ⚠️ Incomplete record skipped - Community Name');

// Errors
console.error('Worker 0: ✗ Error processing Community Name: timeout');
```

### Progress Metrics

- Total links found
- Already processed links
- Remaining links
- Valid records saved
- Records skipped by validation

## System Usage

### Execution

```bash
# Run with caffeinate to avoid sleep
caffeinate node greystar_paralell_scrapy_v2.js
```

### Restart After Interruption

```bash
# System automatically detects previous progress
node greystar_paralell_scrapy_v2.js
```

### Start from Scratch

```bash
# Remove state files
rm greystar_links.json greystar_progress.json greystar_properties.csv

# Run again
node greystar_paralell_scrapy_v2.js
```

## Implemented Optimizations

### Performance

- **Headless browsing**: Navigation without GUI
- **Parallel processing**: 10 simultaneous workers
- **Optimized timeouts**: Balance between speed and stability
- **Controlled pauses**: Avoids server overload

### Data Quality

- **Strict validation**: Only complete records
- **Smart parsing**: Multiple extraction methods
- **Normalization**: Consistent formats for phones
- **Email generation**: Based on community names

### Robustness

- **Persistent state**: Automatic recovery
- **Error handling**: Continues despite individual failures
- **Detailed logging**: Facilitates debugging and monitoring
- **Thread-safe**: Safe writing to shared files

## Technical Considerations

### Memory and CPU

- Each worker consumes ~50-100MB RAM
- 10 workers = ~500MB-1GB total RAM
- CPU: Uses multiple cores efficiently

### Network and Connectivity

- ~1 request per second per worker
- Total: ~10 requests/second
- Respectful with target server

### Storage

- JSON links: ~500KB - 1MB
- Progress JSON: Grows to ~500KB
- Final CSV: ~1-5MB (depending on valid data)

## Maintenance

### Necessary Updates

1. **CSS Selectors**: If Greystar changes HTML structure
2. **Address Patterns**: For new address formats
3. **Timeouts**: Adjust according to server speed
4. **Validation**: Stricter or more flexible criteria

### Recommended Monitoring

- Review logs every 30 minutes during execution
- Verify data quality in intermediate CSV
- Monitor system resource usage
- Validate that progress is saved correctly

---

**Note**: This system is designed to be robust and efficient, but always respects the terms of service of the target website and implements appropriate delays to avoid overloading the server.