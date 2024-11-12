import { cleanupExpiredTokens, CSRFProtection } from '../utils/csrf.js';

// Clean up expired tokens periodically
chrome.alarms.create('cleanupTokens', { periodInMinutes: 60 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'cleanupTokens') {
    cleanupExpiredTokens();
  }
});

// Initialize CSRF protection when extension starts
chrome.runtime.onStartup.addListener(async () => {
  await CSRFProtection.initialize();
  await CSRFProtection.refreshToken();
});

// Handle token refresh when tab becomes active
chrome.tabs.onActivated.addListener(async () => {
  if (CSRFProtection.isTokenExpired()) {
    await CSRFProtection.refreshToken();
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "checkEmailVerification") {
    chrome.storage.local.get(['emailVerified'], function(result) {
      sendResponse({ verified: result.emailVerified === true });
    });
    return true; // Required for async response
  }
});

function openCVEditor(shouldUpdateList = false) {
  chrome.storage.local.get(['emailVerified'], function(result) {
    if (!result.emailVerified) {
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icon48.png",
        title: chrome.i18n.getMessage("verificationRequired"),
        message: chrome.i18n.getMessage("pleaseVerifyEmail")
      });
      return;
    }

    const cvEditorUrl = chrome.runtime.getURL('src/editor/cv_editor.html');
    
    chrome.tabs.query({}, function(tabs) {
      const existingTab = tabs.find(tab => tab.url === cvEditorUrl);
      
      if (existingTab) {
        // CV Editor tab already exists, switch to it
        chrome.tabs.update(existingTab.id, {active: true});
        chrome.windows.update(existingTab.windowId, {focused: true});
        
        if (shouldUpdateList) {
          // Send a message to the CV Editor tab to update the list
          chrome.tabs.sendMessage(existingTab.id, {action: "updateCVList"});
        }
      } else {
        // CV Editor tab doesn't exist, create a new one
        chrome.tabs.create({url: cvEditorUrl});
      }
    });
  });
}

let extractionInProgress = false;

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "openCVEditor",
    title: chrome.i18n.getMessage("openCVEditor"),
    contexts: ["action"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "openCVEditor") {
    openCVEditor();
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "openCVEditor") {
    openCVEditor(request.updateList);
    sendResponse({success: true});
  }
});

chrome.runtime.onConnect.addListener(function(port) {
  if (port.name === "popup") {
    port.onDisconnect.addListener(function() {
      if (extractionInProgress) {
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icon48.png",
          title: chrome.i18n.getMessage("extractionInProgressTitle"),
          message: chrome.i18n.getMessage("extractionInProgressMessage")
        });
        extractionInProgress = false;
      }
    });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extractionStarted") {
    extractionInProgress = true;
  } else if (request.action === "extractionStopped") {
    extractionInProgress = false;
  }
});