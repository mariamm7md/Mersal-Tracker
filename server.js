// Inside your server.js
// If you are calling your own API within the server:
const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`; 

// Example of a fix for the error in the screenshot:
async function someServerSideFunction() {
    // WRONG: await fetch('/api/init') 
    // RIGHT:
    try {
        const response = await fetch(`${BASE_URL}/api/init`);
        // ... rest of logic
    } catch (e) {
        console.error("Server-side fetch failed", e);
    }
}
