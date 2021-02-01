'use strict';

jQuery(function() {
  var getURLParameter = function(url, key) {
    var searchString = '?' + url.split('?')[1];
    if (searchString === undefined) {
      return null;
    }
    var escapedKey = key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    var regex = new RegExp('[?|&]' + escapedKey + '=' + '([^&]*)(&|$)');
    var match = regex.exec(searchString);
    if (match === null) {
      return null;
    }
    return decodeURIComponent(match[1]);
  };

  // get the current tab
  chrome.tabs.query({
      active: true,
      currentWindow: true
    }, function(tabs) {
      // error handling
      var showError = function(err) {
        jQuery('.some-error').removeClass('hidden');
        jQuery('.no-error').addClass('hidden');
        jQuery('#error-msg').html(err);
      };

      // jQuery('#close-error').click(function() {
      //   jQuery('.no-error').removeClass('hidden');
      //   jQuery('.some-error').addClass('hidden');
      // });

      // set up the spinner
      var startSpinning = function() {
        jQuery('#control-lock').prop('disabled', true);
        jQuery('#create-session').prop('disabled', true);
        jQuery('#leave-session').prop('disabled', true);
      };

      var stopSpinning = function() {
        jQuery('#control-lock').prop('disabled', false);
        jQuery('#create-session').prop('disabled', false);
        jQuery('#leave-session').prop('disabled', false);
      };

      // send a message to the content script
      var sendMessage = function(type, data, callback) {
        startSpinning();
        chrome.tabs.executeScript(tabs[0].id, {
          file: 'content_script.js'
        }, function() {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: type,
            data: data
          }, function(response) {
            stopSpinning();
            if (response.errorMessage) {
              showError(response.errorMessage);
              let f = response.executeFind;
              if(response.code === 1){
                jQuery('#force-find').removeClass('hidden');
                jQuery('#force-find').addClass('btn btn-warning');
                jQuery('#force-find').click(()=>{
                  chrome.tabs.sendMessage(tabs[0].id, {type:'forceFind'});
                  setTimeout(()=>window.close(),2000);
                });
                return;
              }
              setTimeout(()=>window.close(),2000);
              return;
            }
            if (callback) {
              callback(response);
            }
          });
        });
      };

      // connected/disconnected state
      var showConnected = function(sessionId) {
        var urlWithSessionId = tabs[0].url
        if(tabs[0].url.indexOf('?')==-1)
          var urlWithSessionId = tabs[0].url + '?npSessionId=' + encodeURIComponent(sessionId);
        else if(tabs[0].url.indexOf('npSessionId')==-1)
         var urlWithSessionId = tabs[0].url + '&npSessionId=' + encodeURIComponent(sessionId);

        jQuery('.disconnected').addClass('hidden');
        jQuery('.connected').removeClass('hidden');
        jQuery('#show-chat').prop('checked', true);
        jQuery('#share-url').val(urlWithSessionId).focus().select();
      };

      var showDisconnected = function() {
        jQuery('.disconnected').removeClass('hidden');
        jQuery('.connected').addClass('hidden');
        jQuery('#control-lock').prop('checked', false);
      };

      // get the session if there is one
      sendMessage('getInitData', {
        version: chrome.app.getDetails().version
      }, function(initData) {
        // parse the video ID from the URL
        // var videoId = parseInt(tabs[0].url.match(/^.*\/([0-9]+)\??.*/)[1]);
        var videoId = tabs[0].url.split('npSessionId')[0];
        if(videoId.endsWith('?')||videoId.endsWith('&'))
          videoId = videoId.substring(0,videoId.length-1);
        console.log(videoId)

        // initial state
        if (initData.errorMessage) {
          showError(initData.errorMessage);
          return;
        }
        if (initData.sessionId === null) {
          var sessionIdFromUrl = getURLParameter(tabs[0].url, 'npSessionId');
          if (sessionIdFromUrl) {
            sendMessage('joinSession', {
              sessionId: sessionIdFromUrl.replace(/^\s+|\s+$/g, '').toLowerCase(),
              videoId: videoId
            }, function(response) {
              showConnected(sessionIdFromUrl);
            });
          }
        } else {
          showConnected(initData.sessionId);
        }
        jQuery('#show-chat').prop('checked', initData.chatVisible);

        // listen for clicks on the "Create session" button
        jQuery('#create-session').click(function() {
          sendMessage('createSession', {
            controlLock: jQuery('#control-lock').is(':checked'),
            videoId: videoId
          }, function(response) {
            showConnected(response.sessionId);
          });
        });

        // listen for clicks on the "Leave session" button
        jQuery('#leave-session').click(function() {
          sendMessage('leaveSession', {}, function(response) {
            showDisconnected();
          });
        });

        // listen for clicks on the "Show chat" checkbox
        jQuery('#show-chat').change(function() {
          sendMessage('showChat', { visible: jQuery('#show-chat').is(':checked') }, null);
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
      });
    }
  );
});
