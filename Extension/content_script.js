/* eslint-disable no-extend-native */
/* eslint-disable max-len */
// can't use strict mode for this file because of socket.io

(function() {
  // make sure the content script is only run once on the page
  if (!window.netflixPartyLoaded) {
    window.netflixPartyLoaded = true;

    // ////////////////////////////////////////////////////////////////////////
    // Version                                                              //
    // ////////////////////////////////////////////////////////////////////////

    let version = null;

    // ////////////////////////////////////////////////////////////////////////
    // Helpers                                                              //
    // ////////////////////////////////////////////////////////////////////////

    // returns an action which delays for some time
    const delay = function(milliseconds) {
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
    const delayUntil = function(condition, maxDelay) {
      return function(result) {
        const delayStep = 250;
        const startTime = (new Date()).getTime();
        const checkForCondition = function() {
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
    const swallow = function(action) {
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

    // ////////////////////////////////////////////////////////////////////////
    // Netflix API                                                          //
    // ////////////////////////////////////////////////////////////////////////

    // how many simulated UI events are currently going on
    // don't respond to UI events unless this is 0, otherwise
    // we will mistake simulated actions for real ones
    let uiEventsHappening = 0;

    // if(window.location.toString().indexOf('youtube.com')!=-1){
    const videoElement = document.getElementsByTagName('video')[0];
    console.log(videoElement);

    const forceFindVideo = function() {
      for (const iframe of jQuery('iframe').get()) {
        if (iframe && iframe['src']) {
          console.log(iframe['src']);
          document.location = iframe['src'];
          break;
        }
      }
    };


    // video duration in milliseconds
    let lastDuration = 60 * 60 * 1000;
    const getDuration = function() {
      if (videoElement) {
        lastDuration = Math.floor(videoElement.duration * 1000);
      }
      return lastDuration;
    };


    const getState = function() {
      return videoElement.paused?'paused':'playing';
    };

    // current playback position in milliseconds
    const getPlaybackPosition = function() {
      return Math.floor(videoElement.currentTime * 1000);
    };

    // wake up from idle mode
    const wakeUp = function() {
      uiEventsHappening += 1;
      videoElement.play();
      return delayUntil(function() {
        return getState() !== 'idle';
      }, 2500)().ensure(function() {
        uiEventsHappening -= 1;
      });
    };


    // pause
    const pause = function() {
      console.log('about to pause');

      if (getState()==='paused') {
        return Promise.resolve();
      }
      uiEventsHappening += 1;
      videoElement.pause();
      return delayUntil(function() {
        return getState() === 'paused';
      }, 1000)().then(console.log('helping')).ensure(function() {
        uiEventsHappening -= 1;
      });
    };

    // play
    const play = function() {
      console.log('about to play');
      if (getState()==='playing') {
        return Promise.resolve();
      }
      uiEventsHappening += 1;
      videoElement.play();
      return delayUntil(function() {
        return getState() === 'playing';
      }, 2500)().then(console.log('helping')).ensure(function() {
        uiEventsHappening -= 1;
      });
    };


    // jump to a specific time in the video
    const seekErrorRecent = [];
    const seekErrorMean = 0;
    const seek = function(milliseconds) {
      console.log('seeking to ', milliseconds);
      return function() {
        console.log(videoElement.currentTime);
        videoElement.currentTime = milliseconds/1000;
        return Promise.resolve();
      };
    };

    // ////////////////////////////////////////////////////////////////////////
    // Socket                                                               //
    // ////////////////////////////////////////////////////////////////////////

    // connection to the server
    url='https://video-stream-party.herokuapp.com/';
    const socket = io(url);

    // get the userId from the server
    let userId = null;
    socket.on('userId', function(data) {
      if (userId === null) {
        userId = data;
      }
    });

    // ////////////////////////////////////////////////////////////////////////
    // Chat API                                                             //
    // ////////////////////////////////////////////////////////////////////////


    // ////////////////////////////////////////////////////////////////////////
    // Main logic                                                           //
    // ////////////////////////////////////////////////////////////////////////

    // the Netflix player be kept within this many milliseconds of our
    // internal representation for the playback time
    const maxTimeError = 500;

    // the session
    let sessionId = null;
    let lastKnownTime = null;
    let lastKnownTimeUpdatedAt = null;
    let ownerId = null;
    let state = null;
    let videoId = null;


    const sync = function() {
      console.log('Syncing now.. printing at userID ' + userId);
      if (sessionId === null) {
        return Promise.resolve();
      }
      const currState = getState();
      if (state === 'paused') {
        let promise;
        if (currState === 'paused') {
          promise = Promise.resolve();
        } else {
          console.log('Pausing playback');
          promise = pause();
        }
        return promise.then(function() {
          if (Math.abs(lastKnownTime - getPlaybackPosition()) > maxTimeError) {
            return seek(lastKnownTime)();
          }
        });
      } else {
        console.log('lastKnownTime = ' + lastKnownTime + ' state = '+ state+' playing at ' + getPlaybackPosition());
        return delayUntil(function() {
          return getState() !== 'loading';
        }, Infinity)().then(function() {
          const localTime = getPlaybackPosition();
          const serverTime = lastKnownTime + (state === 'playing' ? ((new Date()).getTime() - (lastKnownTimeUpdatedAt.getTime() + 00)) : 0);
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
    const broadcast = function(waitForChange) {
      return function() {
        console.log('Calling brodcast at ' + new Date().getTime());
        const callTime = new Date().getTime();
        let promise;
        if (waitForChange) {
          const oldPlaybackPosition = getPlaybackPosition();
          const oldState = getState();
          promise = swallow(delayUntil(function() {
            const newPlaybackPosition = getPlaybackPosition();
            const newState = getState();
            return Math.abs(newPlaybackPosition - oldPlaybackPosition) >= 250 || newState !== oldState;
          }, 2500))();
        } else {
          promise = Promise.resolve();
        }

        return promise.then(delayUntil(function() {
          return getState() !== 'loading';
        }, Infinity)).then(function() {
          const now = new Date();
          const localTime = getPlaybackPosition();
          const serverTime = lastKnownTime + (state === 'playing' ? (now.getTime() - (lastKnownTimeUpdatedAt.getTime() + 00)) : 0);
          const newLastKnownTime = localTime;
          // var newLastKnownTimeUpdatedAt = new Date(now.getTime() - 00);
          const newLastKnownTimeUpdatedAt = new Date(callTime);
          const newState = getState() === 'playing' ? 'playing' : 'paused';
          if (state === newState && Math.abs(localTime - serverTime) < 1) {
            return Promise.resolve();
          } else {
            const oldLastKnownTime = lastKnownTime;
            const oldLastKnownTimeUpdatedAt = lastKnownTimeUpdatedAt;
            const oldState = state;
            lastKnownTime = newLastKnownTime;
            lastKnownTimeUpdatedAt = newLastKnownTimeUpdatedAt;
            state = newState;
            console.log('Dispatching brodcast time at' + newLastKnownTimeUpdatedAt);
            return new Promise(function(resolve, reject) {
              console.log('updating session state to', newState);
              socket.emit('updateSession', {
                lastKnownTime: newLastKnownTime,
                lastKnownTimeUpdatedAt: newLastKnownTimeUpdatedAt.getTime(),
                state: newState,
              }, function(data) {
                // console.log(data)
                if (data !== undefined && data.errorMessage !== null) {
                  console.log('invalid response from server to change state');
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
    const receive = function(data) {
      console.log('I recieved some data from the server' + JSON.stringify(data));
      lastKnownTime = data.lastKnownTime;
      lastKnownTimeUpdatedAt = new Date(data.lastKnownTimeUpdatedAt);
      state = data.state;
      return sync;
    };

    // the following allows us to linearize all tasks in the program to avoid interference
    let tasks = null;
    let tasksInFlight = 0;

    const pushTask = function(task) {
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
    if (videoElement) {
      videoElement.addEventListener('play', () => {
        console.log('Played at' + new Date().getTime());
      });
      videoElement.addEventListener('pause', () => {
        console.log('Paused at' + new Date().getTime());
      });
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
      console.log('Connect signal recieved');
      // pushTask(ping);
      if (!videoElement) return;
      setInterval(function() {
        if (tasksInFlight === 0) {
          let tempString = window.location.href;
          var newVideoId = tempString;

          if (tempString.indexOf('npSessionId') != -1) {
            tempString = tempString.substring(0, tempString.indexOf('npSessionId')-1);
          }
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
      if (!videoElement) return;
      if (sessionId !== null) {
        socket.emit('reboot', {
          host: location.host,
          sessionId: sessionId,
          lastKnownTime: lastKnownTime,
          lastKnownTimeUpdatedAt: lastKnownTimeUpdatedAt.getTime(),
          messages: messages,
          state: state,
          ownerId: ownerId,
          userId: userId,
          videoId: videoId,
        }, function(data) {
          pushTask(receive(data));
        });
      }
    });

    // respond to updates from the server
    socket.on('update', function(data) {
      if (!videoElement) return;
      pushTask(receive(data));
    });

    // interaction with the popup
    chrome.runtime.onMessage.addListener(
        function(request, sender, sendResponse) {
          if (request.type === 'getInitData') {
            version = request.data.version;
            if (videoElement) {
              sendResponse({
                sessionId: sessionId,
                chatVisible: getChatVisible(),
              });
            } else if (jQuery('iframe').get().length > 0) {
              sendResponse({
                errorMessage: 'Could not find video in this page ... \n click on force find to search through iframes',
                code: 1,
              });
            } else {
              sendResponse({
                errorMessage: 'Could not find video in this page ',
              });
            }
            return;
          }

          if (request.type === 'forceFind') {
            forceFindVideo();
            return true;
          }

          if (request.type === 'createSession') {
            console.log('videoID', request.data.videoId);
            socket.emit('createSession', {
              controlLock: request.data.controlLock,
              videoId: request.data.videoId,
              host: location.host,
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
              console.log('sessionID from server', sessionId);
              pushTask(broadcast(false));
              sendResponse({
                sessionId: sessionId,
              });
            });
            return true;
          }

          if (request.type === 'joinSession') {
            socket.emit('joinSession', request.data.sessionId, function(data) {
              if (data.errorMessage) {
                sendResponse({
                  errorMessage: data.errorMessage,
                });
                return;
              }

              if (data.videoId !== request.data.videoId) {
                socket.emit('leaveSession', null, function(data) {
                  sendResponse({
                    errorMessage: 'That session is for a different video.',
                  });
                });
                return;
              }

              initChat();
              setChatVisible(true);
              sessionId = request.data.sessionId;
              console.log(sessionId);
              lastKnownTime = data.lastKnownTime;
              lastKnownTimeUpdatedAt = new Date(data.lastKnownTimeUpdatedAt);
              messages = [];
              for (let i = 0; i < data.messages.length; i += 1) {
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
        },
    );
  }
})();
