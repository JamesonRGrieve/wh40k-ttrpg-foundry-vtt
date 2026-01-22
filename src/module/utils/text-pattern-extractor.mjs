/**
 * @file TextPatternExtractor - Extracts structured data from text using patterns
 *
 * Provides:
 * - Pattern-based text extraction
 * - Section parsing
 * - Value normalization
 * - List parsing with nested structures
 */

/**
 * Utility for extracting structured data from text.
 */
export default class TextPatternExtractor {
    /**
     * Extract a section from lines by header.
     * @param {Array<string>} lines - Array of text lines
     * @param {string} header - Section header to find
     * @param {Array<string>} sectionHeaders - List of all section headers
     * @returns {string} Section content
     */
    static extractSection(lines, header, sectionHeaders = []) {
        const headerLower = header.toLowerCase();

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineLower = line.toLowerCase();

            if (!lineLower.startsWith(headerLower)) continue;

            // Found the header, extract content
            const headerRegex = new RegExp(`^${header}\\s*[:\\t]?\\s*`, 'i');
            let content = line.replace(headerRegex, '').trim();

            // Collect subsequent lines until next section header
            for (let j = i + 1; j < lines.length; j++) {
                const nextLine = lines[j];

                // Check if this is another section header
                if (this.isSectionHeader(nextLine, sectionHeaders)) {
                    break;
                }

                content = `${content} ${nextLine}`.trim();
            }

            return content.trim();
        }

        return '';
    }

    /**
     * Check if a line is a section header.
     * @param {string} line - Line to check
     * @param {Array<string>} sectionHeaders - List of known headers
     * @returns {boolean} True if line starts with a section header
     */
    static isSectionHeader(line, sectionHeaders) {
        const lower = line.toLowerCase();
        return sectionHeaders.some((header) => lower.startsWith(header.toLowerCase()));
    }

    /**
     * Split a comma/semicolon-separated list, respecting parentheses.
     * @param {string} text - Text to split
     * @returns {Array<string>} Array of entries
     */
    static splitList(text) {
        if (!text) return [];

        const entries = [];
        let buffer = '';
        let depth = 0;

        for (const char of text) {
            if (char === '(') depth++;
            if (char === ')') depth = Math.max(0, depth - 1);

            if ((char === ',' || char === ';') && depth === 0) {
                entries.push(buffer.trim());
                buffer = '';
                continue;
            }

            buffer += char;
        }

        if (buffer.trim()) {
            entries.push(buffer.trim());
        }

        return entries.filter((entry) => entry.length > 0);
    }

    /**
     * Clean an entry by removing trailing dots and extra spaces.
     * @param {string} entry - Entry to clean
     * @returns {string} Cleaned entry
     */
    static cleanEntry(entry) {
        return entry
            .replace(/\.+$/, '')
            .replace(/\s{2,}/g, ' ')
            .trim();
    }

    /**
     * Extract numeric value from a string token.
     * @param {string} token - Token to parse
     * @returns {number} Numeric value or 0
     */
    static parseNumericValue(token) {
        if (!token) return 0;
        if (token === '-' || token === '--') return 0;

        const parsed = parseInt(token, 10);
        return Number.isNaN(parsed) ? 0 : parsed;
    }

    /**
     * Extract all tokens from a space-separated line.
     * @param {string} line - Line to tokenize
     * @returns {Array<string>} Array of numeric tokens (non-digits stripped)
     */
    static extractValueTokens(line) {
        const tokens = line
            .split(/\s+/)
            .map((token) => token.trim())
            .filter(Boolean);

        return tokens.map((token) => token.replace(/[^\d-]/g, ''));
    }

    /**
     * Extract numbers from parentheses.
     * @param {string} line - Line to parse
     * @returns {Array<number>} Array of numbers found in parentheses
     */
    static extractParentheticalNumbers(line) {
        const matches = [...line.matchAll(/\((\d+)\)/g)];
        return matches.map((match) => parseInt(match[1], 10));
    }

    /**
     * Extract all groups in parentheses.
     * @param {string} text - Text to parse
     * @returns {Array<string>} Array of content within parentheses
     */
    static extractParenthesesGroups(text) {
        const groups = [];
        const matches = text.matchAll(/\(([^)]+)\)/g);

        for (const match of matches) {
            groups.push(match[1].trim());
        }

        return groups;
    }

    /**
     * Remove all parentheses and their contents.
     * @param {string} text - Text to modify
     * @returns {string} Text without parentheses
     */
    static removeParentheses(text) {
        return text.replace(/\([^)]*\)/g, '').trim();
    }

    /**
     * Normalize text input (remove special characters, normalize whitespace).
     * @param {string} input - Input text
     * @returns {string} Normalized text
     */
    static normalizeInput(input) {
        return input
            .replace(/\u2013|\u2014/g, '-') // Em/en dashes to hyphens
            .replace(/\t/g, ' ') // Tabs to spaces
            .replace(/\r/g, ''); // Remove carriage returns
    }

    /**
     * Split text into non-empty trimmed lines.
     * @param {string} input - Input text
     * @returns {Array<string>} Array of lines
     */
    static splitLines(input) {
        return input
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
    }

    /**
     * Extract key-value pattern from text.
     * @param {string} text - Text to search
     * @param {RegExp} pattern - Regex pattern (should have capture groups)
     * @returns {Object|null} Matched key-value or null
     */
    static extractPattern(text, pattern) {
        const match = text.match(pattern);
        return match || null;
    }

    /**
     * Extract all matches for a pattern.
     * @param {string} text - Text to search
     * @param {RegExp} pattern - Regex pattern (must have 'g' flag)
     * @returns {Array<Object>} Array of matches
     */
    static extractAllPatterns(text, pattern) {
        return [...text.matchAll(pattern)];
    }

    /**
     * Convert text to camelCase key.
     * @param {string} text - Text to convert
     * @param {boolean} capitalize - Capitalize first letter
     * @returns {string} camelCase key
     */
    static toKey(text, capitalize = false) {
        const cleaned = text.replace(/[^A-Za-z0-9]/g, ' ').trim();

        const parts = cleaned.split(/\s+/).filter(Boolean);

        if (parts.length === 0) return '';

        const [first, ...rest] = parts;
        const key = [first.toLowerCase(), ...rest.map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())].join('');

        if (!capitalize) return key;
        return key.charAt(0).toUpperCase() + key.slice(1);
    }

    /**
     * Check if text looks like a header row (e.g., "WS BS S T Ag...").
     * @param {string} line - Line to check
     * @param {Array<string>} requiredTokens - Required tokens
     * @returns {boolean} True if line looks like a header
     */
    static looksLikeHeader(line, requiredTokens) {
        const tokens = line.split(/\s+/).map((token) => token.replace(/[^A-Za-z]/g, ''));

        return requiredTokens.every((required) => tokens.includes(required));
    }

    /**
     * Parse a value with modifier (e.g., "Awareness +10").
     * @param {string} entry - Entry to parse
     * @returns {Object} Parsed value and bonus
     */
    static parseValueWithModifier(entry) {
        const match = entry.match(/^(.+?)\s*\+\s*(\d+)$/);

        if (match) {
            return {
                value: match[1].trim(),
                bonus: parseInt(match[2], 10),
                hasBonus: true,
            };
        }

        return {
            value: entry.trim(),
            bonus: 0,
            hasBonus: false,
        };
    }

    /**
     * Parse a range pattern (e.g., "10m", "5-10").
     * @param {string} text - Text to parse
     * @returns {Object|null} Parsed range or null
     */
    static parseRange(text) {
        // Match patterns like "10m", "5-10m", "Melee", etc.
        const meterMatch = text.match(/(\d+)\s*m/i);
        if (meterMatch) {
            return {
                value: parseInt(meterMatch[1], 10),
                unit: 'm',
                type: 'ranged',
            };
        }

        if (/melee/i.test(text)) {
            return {
                value: 0,
                unit: null,
                type: 'melee',
            };
        }

        return null;
    }
}
