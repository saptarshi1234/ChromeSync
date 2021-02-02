(function() {
  /* eslint-disable require-jsdoc */
  let pointerLocation = {x: 0, y: 0};
  let tabData;
  let userId;
  let scrollEnable = false;

  setInterval(() => {
    scrollEnable = !scrollEnable;
  }, 100);

  window.onscroll = (data) => {
    if (scrollEnable) return;
    console.log('On scroll fired with data: ', data);
    console.log(window.scrollX, window.scrollY);
    tabData.scrollLocation = {x: window.scrollX, y: window.scrollY};
    sendTabInfo();
  };

  window.addEventListener('mousemove', (e) => {
    onPointerChange(e.x, e.y);
  });

  // eslint-disable-next-line require-jsdoc
  function onPointerChange(x, y) {
    if (userId === undefined || userId === null) return;

    if (!tabData.hasOwnProperty('pointers')) {
      tabData.pointers = {};
    }
    const relativeX = x / window.innerWidth;
    const relativeY = y / window.innerHeight;
    tabData.pointers[userId] = {
      x: relativeX, y: relativeY,
    };


    pointerLocation = {x, y};
    console.log('Current pointer location:', pointerLocation);
    sendTabInfo();
  }

  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.type === 'updateTab') {
      console.log('receieved update tab', request.data);
      tabData = request.data;
      if (request.hasOwnProperty('userId')) {
        userId = request.userId;
      }
      updateTab();
    }
  });


  // eslint-disable-next-line require-jsdoc
  function updateTab() {
    if (tabData.hasOwnProperty('url')) {
      if (location.href !== tabData.url) {
      // eslint-disable-next-line max-len
        console.error('Incosnsitency: URLs do not match, location:', location.href);
      }
    }
    if (tabData.hasOwnProperty('scrollLocation')) {
      updateWindowScroll(tabData.scrollLocation.x, tabData.scrollLocation.y);
    }
    if (tabData.hasOwnProperty('pointers')) {
      updatePointers(tabData.pointers);
    }
  }

  function updateWindowScroll(x, y) {
    if (!scrollEnable) return;
    window.scrollTo(x, y);
    return;
  }
  function updatePointers(pointers) {
    console.log(pointers);
    // TODO update pointers of all users
    return;
  }

  function sendTabInfo() {
    console.log('Sending Tab info to background.js: ', tabData);
    chrome.runtime.sendMessage({
      type: 'tabInfo',
      data: tabData,
    });
  }
})();

