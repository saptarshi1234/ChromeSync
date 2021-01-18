// can't use strict mode for this file because of socket.io

(function() {
  // make sure the content script is only run once on the page
  if (!window.netflixPartyLoaded) {
    window.netflixPartyLoaded = true;

    //////////////////////////////////////////////////////////////////////////
    // Version                                                              //
    //////////////////////////////////////////////////////////////////////////

    var version = null;

    //////////////////////////////////////////////////////////////////////////
    // Helpers                                                              //
    //////////////////////////////////////////////////////////////////////////

    // returns an action which delays for some time
    var delay = function(milliseconds) {
      return function(result) {
        return new Promise(function(resolve, reject) {
          setTimeout(function() {
            resolve(result);
          }, milliseconds);
        });
      };
    };

    // returns an action which waits until the condition thunk returns true,
    // rejecting if maxDelay time is exceeded
    var delayUntil = function(condition, maxDelay) {
      return function(result) {
        var delayStep = 250;
        var startTime = (new Date()).getTime();
        var checkForCondition = function() {
          if (condition()) {
            return Promise.resolve(result);
          }
          if (maxDelay !== null && (new Date()).getTime() - startTime > maxDelay) {
            return Promise.reject(Error('delayUntil timed out'));
          }
          return delay(delayStep)().then(checkForCondition);
        };
        return checkForCondition();
      };
    };


    // swallow any errors from an action
    // and log them to the console
    var swallow = function(action) {
      return function(result) {
        return action(result).catch(function(e) {
          console.error(e);
        });
      };
    };

    // promise.ensure(fn) method
    // note that this method will not swallow errors
    Promise.prototype.ensure = function(fn) {
      return this.then(fn, function(e) {
        fn();
        throw e;
      });
    };

    //////////////////////////////////////////////////////////////////////////
    // Netflix API                                                          //
    //////////////////////////////////////////////////////////////////////////

    // how many simulated UI events are currently going on
    // don't respond to UI events unless this is 0, otherwise
    // we will mistake simulated actions for real ones
    var uiEventsHappening = 0;

    // if(window.location.toString().indexOf('youtube.com')!=-1){
    var video_element = document.getElementsByTagName('video')[0]; 
    console.log(video_element);

    var force_find_video = function() {
      for(let iframe of jQuery('iframe').get()){
        if(iframe && iframe['src']){
          console.log(iframe['src']);
          document.location = iframe['src'];
          break;
        }
      }        
    }


    // video duration in milliseconds
    var lastDuration = 60 * 60 * 1000;
    var getDuration = function() {
      if (video_element) {
        lastDuration = Math.floor(video_element.duration * 1000);
      }
      return lastDuration;
      
    };

    
    var getState = function() {
     
      return video_element.paused?'paused':'playing';
      
    };

    // current playback position in milliseconds
    var getPlaybackPosition = function() {
      return Math.floor(video_element.currentTime * 1000);
    };

    // wake up from idle mode
    var wakeUp = function() {
      uiEventsHappening += 1;
      video_element.play();
      return delayUntil(function() {
        return getState() !== 'idle';
      }, 2500)().ensure(function() {
        uiEventsHappening -= 1;
      });
    };


    // pause
    var pause = function() {
      console.log('about to pause')
      
      if(getState()==='paused')
        return Promise.resolve();
      uiEventsHappening += 1;
      video_element.pause();
      return delayUntil(function() {
        return getState() === 'paused';
      }, 1000)().then(console.log('helping')).ensure(function() {
        uiEventsHappening -= 1;
      });
    };

    // play
    var play = function() {
      console.log('about to play')
      if(getState()==='playing')
        return Promise.resolve();
      uiEventsHappening += 1;
      video_element.play();
      return delayUntil(function() {
        return getState() === 'playing';
      }, 2500)().then(console.log('helping')).ensure(function() {
        uiEventsHappening -= 1;
      });
    };

   
    // jump to a specific time in the video
    var seekErrorRecent = [];
    var seekErrorMean = 0;
    var seek = function(milliseconds) {
      console.log('seeking to ',milliseconds)
      return function() {
       
        console.log(video_element.currentTime)
        video_element.currentTime = milliseconds/1000;
        return Promise.resolve()
      };
    };

    //////////////////////////////////////////////////////////////////////////
    // Socket                                                               //
    //////////////////////////////////////////////////////////////////////////

    // connection to the server
    url='https://video-stream-party.herokuapp.com/'
    var socket = io(url);

    // get the userId from the server
    var userId = null;
    socket.on('userId', function(data) {
      if (userId === null) {
        userId = data;
      }
    });

    //////////////////////////////////////////////////////////////////////////
    // Chat API                                                             //
    //////////////////////////////////////////////////////////////////////////

    // chat state
    var messages = [];
    var unreadCount = 0;
    var originalTitle = document.title;

    // UI constants
    var chatSidebarWidth = 360;
    var chatSidebarPadding = 16;
    var avatarSize = 20;
    var avatarPadding = 4;
    var avatarBorder = 2;
    var chatVericalMargin = 4;
    var chatInputBorder = 2;
    var chatMessageHorizontalPadding = 8;
    var chatMessageVerticalPadding = 8;
    var presenceIndicatorHeight = 30;

    // this is the markup that needs to be injected onto the page for chat
    var chatHtml = `
      <style>
        #chat-history::-webkit-scrollbar {
          display: none;    // for Chrome
        }
        #chat-history {
          -ms-overflow-style: none;  /* IE and Edge */
          scrollbar-width: none;  /* Firefox */
        }
        #chat-heading{
          text-align: center;
          padding: 10px 0;
          font-family: fantasy;
          color: bisque;
          font-size: 25px;
          margin:1px;
        }
        #chat-header{
          box-sizing: border-box;
          top: 0;
          right: 0;
          position: fixed;
          height: 40px;
          width: ${chatSidebarWidth}px;
          z-index: 9999999999;
          background-color: #112;
        }
        body.with-chat {
          width: calc(100% - ${chatSidebarWidth}px) !important;
        }

        #chat-container, #chat-container * {
          box-sizing: border-box;
        }
    
        #chat-container {
          width: ${chatSidebarWidth}px;
          height: 100%;
          position: fixed;
          top: 0;
          right: 0;
          bottom: 0;
          cursor: auto;
          user-select: text;
          -webkit-user-select: text;
          z-index: 9999999999;
          padding: ${chatSidebarPadding}px;
          background-color: #112;
          border-radius: 0px;
          margin-top:40px;
          font-size: 13px;
        }

        #chat-container #chat-history-container {
          height: calc(100% - ${chatMessageVerticalPadding * 2 + avatarSize + avatarPadding * 2 + avatarBorder * 2 + chatVericalMargin * 2 + presenceIndicatorHeight + 20}px);
          position: relative;
        }

        #chat-container #chat-history-container #chat-history {
          width: ${chatSidebarWidth - chatSidebarPadding * 2}px;
          position: relative;
          max-height: 100%;
          overflow-y:scroll;
        }

        #chat-container #chat-history-container #chat-history .chat-message {
          background-color: #222;
          color: #ddd;
          padding: ${chatMessageVerticalPadding}px ${chatMessageHorizontalPadding}px;
          margin-top: ${chatVericalMargin}px;
          border-radius: 5px;
          word-wrap: break-word;
          overflow: auto;
        }

        #chat-container #chat-history-container #chat-history .chat-message .chat-message-avatar {
          float: left;
          width: ${avatarSize + avatarPadding * 2 + avatarBorder * 2}px;
          height: ${avatarSize + avatarPadding * 2 + avatarBorder * 2}px;
          padding: ${avatarPadding}px;
          border: ${avatarBorder}px solid #444;
          border-radius: 5px;
        }

        #chat-container #chat-history-container #chat-history .chat-message .chat-message-avatar img {
          display: block;
          width: ${avatarSize}px;
          height: ${avatarSize}px;
        }

        #chat-container #chat-history-container #chat-history .chat-message .chat-message-body {
          padding-left: ${avatarSize + avatarPadding * 2 + avatarBorder * 2 + chatMessageHorizontalPadding}px;
          padding-bottom:10px;
          padding-top:10px;
        }

        #chat-container #chat-history-container #chat-history .chat-message.system-message .chat-message-body {
          font-style: italic;
          color: #666;
        }
        .chat-message{

        }

        #chat-container #presence-indicator {
          position: absolute;
          left: ${chatSidebarPadding}px;
          bottom: ${chatSidebarPadding + chatMessageVerticalPadding * 2 + avatarSize + avatarPadding * 2 + avatarBorder * 2 + chatVericalMargin}px;
          width: ${chatSidebarWidth - chatSidebarPadding * 2}px;
          height: ${presenceIndicatorHeight}px;
          line-height: ${presenceIndicatorHeight}px;
          color: #666;
          font-style: italic;
        }

        #chat-container #chat-input-container {
          position: fixed;
          height: ${chatMessageVerticalPadding * 2 + avatarSize + avatarPadding * 2 + avatarBorder * 2}px;
          bottom: ${chatSidebarPadding}px;
          width: ${chatSidebarWidth - chatSidebarPadding * 2}px;
          background-color: #111;
          border: ${chatInputBorder}px solid #333;
          border-radius: 2px;
          overflow: auto;
          cursor: text;
        }

        #chat-container #chat-input-container #chat-input-avatar {
          float: left;
          width: ${avatarSize + avatarPadding * 2 + avatarBorder * 2}px;
          height: ${avatarSize + avatarPadding * 2 + avatarBorder * 2}px;
          padding: ${avatarPadding}px;
          border: ${avatarBorder}px solid #333;
          margin-left: ${chatMessageHorizontalPadding - chatInputBorder}px;
          margin-top: ${chatMessageVerticalPadding - chatInputBorder}px;
          margin-bottom: ${chatMessageVerticalPadding - chatInputBorder}px;
          border-radius: 10px;
        }

        #chat-container #chat-input-container #chat-input-avatar img {
          display: block;
          width: ${avatarSize}px;
          height: ${avatarSize}px;
        }

        #chat-container #chat-input-container #chat-input {
          display: block;
          height: ${avatarSize + avatarPadding * 2 + avatarBorder * 2 + chatMessageVerticalPadding * 2 - chatInputBorder * 2}px;
          line-height: ${avatarSize + avatarPadding * 2 + avatarBorder * 2}px;
          width: ${chatSidebarWidth - chatSidebarPadding * 2 - avatarSize - avatarPadding * 2 - avatarBorder * 2 - chatMessageHorizontalPadding - chatInputBorder}px;
          margin-left: ${avatarSize + avatarPadding * 2 + avatarBorder * 2 + chatMessageHorizontalPadding - chatInputBorder}px;
          background-color: #111;
          border: none;
          outline-style: none;
          color: #ddd;
          padding-top: ${chatMessageVerticalPadding - chatInputBorder}px;
          padding-right: ${chatMessageHorizontalPadding - chatInputBorder}px;
          padding-bottom: ${chatMessageVerticalPadding - chatInputBorder}px;
          padding-left: ${chatMessageHorizontalPadding}px;
        }
      </style>
      <div id="all">
        <div id="chat-header">
          <h2 id="chat-heading">ALL IN ONE CHAT</h2>
        </div>  
        <div id="chat-container">
          <div id="chat-history-container">
            <div id="chat-history"></div>
          </div>
          <div id="presence-indicator">People are typing...</div>
          <div id="chat-input-container">
            <div id="chat-input-avatar"></div>
            <input id="chat-input"></input>
          </div>
        </div>
      </div>
      
      
    `;

    // this is used for the chat presence feature
    var typingTimer = null;

    // set up the chat state, or reset the state if the system has already been set up
    var initChat = function() {
      if (jQuery('#chat-container').length === 0) {
        jQuery('body').append(chatHtml);
        jQuery('#presence-indicator').hide();
        var oldPageX = null;
        var oldPageY = null;
        jQuery('#chat-container').mousedown(function(e) {
          oldPageX = e.pageX;
          oldPageY = e.pageY;
        });
        jQuery('#chat-container').mouseup(function(e) {
          if ((e.pageX - oldPageX) * (e.pageX - oldPageX) + (e.pageY - oldPageY) * (e.pageY - oldPageY) < 5) {
            jQuery('#chat-input').focus();
            e.stopPropagation();
          }
        });
        jQuery('#chat-input-container').click(function(e) {
          jQuery('#chat-input').focus();
        });
        jQuery('#chat-input').keydown(function(e) {
          e.stopPropagation();

          if (e.which === 13) {
            var body = jQuery('#chat-input').val().replace(/^\s+|\s+$/g, '');
            if (body !== '') {
              if (typingTimer !== null) {
                clearTimeout(typingTimer);
                typingTimer = null;
                socket.emit('typing', { typing: false }, function() {});
              }

              jQuery('#chat-input').prop('disabled', true);
              socket.emit('sendMessage', {
                body: body
              }, function() {
                jQuery('#chat-input').val('').prop('disabled', false).focus();
              });
            }
          } else {
            if (typingTimer === null) {
              socket.emit('typing', { typing: true }, function() {});
            } else {
              clearTimeout(typingTimer);
            }
            typingTimer = setTimeout(function() {
              typingTimer = null;
              socket.emit('typing', { typing: false }, function() {});
            }, 500);
          }
        });
        jQuery('#chat-input-avatar').html(`<img src="data:image/png;base64,${new Identicon(Sha256.hash(userId).substr(0, 32), avatarSize * 2, 0).toString()}" />`);

        // receive messages from the server
        socket.on('sendMessage', function(data) {
          addMessage(data);
        });

        // receive presence updates from the server
        socket.on('setPresence', function(data) {
          setPresenceVisible(data.anyoneTyping);
        });
      } else {
        jQuery('#chat-history').html('');
      }
    };

    // query whether the chat sidebar is visible
    var getChatVisible = function() {
      return jQuery('body').hasClass('with-chat');
    };

    // show or hide the chat sidebar
    var setChatVisible = function(visible) {
      if (visible) {
        jQuery('body').addClass('with-chat');
        jQuery('#all').show();
        if (!document.hasFocus()) {
          clearUnreadCount();
        }
      } else {
        jQuery('#all').hide();
        jQuery('body').removeClass('with-chat');
      }
    };

    // show or hide the "People are typing..." indicator
    var setPresenceVisible = function(visible) {
      if (visible) {
        jQuery('#presence-indicator').show();
      } else {
        jQuery('#presence-indicator').hide();
      }
    };

    // add a message to the chat history
    var addMessage = function(message) {
      messages.push(message);
      jQuery('#chat-history').append(`
        <div class="chat-message${ message.isSystemMessage ? ' system-message' : '' }">
          <div class="chat-message-avatar"><img src="data:image/png;base64,${new Identicon(Sha256.hash(message.userId).substr(0, 32), avatarSize * 2, 0).toString()}" /></div>
          <div class="chat-message-body">${message.body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
        </div>
      `);
      jQuery('#chat-history').scrollTop(jQuery('#chat-history').prop('scrollHeight'));
      unreadCount += 1;
      if (!document.hasFocus()) {
        document.title = '(' + String(unreadCount) + ') ' + originalTitle;
      }
    };

    // clear the unread count
    var clearUnreadCount = function() {
      if (unreadCount > 0) {
        unreadCount = 0;
        document.title = originalTitle;
      }
    };

    // clear the unread count when the window is focused
    jQuery(window).focus(function() {
      if (getChatVisible()) {
        clearUnreadCount();
      }
    });

    //////////////////////////////////////////////////////////////////////////
    // Main logic                                                           //
    //////////////////////////////////////////////////////////////////////////

    // the Netflix player be kept within this many milliseconds of our
    // internal representation for the playback time
    var maxTimeError = 500;

    // the session
    var sessionId = null;
    var lastKnownTime = null;
    var lastKnownTimeUpdatedAt = null;
    var ownerId = null;
    var state = null;
    var videoId = null;


    var sync = function() {
      console.log("Syncing now.. printing at userID " + userId)
      if (sessionId === null) {
        return Promise.resolve();
      }
      let currState = getState()
      if (state === 'paused') {
        var promise;
        if (currState === 'paused') {
          promise = Promise.resolve();
        } else {
          console.log("Pausing playback")
          promise = pause();
        }
        return promise.then(function() {
          if (Math.abs(lastKnownTime - getPlaybackPosition()) > maxTimeError) {
            return seek(lastKnownTime)();
          }
        });
      } else {
        console.log("lastKnownTime = " + lastKnownTime + " state = "+ state+" playing at " + getPlaybackPosition())
        return delayUntil(function() {
          return getState() !== 'loading';
        }, Infinity)().then(function() {
          
          var localTime = getPlaybackPosition();
          var serverTime = lastKnownTime + (state === 'playing' ? ((new Date()).getTime() - (lastKnownTimeUpdatedAt.getTime() + 00)) : 0);
          if (Math.abs(localTime - serverTime) > maxTimeError) {
            if (getState() === 'paused') {
              play();
            }
            return seek(serverTime)().then(function() {
             
            });
          } 
       
        });
      }
    };

    // this is called when we need to send an update to the server
    // waitForChange is a boolean that indicates whether we should wait for
    // the Netflix player to update itself before we broadcast
    var broadcast = function(waitForChange) {
      return function() {
        console.log("Calling brodcast at " + new Date().getTime())
        var callTime = new Date().getTime();
        var promise;
        if (waitForChange) {
          var oldPlaybackPosition = getPlaybackPosition();
          var oldState = getState();
          promise = swallow(delayUntil(function() {
            var newPlaybackPosition = getPlaybackPosition();
            var newState = getState();
            return Math.abs(newPlaybackPosition - oldPlaybackPosition) >= 250 || newState !== oldState;
          }, 2500))();
        } else {
          promise = Promise.resolve();
        }

        return promise.then(delayUntil(function() {
          return getState() !== 'loading';
        }, Infinity)).then(function() {
          var now = new Date();
          var localTime = getPlaybackPosition();
          var serverTime = lastKnownTime + (state === 'playing' ? (now.getTime() - (lastKnownTimeUpdatedAt.getTime() + 00)) : 0);
          var newLastKnownTime = localTime;
          // var newLastKnownTimeUpdatedAt = new Date(now.getTime() - 00);
          var newLastKnownTimeUpdatedAt = new Date(callTime)
          var newState = getState() === 'playing' ? 'playing' : 'paused';
          if (state === newState && Math.abs(localTime - serverTime) < 1) {
            return Promise.resolve();
          } else {
            var oldLastKnownTime = lastKnownTime;
            var oldLastKnownTimeUpdatedAt = lastKnownTimeUpdatedAt;
            var oldState = state;
            lastKnownTime = newLastKnownTime;
            lastKnownTimeUpdatedAt = newLastKnownTimeUpdatedAt;
            state = newState;
            console.log("Dispatching brodcast time at" + newLastKnownTimeUpdatedAt)
            return new Promise(function(resolve, reject) {
              console.log('updating session state to',newState)
              socket.emit('updateSession', {
                lastKnownTime: newLastKnownTime,
                lastKnownTimeUpdatedAt: newLastKnownTimeUpdatedAt.getTime(),
                state: newState
              }, function(data) {
                // console.log(data)
                if (data !== undefined && data.errorMessage !== null) {
                  console.log('invalid response from server to change state')
                  lastKnownTime = oldLastKnownTime;
                  lastKnownTimeUpdatedAt = oldLastKnownTimeUpdatedAt;
                  state = oldState;
                  reject();
                } else {
                  resolve();
                }
              });
            });
          }
        });
      };
    };

    // this is called when data is received from the server
    var receive = function(data) {
      console.log("I recieved some data from the server" + JSON.stringify(data))
      lastKnownTime = data.lastKnownTime;
      lastKnownTimeUpdatedAt = new Date(data.lastKnownTimeUpdatedAt);
      state = data.state;
      return sync;
    };

    // the following allows us to linearize all tasks in the program to avoid interference
    var tasks = null;
    var tasksInFlight = 0;

    var pushTask = function(task) {
      if (tasksInFlight === 0) {
        // why reset tasks here? in case the native promises implementation isn't
        // smart enough to garbage collect old completed tasks in the chain.
        tasks = Promise.resolve();
      }
      tasksInFlight += 1;
      tasks = tasks.then(function() {
        if (getState() === 'idle') {
          swallow(wakeUp)();
        }
      }).then(swallow(task)).then(function() {
        tasksInFlight -= 1;
      });
    };
    if(video_element){
      video_element.addEventListener('play', () => { console.log("Played at" + new Date().getTime()) })
      video_element.addEventListener('pause', () => { console.log("Paused at" + new Date().getTime()) })
    }
    // broadcast the playback state if there is any user activity
    jQuery(window).mouseup(function() {
      if (sessionId !== null && uiEventsHappening === 0) {
        pushTask(function() {
          return broadcast(true)().catch(sync);
        });
      }
    });

    jQuery(window).keydown(function() {
      if (sessionId !== null && uiEventsHappening === 0) {
        pushTask(function() {
          return broadcast(true)().catch(sync);
        });
      }
    });

    

    socket.on('connect', function() {
      console.log("Connect signal recieved")
      // pushTask(ping);
      if(!video_element)return;
      setInterval(function() {
        if (tasksInFlight === 0) {
          
          var tempString = window.location.href;
          var newVideoId = tempString;

          if(tempString.indexOf('npSessionId') != -1)
            tempString = tempString.substring(0,tempString.indexOf('npSessionId')-1);
          var newVideoId = tempString;
          if (videoId !== null && videoId !== newVideoId) {
            videoId = newVideoId;
            // sessionId = null;
            setChatVisible(false);
          }

          // pushTask(ping);
          pushTask(sync);
        }
      }, 1000);
    });

    // if the server goes down, it can reconstruct the session with this
    socket.on('reconnect', function() {
      if(!video_element)return;
      if (sessionId !== null) {
        socket.emit('reboot', {
          host:location.host,
          sessionId: sessionId,
          lastKnownTime: lastKnownTime,
          lastKnownTimeUpdatedAt: lastKnownTimeUpdatedAt.getTime(),
          messages: messages,
          state: state,
          ownerId: ownerId,
          userId: userId,
          videoId: videoId
        }, function(data) {
          pushTask(receive(data));
        });
      }
    });

    // respond to updates from the server
    socket.on('update', function(data) {
      if(!video_element)return;
      pushTask(receive(data));
    });

    // interaction with the popup
    chrome.runtime.onMessage.addListener(
      function(request, sender, sendResponse) {
        if (request.type === 'getInitData') {
          version = request.data.version;
          if(video_element)
            sendResponse({
              sessionId: sessionId,
              chatVisible: getChatVisible()
            });
          else if(jQuery('iframe').get().length > 0)
          sendResponse({
            errorMessage: 'Could not find video in this page ... \n click on force find to search through iframes',
            code:1,
          });
          else
          sendResponse({
            errorMessage: 'Could not find video in this page ',
          });
          return;
        }

        if (request.type === 'forceFind') {
          force_find_video();
          return true;
        }

        if (request.type === 'createSession') {
          console.log('videoID',request.data.videoId)
          socket.emit('createSession', {
            controlLock: request.data.controlLock,
            videoId: request.data.videoId,
            host:location.host,
          }, function(data) {
            initChat();
            setChatVisible(true);
            lastKnownTime = data.lastKnownTime;
            lastKnownTimeUpdatedAt = new Date(data.lastKnownTimeUpdatedAt);
            messages = [];
            sessionId = data.sessionId;
            ownerId = request.data.controlLock ? userId : null;
            state = data.state;
            videoId = request.data.videoId;
            console.log('sessionID from server',sessionId)
            pushTask(broadcast(false));
            sendResponse({
              sessionId: sessionId
            });
          });
          return true;
        }

        if (request.type === 'joinSession') {
          socket.emit('joinSession', request.data.sessionId, function(data) {
            if (data.errorMessage) {
              sendResponse({
                errorMessage: data.errorMessage
              });
              return;
            }

            if (data.videoId !== request.data.videoId) {
              socket.emit('leaveSession', null, function(data) {
                sendResponse({
                  errorMessage: 'That session is for a different video.'
                });
              });
              return;
            }

            initChat();
            setChatVisible(true);
            sessionId = request.data.sessionId;
            console.log(sessionId)
            lastKnownTime = data.lastKnownTime;
            lastKnownTimeUpdatedAt = new Date(data.lastKnownTimeUpdatedAt);
            messages = [];
            for (var i = 0; i < data.messages.length; i += 1) {
              addMessage(data.messages[i]);
            }
            ownerId = data.ownerId;
            state = data.state;
            videoId = request.data.videoId;
            pushTask(receive(data));
            sendResponse({});
          });
          return true;
        }

        if (request.type === 'leaveSession') {
          socket.emit('leaveSession', null, function(_) {
            sessionId = null;
            setChatVisible(false);
            sendResponse({});
          });
          return true;
        }

        if (request.type === 'showChat') {
          if (request.data.visible) {
            setChatVisible(true);
          } else {
            setChatVisible(false);
          }
          sendResponse({});
        }
      }
    );
  }
})();
