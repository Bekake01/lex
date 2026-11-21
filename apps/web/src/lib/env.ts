// Read by its full name: Next.js only inlines `process.env.NEXT_PUBLIC_*`
// written out literally, so the browser bundle gets the value.
const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

/** The api's origin as the browser calls it, no trailing slash. */
export const API_URL = apiUrl.replace(/\/+$/, '');
