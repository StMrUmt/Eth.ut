// Listen for installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('Crypto Wallet Extension installed');
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_WALLET_INFO') {
    chrome.storage.local.get(['wallet'], (result) => {
      sendResponse(result.wallet || null);
    });
    return true; // Will respond asynchronously
  }
}); 