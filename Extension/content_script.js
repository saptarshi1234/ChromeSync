/* eslint-disable max-len */
(function() {
  /* eslint-disable require-jsdoc */
  let pointerLocation = {x: 0, y: 0};
  let tabData;
  let userId;
  let scrollEnable = false;
  const dots = {};

  function getMaxScrollY() {
    const scrollHeight = Math.max(
        document.body.scrollHeight, document.documentElement.scrollHeight,
        document.body.offsetHeight, document.documentElement.offsetHeight,
        document.body.clientHeight, document.documentElement.clientHeight,
    );
    return scrollHeight;
  }

  function getMaxScrollX() {
    const scrollWidth = Math.max(
        document.body.scrollWidth, document.documentElement.scrollWidth,
        document.body.offsetWidth, document.documentElement.offsetWidth,
        document.body.clientWidth, document.documentElement.clientWidth,
    );
    return scrollWidth;
  }

  function getRandomColor() {
    return parseInt(Math.random()*255);
  }

  function createDot(uid) {
    const existingDot = document.getElementById(`pointer-overlay-${uid}`);
    if (existingDot !== null) {
      dots[uid] = existingDot;
      return;
    }
    const element = `<div id="pointer-overlay-${uid}" style="
      position: fixed;
      display: block;
      width: 10px;
      height: 10px;
      top: 200px;
      left: 100px;
      background-color: rgb(${getRandomColor()} ${getRandomColor()} ${getRandomColor()} / 94%);
      z-index: 2;
      cursor: pointer;
      border-radius: 5px;
      "></div>
      `;
    document.body.insertAdjacentHTML('beforeEnd', element);
    const dot = document.getElementById(`pointer-overlay-${uid}`);
    dots[uid] = dot;
  }


  setInterval(() => {
    scrollEnable = !scrollEnable;
  }, 5);

  window.onscroll = (data) => {
    if (scrollEnable) return;
    console.log('On scroll fired with data: ', data);
    console.log(window.scrollX, window.scrollY);
    // eslint-disable-next-line max-len
    tabData.scrollLocation = {x: window.scrollX / getMaxScrollX(), y: window.scrollY / getMaxScrollY()};
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
    const relativeX = x / window.outerWidth;
    const relativeY = y / window.outerHeight;
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
    window.scrollTo(x * getMaxScrollX(), y * getMaxScrollY());
    return;
  }

  function updatePointers(pointers) {
    console.log('the pointers are', pointers);
    Object.keys(pointers).forEach((uId) => {
      if (uId !== userId) {
        const pointer = pointers[uId];
        if (!dots.hasOwnProperty(uId)) {
          createDot(uId);
          console.log('dots are: ', dots);
        }
        const dot = dots[uId];
        dot.style.top = `${pointer.y * window.outerHeight}px`;
        dot.style.left = `${pointer.x * window.outerWidth}px`;
      }
    });
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

