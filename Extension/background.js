/* eslint-disable require-jsdoc */
'use strict';

// only load for URLs that match www.netflix.com/watch/*
chrome.runtime.onInstalled.addListener(function(details) {
  chrome.declarativeContent.onPageChanged.removeRules(undefined, function() {
    chrome.declarativeContent.onPageChanged.addRules([{
      conditions: [
        new chrome.declarativeContent.PageStateMatcher({
          pageUrl: {
            schemes: ['http', 'https'],
          },
        }),
      ],
      actions: [new chrome.declarativeContent.ShowPageAction()],
    }]);
  });
});

const url='http://localhost:3000/';
const socket = io(url);


/*
activeTabs: {
      id: {
        id:5,
        url:"http:a.com/",
        scrollLocation : {x:12,y:34},
        pointers: {
          userId : {x: 12, y:34},
          ...

        }
      }
   },
 */
let activeTabs = {};
let userId;
let sessionId;
let windowId;

function createSession(wId) {
  console.log('wid: ', wId);
  windowId = wId;
  fetchActiveTabs();
  registerTabListeners();
}

function fetchActiveTabs() {
  chrome.tabs.query({
    currentWindow: true,
  }, function(tabs) {
    tabs.forEach((tab) => {
      const tabId = tab.id;
      // eslint-disable-next-line max-len
      if (!activeTabs.hasOwnProperty(tabId) && tab.windowId === windowId) {
        activeTabs[tabId] = {
          id: tabId,
          url: tab.url,
        };
      }
    });
  });
}

function registerTabListeners() {
  chrome.tabs.onCreated.addListener((tab) => {
    if (tab.windowId !== windowId) {
      return;
    }
    activeTabs[tab.id] = {
      id: tab.id,
      url: tab.url,
    };
    console.log('emitting create tab with data ', tab.id, tab.url);
    socket.emit('createTab', {
      id: tab.id,
      url: tab.url,
    });
  });

  chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    if (removeInfo.windowId !== windowId) {
      return;
    }
    if (!activeTabs.hasOwnProperty(tabId)) {
      // eslint-disable-next-line max-len
      console.error('Inconsistency: The tab to be removed is not in activeTabs');
      return;
    }
    delete activeTabs[tabId];
    console.log('to remove', removeInfo);

    socket.emit('closeTab', {
      id: tabId,
    });
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab.windowId !== windowId) {
      return;
    }
    if (!activeTabs.hasOwnProperty(tabId)) {
      // eslint-disable-next-line max-len
      console.error('Inconsistency: The updated tab is not in activeTabs');
      return;
    }
    if (changeInfo.hasOwnProperty(url)) {
      activeTabs[tabId].url = changeInfo.url;
      socket.emit('updateTab', activeTabs[tabId]);
    }
  });

  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    /*
    request = {
      type : 'tabInfo',
      tabId: <tab_id>,
      scrollLocation: {x: 12, y:45},
      pointerLocation: {x: 12, y:45},
    }
    */
    if (request.type === 'tabInfo') {
      const tabId = request.tabId;
      if (!activeTabs.hasOwnProperty(tabId)) {
        // eslint-disable-next-line max-len
        console.error('Inconsistency: Recieved response from untracked tab');
        return;
      }
      activeTabs[tabId].scrollLocation = data.scrollLocation;
      if (!activeTabs[tabId].hasOwnProperty(pointers)) {
        activeTabs[tabId].pointers = {};
      }
      activeTabs[tabId].pointers[userId] = data.pointerLocation;
      socket.emit('updateTab', activeTabs[tabId]);
    }
  });
}


socket.on('userId', (data) => {
  userId = data.userId;
  console.log('Recieved userId: ', userId);
});


// eslint-disable-next-line max-len
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log('receieved request :', request);
  if (request.type === 'createSession') {
    createSession(request.data.windowId);
    console.log('background js received createsession');

    socket.emit('createSession', {activeTabs}, (data) => {
      sessionId = data.sessionId;
      console.log('Recieved sessionId: ', sessionId);
      sendResponse(sessionId);
    });
  } else if (request.type === 'joinSession') {
    sessionId = request.data.sessionId;
    console.log('Emiting join session with sessid: on ID', sessionId); ;
    socket.emit('joinSession', sessionId, (data) => {
      activeTabs = data.activeTabs;
      sendResponse(activeTabs);
    });
    registerTabListeners();
  } else if (request.type === 'getSessionId') {
    sendResponse(sessionId);
  } else if (request.type === 'disconnect') {
    sessionId = null;
    userId = null;
    windowId = null;
    activeTabs = {};
    socket.emit('leaveSession');
  }
  return true;
});


