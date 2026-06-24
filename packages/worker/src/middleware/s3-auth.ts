import type { MiddlewareHandler } from 'hono';
import { timingSafeEqual } from 'node:crypto';
import { decrypt } from '../lib/crypto';
import { hmacSha256, sha256 } from '../lib/crypto-s3';

function returnXmlError(c: any, code: string, message: string, status = 403, extraFields: Record<string, string> = {}) {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<Error>
  <Code>${code}</Code>
  <Message>${message}</Message>`;
  for (const [key, value] of Object.entries(extraFields)) {
    const escapedValue = value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
    xml += `\n  <${key}>${escapedValue}</${key}>`;
  }
  xml += '\n</Error>';
  c.header('Content-Type', 'application/xml');
  return c.text(xml, status);
}

function awsEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

export const s3AuthMiddleware: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header('Authorization');
  let isPresigned = false;
  
  let accessKeyId = '';
  let date = '';
  let region = '';
  let service = '';
  let signedHeaders = '';
  let signature = '';
  let amzDate = '';
  let expiresStr = '';
  
  if (authHeader && authHeader.startsWith('AWS4-HMAC-SHA256')) {
    const credentialMatch = authHeader.match(/Credential=([^,\s]+)/);
    const signedHeadersMatch = authHeader.match(/SignedHeaders=([^,\s]+)/);
    const signatureMatch = authHeader.match(/Signature=([^,\s]+)/);
    
    if (!credentialMatch || !signedHeadersMatch || !signatureMatch) {
      return returnXmlError(c, 'InvalidAccessKeyId', 'Malformed Authorization Header');
    }
    
    const credParts = credentialMatch[1].split('/');
    if (credParts.length < 5) {
      return returnXmlError(c, 'InvalidAccessKeyId', 'Malformed Credential in Authorization Header');
    }
    
    accessKeyId = credParts[0];
    date = credParts[1];
    region = credParts[2];
    service = credParts[3];
    
    signedHeaders = signedHeadersMatch[1];
    signature = signatureMatch[1];
    
    amzDate = c.req.header('x-amz-date') || c.req.header('date') || '';
    if (!amzDate) {
      return returnXmlError(c, 'AccessDenied', 'AWS Signature Version 4 requires x-amz-date or date header');
    }
  } else {
    // Check query parameters (Presigned URLs)
    const amzCred = c.req.query('X-Amz-Credential');
    const amzAlgorithm = c.req.query('X-Amz-Algorithm');
    const amzSignedHeaders = c.req.query('X-Amz-SignedHeaders');
    const amzSignature = c.req.query('X-Amz-Signature');
    const amzDateParam = c.req.query('X-Amz-Date');
    const amzExpires = c.req.query('X-Amz-Expires');
    
    if (!amzCred || amzAlgorithm !== 'AWS4-HMAC-SHA256' || !amzSignedHeaders || !amzSignature || !amzDateParam) {
      return returnXmlError(c, 'AccessDenied', 'AWS Signature Version 4 credentials missing');
    }
    
    const credParts = amzCred.split('/');
    if (credParts.length < 5) {
      return returnXmlError(c, 'InvalidAccessKeyId', 'Malformed X-Amz-Credential query parameter');
    }
    
    accessKeyId = credParts[0];
    date = credParts[1];
    region = credParts[2];
    service = credParts[3];
    
    signedHeaders = amzSignedHeaders;
    signature = amzSignature;
    amzDate = amzDateParam;
    expiresStr = amzExpires || '';
    isPresigned = true;
  }
  
  // Look up credentials in the database
  const db = c.env.DB;
  const cred = await db.prepare('SELECT * FROM s3_credentials WHERE access_key_id = ?').bind(accessKeyId).first();
  if (!cred) {
    return returnXmlError(c, 'InvalidAccessKeyId', 'The AWS Access Key Id you provided does not exist in our records.');
  }
  
  try {
    const rawSecretKey = await decrypt(cred.secret_key_enc, c.env.TOKEN_ENCRYPTION_KEY);
    
    // Perform standard AWS SigV4 validation
    // 1. Time expiration and clock skew validation
    const datePattern = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/;
    let dateMatch = amzDate.match(datePattern);
    if (!dateMatch && !isPresigned && !c.req.header('x-amz-date')) {
      const parsedTime = Date.parse(amzDate);
      if (!isNaN(parsedTime)) {
        const parsedDateObj = new Date(parsedTime);
        const pad = (n: number) => String(n).padStart(2, '0');
        const yearStr = String(parsedDateObj.getUTCFullYear());
        const monthStr = pad(parsedDateObj.getUTCMonth() + 1);
        const dayStr = pad(parsedDateObj.getUTCDate());
        const hourStr = pad(parsedDateObj.getUTCHours());
        const minStr = pad(parsedDateObj.getUTCMinutes());
        const secStr = pad(parsedDateObj.getUTCSeconds());
        amzDate = `${yearStr}${monthStr}${dayStr}T${hourStr}${minStr}${secStr}Z`;
        dateMatch = amzDate.match(datePattern);
      }
    }
    if (!dateMatch) {
      return returnXmlError(c, 'AccessDenied', 'Invalid date format (expected YYYYMMDDTHHMMSSZ)');
    }
    const year = parseInt(dateMatch[1], 10);
    const month = parseInt(dateMatch[2], 10) - 1;
    const day = parseInt(dateMatch[3], 10);
    const hour = parseInt(dateMatch[4], 10);
    const min = parseInt(dateMatch[5], 10);
    const sec = parseInt(dateMatch[6], 10);
    const requestTime = Date.UTC(year, month, day, hour, min, sec);
    if (isNaN(requestTime)) {
      return returnXmlError(c, 'AccessDenied', 'Invalid request date/time');
    }

    if (isPresigned) {
      const currentTime = Date.now();
      const expiresSec = parseInt(expiresStr, 10);
      if (isNaN(expiresSec) || expiresSec < 0 || expiresSec > 604800) {
        return returnXmlError(c, 'InvalidArgument', 'X-Amz-Expires must be a valid integer between 0 and 604800');
      }
      if (currentTime > requestTime + expiresSec * 1000) {
        return returnXmlError(c, 'AccessDenied', 'Request has expired', 403);
      }
    } else {
      const currentTime = Date.now();
      const fifteenMinutes = 15 * 60 * 1000;
      if (Math.abs(currentTime - requestTime) > fifteenMinutes) {
        return returnXmlError(c, 'RequestTimeTooSkewed', 'The difference between the request time and the current time is too large.', 403);
      }
    }
    
    // 2. Recompute the Canonical Request
    const url = new URL(c.req.url);
    const pathStart = c.req.url.indexOf('/', c.req.url.indexOf('//') + 2);
    const pathEnd = c.req.url.indexOf('?') === -1 ? c.req.url.length : c.req.url.indexOf('?');
    let rawPath = c.req.url.slice(pathStart, pathEnd);
    if (!rawPath.startsWith('/')) {
      rawPath = '/' + rawPath;
    }
    
    const queryParams: [string, string][] = [];
    url.searchParams.forEach((value, key) => {
      if (key.toLowerCase() !== 'x-amz-signature') {
        queryParams.push([key, value]);
      }
    });
    
    queryParams.sort((a, b) => {
      const aKey = awsEncode(a[0]);
      const bKey = awsEncode(b[0]);
      if (aKey < bKey) return -1;
      if (aKey > bKey) return 1;
      const aVal = awsEncode(a[1]);
      const bVal = awsEncode(b[1]);
      if (aVal < bVal) return -1;
      if (aVal > bVal) return 1;
      return 0;
    });
    
    const canonicalQueryString = queryParams
      .map(([key, val]) => `${awsEncode(key)}=${awsEncode(val)}`)
      .join('&');
      
    const signedHeadersList = signedHeaders.split(';').map(h => h.trim().toLowerCase());
    let canonicalHeaders = '';
    for (const headerName of signedHeadersList) {
      const headerVal = c.req.header(headerName) || url.searchParams.get(headerName) || '';
      const trimmedVal = headerVal.trim().replace(/\s+/g, ' ');
      canonicalHeaders += `${headerName}:${trimmedVal}\n`;
    }
    
    let payloadHash = c.req.header('x-amz-content-sha256');
    if (!payloadHash) {
      if (c.req.method === 'GET' || c.req.method === 'HEAD' || c.req.method === 'DELETE') {
        payloadHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
      } else {
        payloadHash = 'UNSIGNED-PAYLOAD';
      }
    }
    
    // Calculate expected signature using a helper that supports fallback paths
    const checkSignatureForPath = (pathToCheck: string): { valid: boolean; calculated: string; canonical: string; stringToSign: string } => {
      const canonicalRequest = [
        c.req.method,
        pathToCheck,
        canonicalQueryString,
        canonicalHeaders,
        signedHeaders,
        payloadHash
      ].join('\n');
      
      const stringToSign = [
        'AWS4-HMAC-SHA256',
        amzDate,
        `${date}/${region}/${service}/aws4_request`,
        sha256(canonicalRequest)
      ].join('\n');
      
      const kDate = hmacSha256("AWS4" + rawSecretKey, date);
      const kRegion = hmacSha256(kDate, region);
      const kService = hmacSha256(kRegion, service);
      const kSigning = hmacSha256(kService, 'aws4_request');
      const calculatedSignature = hmacSha256(kSigning, stringToSign).toString('hex');
      
      const computedBuf = Buffer.from(calculatedSignature, 'hex');
      const providedBuf = Buffer.from(signature, 'hex');
      const valid = computedBuf.length === providedBuf.length && timingSafeEqual(computedBuf, providedBuf);
      
      return { valid, calculated: calculatedSignature, canonical: canonicalRequest, stringToSign };
    };

    let result = checkSignatureForPath(rawPath);
    
    // Fallback 1: If rawPath starts with /s3, check signature without /s3 prefix
    if (!result.valid && rawPath.startsWith('/s3')) {
      let strippedPath = rawPath.slice(3); // Remove '/s3'
      if (!strippedPath.startsWith('/')) {
        strippedPath = '/' + strippedPath;
      }
      const fallbackResult = checkSignatureForPath(strippedPath);
      if (fallbackResult.valid) {
        result = fallbackResult;
      }
    }
    
    // Fallback 2: If rawPath does not start with /s3, check signature with /s3 prefix
    if (!result.valid && !rawPath.startsWith('/s3')) {
      const prefixedPath = '/s3' + rawPath;
      const fallbackResult = checkSignatureForPath(prefixedPath);
      if (fallbackResult.valid) {
        result = fallbackResult;
      }
    }

    if (!result.valid) {
      console.error('S3 Signature Mismatch:', {
        providedSignature: signature,
        calculatedSignature: result.calculated,
        canonicalRequest: result.canonical,
        stringToSign: result.stringToSign
      });
      return returnXmlError(
        c,
        'SignatureDoesNotMatch',
        'The request signature we calculated does not match the signature you provided. Check your key and signing method.',
        403,
        {
          CanonicalRequest: result.canonical,
          StringToSign: result.stringToSign
        }
      );
    }
    
    c.set('userId', cred.user_id);
    c.set('s3WorkspaceId', cred.workspace_id || null);
    await next();
  } catch (err: any) {
    return returnXmlError(c, 'SignatureDoesNotMatch', 'Signature verification failed: ' + err.message);
  }
};
