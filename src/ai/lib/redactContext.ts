export function redactSensitiveOutput(text: string | null): string | null {
    if (text == null) return null;

    return text
        // Complete and window-truncated PEM private keys
        .replace(/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]')
        .replace(/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*$/g, '[REDACTED_PRIVATE_KEY]')
        .replace(/(^|\n)(?:[A-Za-z0-9+/]{20,}={0,2}\r?\n)+-----END [A-Z0-9 ]*PRIVATE KEY-----/gm, '$1[REDACTED_PRIVATE_KEY]')
        .replace(/(^|\n)(?:[A-Za-z0-9+/]{40,}={0,2}(?:\r?\n|$)){2,}/gm, '$1[REDACTED_PRIVATE_KEY]')
        // key=value / key: value style secrets
        .replace(/\b((?:(?:[a-z0-9]+[_-])*(?:password|passwd|passphrase|pwd|token|secret|api[_-]?key|access[_-]?key|private[_-]?key)(?:[_-][a-z0-9]+)*|pgpassword))\b([ \t]*[:=][ \t]*(?:\r?\n[ \t]*)?)("[^"\r\n]*"|'[^'\r\n]*'|[^\s"']+)/gi, '$1$2[REDACTED]')
        // Passwords supplied directly on common command lines
        .replace(/(\bsshpass\b[^\r\n]*?[ \t]+-p(?:[ \t]+|=)?)("[^"\r\n]*"|'[^'\r\n]*'|[^\s"']+)/gi, '$1[REDACTED]')
        .replace(/(\b(?:mysql|mysqldump|mariadb)\b[^\r\n]*?[ \t]+(?:-p(?=[^ \t\r\n])|--password=))("[^"\r\n]*"|'[^'\r\n]*'|[^\s"']+)/gi, '$1[REDACTED]')
        // Credentials embedded in URLs
        .replace(/\b([a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:)([^@\s/]+)(@)/gi, '$1[REDACTED]$3')
        // Authorization headers
        .replace(/\b(authorization[ \t]*:[ \t]*(?:bearer|basic))[ \t]+[^\s"']+/gi, '$1 [REDACTED]')
        // Common token formats
        .replace(/(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|xox[baprs]-[A-Za-z0-9-]{10,})/g, '[REDACTED_KEY]')
        // Bare JSON web tokens
        .replace(/eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED_KEY]')
        // Password hashes copied from /etc/shadow
        .replace(/(^|\r?\n)([^:\r\n]+:)(\$[A-Za-z0-9./]+\$[^:\r\n]+)(?=:)/g, '$1$2[REDACTED]')
        // Internal IPv4 addresses
        .replace(/\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})\b/g, '[REDACTED_IP]')
        // Host-like internal domains
        .replace(/\b[a-zA-Z0-9.-]+\.(?:internal|corp|cluster\.local|localdomain)\b/g, '[REDACTED_HOST]');
}
