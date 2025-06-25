// Listen for messages from the webpage
window.addEventListener('message', async (event) => {
  // Only accept messages from the same frame
  if (event.source !== window) return;

  // Only accept messages that we know are ours
  if (event.data.type && event.data.type === 'FROM_PAGE') {
    // Get wallet info from background script
    chrome.runtime.sendMessage({ type: 'GET_WALLET_INFO' }, (response) => {
      if (response) {
        // Send wallet info back to the webpage
        window.postMessage({
          type: 'FROM_EXTENSION',
          wallet: response
        }, '*');
      }
    });
  }
}); 