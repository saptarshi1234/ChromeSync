'use strict';

jQuery(function() {
  // get the current tab
  let sessionId;
  let windowId;
  chrome.tabs.query({
    // active: true,
    currentWindow: true,
  }, function(tabs) {
    console.log(tabs);
    // eslint-disable-next-line no-unused-vars
    const showError = function(err) {
      jQuery('.some-error').removeClass('hidden');
      jQuery('.no-error').addClass('hidden');
      jQuery('#error-msg').html(err);
    };

    // set up the spinner
    const startSpinning = function() {
      jQuery('#control-lock').prop('disabled', true);
      jQuery('#create-session').prop('disabled', true);
      jQuery('#leave-session').prop('disabled', true);
    };

    const stopSpinning = function() {
      jQuery('#control-lock').prop('disabled', false);
      jQuery('#create-session').prop('disabled', false);
      jQuery('#leave-session').prop('disabled', false);
    };

    // connected/disconnected state
    const showConnected = function(sessionId) {
      console.log('show connected', sessionId);
      jQuery('.disconnected').addClass('hidden');
      jQuery('.connected').removeClass('hidden');
      jQuery('#share-url').val(sessionId).focus().select();
    };


    const showDisconnected = function() {
      jQuery('.disconnected').removeClass('hidden');
      jQuery('.connected').addClass('hidden');
      jQuery('#control-lock').prop('checked', false);
    };

    // send a message to the content script
    const sendMessage = function(type, data, callback) {
      startSpinning();
      console.log(data);
      chrome.runtime.sendMessage({
        sender: 'popup',
        type: type,
        data: data,
      }, (res) => {
        console.log(res);
        callback(res);
        stopSpinning();
      });
    };

    sendMessage('getSessionId', {}, (sId) => {
      sessionId = sId;
      if (sId !== null) {
        showConnected(sessionId);
      }
    });

    // listen for clicks on thge "Create session" button
    jQuery('#create-session').click(function() {
      windowId = tabs[0].windowId;
      console.log(windowId);
      sendMessage('createSession', {
        windowId: windowId,
      }, function(response) {
        sessionId = response;
        showConnected(sessionId);
      });
    });

    jQuery('#join-session').click(function() {
      sessionId = jQuery('session-input').val();
      chrome.windows.create({
        focused: true,
        state: 'maximized',
      },
      function(window) {
        console.log(window);
      },
      );
      sendMessage('joinSession', {
        sessionId: sessionId,
      }, function(response) {
        showConnected(sessionId);
        response.activeTabs.forEach((tab) => {
          chrome.tabs.create({
            index: tab.id,
            windowId: windowId,
            url: tab.url,
          });
        });
      });
    });

    // listen for clicks on the "Leave session" button
    jQuery('#leave-session').click(function() {
      sendMessage('leaveSession', {}, function(response) {
        showDisconnected();
      });
    });

    // listen for clicks on the share URL box
    jQuery('#share-url').click(function(e) {
      e.stopPropagation();
      e.preventDefault();
      jQuery('#share-url').select();
    });

    // listen for clicks on the "Copy URL" link
    jQuery('#copy-btn').click(function(e) {
      e.stopPropagation();
      e.preventDefault();
      jQuery('#share-url').select();
      document.execCommand('copy');
    });
  },

  );
});
