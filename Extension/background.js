/* eslint-disable max-len */
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

const url='https://chromesync.herokuapp.com/';
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
// store all tabs with server ids
let activeTabs = {};
let userId;
let sessionId;
let windowId;

// Maps chrome tab ids to the server ids
let tabMappings = {};
// Maps server ids to chrome tab ids
const tabReverseMappings = {};


const reverseMappings = () => {
  for (const key in tabMappings) {
    if (Object.hasOwnProperty.call(tabMappings, key)) {
      const value = tabMappings[key];
      tabReverseMappings[value] = parseInt(key);
    }
  }
};

function createSession(wId, sendResponse) {
  console.log('wid: ', wId);
  windowId = wId;
  fetchActiveTabs(sendResponse);
  registerTabListeners();
}

function fetchActiveTabs(sendResponse) {
  chrome.tabs.query({
    currentWindow: true,
  }, function(tabs) {
    activeTabs = {};
    console.log(tabs);
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
    socket.emit('createSession', {activeTabs}, (data) => {
      sessionId = data.sessionId;
      tabMappings = data.tabMappings;
      reverseMappings();

      const temp = Object.assign({}, activeTabs);
      activeTabs = {};
      for (const key in temp) {
        if (Object.hasOwnProperty.call(temp, key)) {
          const tabInfo = temp[key];
          const newId = tabMappings[key];
          tabInfo.id = newId;
          activeTabs[newId] = tabInfo;
        }
      }
      console.log('Recieved sessionId: ', sessionId);
      sendResponse(sessionId);
      Object.keys(tabMappings).forEach((tid) => {
        executeContentScript(parseInt(tid));
        console.log('executing content script on ', tid);
      });
    });
  });
}
function onTabCreateListener(tab) {
  console.log('A tab was created: ', tab);
  console.log('tab.windowid ', tab.windowId, 'windowid: ', windowId);
  if (tab.windowId !== windowId) {
    return;
  }
  executeContentScript(tab.id);

  console.log('emitting create tab with data ', tab);
  socket.emit('newTab', {
    id: tab.id,
    url: tab.url,
  }, (data) => {
    tabMappings[tab.id] = data.id;
    tabReverseMappings[data.id] = tab.id;
    activeTabs[data.id] = {
      id: data.id,
      url: tab.url,
    };
  });
}

function onTabRemoveListener(chromeTabId, removeInfo) {
  const tabId = tabMappings[chromeTabId];
  console.log('A tab was deleted with tabid', tabId, 'and removeinfo :', removeInfo);
  if (removeInfo.windowId !== windowId) {
    return;
  }
  if (!activeTabs.hasOwnProperty(tabId)) {
    // eslint-disable-next-line max-len
    console.error('Inconsistency: The tab to be removed is not in activeTabs');
    return;
  }
  delete activeTabs[tabId];
  delete tabMappings[chromeTabId];
  delete tabReverseMappings[tabId];
  console.log('to remove', removeInfo);

  socket.emit('closeTab', {
    id: tabId,
  });
}

function onTabUpdateListener(tabId, changeInfo, tab) {
  console.log('Updating tab:', tab, 'and change Info', changeInfo);
  if (tab.windowId !== windowId) {
    return;
  }
  tabId = tabMappings[tabId];
  if (!activeTabs.hasOwnProperty(tabId)) {
    // eslint-disable-next-line max-len
    console.error('Inconsistency: The updated tab is not in activeTabs');
    return;
  }
  let newUrl = '';
  if (changeInfo.hasOwnProperty(url)) {
    newUrl = changeInfo.url;
  } else {
    newUrl = tab.url;
  }
  if (newUrl !== activeTabs[tabId].url) {
    activeTabs[tabId].url = newUrl;
    executeContentScript(tabReverseMappings[tabId]);

    console.log('emitting update tab, ', tabId);
    socket.emit('updateTab', activeTabs[tabId]);
  }
  if (changeInfo.status === 'complete') {
    executeContentScript(tabReverseMappings[tabId]);
  }
}

function executeContentScript(tabId) {
  chrome.tabs.executeScript(tabId, {
    file: 'content_script.js',
  }, (result) => {
    console.log('Content script succesfully executed on tabId: ', tabId, 'result: ', result );
    chrome.tabs.sendMessage(tabId, {type: 'updateTab', data: activeTabs[tabMappings[tabId]], userId: userId}, () => {
      console.log('Tab info delievered to tab', tabId);
    });
  });
}

function onUpdateContentListener(request, sender, sendResponse) {
  /*
  request = {
    type : 'tabInfo',
    tabId: <tab_id>,
    scrollLocation: {x: 12, y:45},
    pointerLocation: {x: 12, y:45},
  }
  */
  console.log('********* onupdatelistener called');
  if (request.type === 'tabInfo') {
    const data = request.data;
    const serverTabId = data.id;

    if (!activeTabs.hasOwnProperty(serverTabId)) {
      // eslint-disable-next-line max-len
      console.error('Inconsistency: Recieved response from untracked tab');
      return;
    }
    activeTabs[serverTabId] = data;
    console.log('Updating tab from content script for tab: ', serverTabId, 'with data: ', data);
    socket.emit('updateTab', activeTabs[serverTabId]);
  }
}
function registerTabListeners() {
  chrome.tabs.onCreated.addListener(onTabCreateListener);
  chrome.tabs.onRemoved.addListener(onTabRemoveListener);
  chrome.tabs.onUpdated.addListener(onTabUpdateListener);
  chrome.runtime.onMessage.addListener(onUpdateContentListener);
}

function unregisterTabListeners() {
  chrome.tabs.onCreated.removeListener(onTabCreateListener);
  chrome.tabs.onRemoved.removeListener(onTabRemoveListener);
  chrome.tabs.onUpdated.removeListener(onTabUpdateListener);
  chrome.runtime.onMessage.removeListener(onUpdateContentListener);
}


socket.on('userId', (data) => {
  userId = data.userId;
  console.log('Recieved userId: ', userId);
});

socket.on('newTab', (data) => {
  console.log('received socket msg to create new tab:', data);
  unregisterTabListeners();
  chrome.tabs.create({
    active: false,
    url: data.url,
    windowId: windowId,
  }, (tab) => {
    console.log(tab);
    tabMappings[tab.id] = data.id;
    tabReverseMappings[data.id] = tab.id;
    activeTabs[data.id] = data;
    executeContentScript(tab.id);
    registerTabListeners();
  });
});
socket.on('updateTab', (data) => {
  const chromeTabId = tabReverseMappings[data.id];
  const updateContentScript = () => {
    chrome.tabs.sendMessage(chromeTabId, {
      type: 'updateTab',
      data: data,
    }, () => {
      console.log('updateTab message sent to tabId: ', chromeTabId, ' with data: ', data);
    });
  };
  console.log('received socket msg to update tab: ', data, 'for tabId: ', chromeTabId);
  if (data.url !== activeTabs[data.id].url) {
    chrome.tabs.update(
        chromeTabId,
        {url: data.url},
        (tab) => {
          console.log('updated url: ', tab);
          activeTabs[data.id] = data;
          executeContentScript(tab.id);
        },
    );
  }
  updateContentScript();
});
socket.on('closeTab', (data) => {
  unregisterTabListeners();
  const tabId = tabReverseMappings[data.id];
  console.log('closing tab: ', tabId);
  chrome.tabs.remove(tabId, () => {
    console.log('deleted tab', data.id);
    delete activeTabs[data.id];
    delete tabMappings[tabId];
    delete tabReverseMappings[data.id];
    registerTabListeners();
  });
});

// eslint-disable-next-line max-len
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log('receieved request :', request);
  if (request.type === 'createSession') {
    console.log('active tabs are:', activeTabs);
    console.log('Creating session');
    createSession(request.data.windowId, sendResponse);
  } else if (request.type === 'joinSession') {
    sessionId = request.data.sessionId;
    windowId = request.data.windowId;

    console.log('Emiting join session with sessid:', sessionId); ;
    socket.emit('joinSession', sessionId, (data) => {
      console.log('background.js, joinSession:', data);
      activeTabs = data.activeTabs;
      Object.values(activeTabs).forEach((tab) => {
        console.log('creating tab', tab);
        chrome.tabs.create({
          windowId: windowId,
          url: tab.url,
        }, (newTab) => {
          console.log('New tab is created: ', newTab);
          tabMappings[newTab.id] = tab.id;
          tabReverseMappings[tab.id] = newTab.id;
          executeContentScript(newTab.id);
        });
      });
      registerTabListeners();
      sendResponse(null);
    });
  } else if (request.type === 'getSessionId') {
    sendResponse(sessionId);
  } else if (request.type === 'leaveSession') {
    sessionId = null;
    userId = null;
    windowId = null;
    // activeTabs = {};
    console.log('Leaving session');
    socket.emit('leaveSession');
  }
  return true;
});


