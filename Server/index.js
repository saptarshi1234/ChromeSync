/* eslint-disable max-len */
// ////////////////////////////////////////////////////////////////////////
// Configuration                                                        //
// ////////////////////////////////////////////////////////////////////////

// express
const express = require('express');
const app = express();

// socket.io
// eslint-disable-next-line new-cap
const http = require('http').Server(app);
const io = require('socket.io')(http);

// lodash
const lodash = require('lodash');

// request logging
const morgan = require('morgan');
app.use(morgan('short'));

// turn off unnecessary header
app.disable('x-powered-by');

// turn on strict routing
app.enable('strict routing');

// use the X-Forwarded-* headers
app.enable('trust proxy');

// add CORS headers
app.use(function(req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  // eslint-disable-next-line max-len
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Credentials', true);
  next();
});

// ////////////////////////////////////////////////////////////////////////
// State                                                                //
// ////////////////////////////////////////////////////////////////////////
/*
 in-memory store of all the sessions
 the keys are the session IDs (strings)
 the values have the form: {
   id: 'cba82ca5f59a35e6',                                                                // 8 random octets
   ownerId: '3d16d961f67e9792',                                                           // id of the session owner (if any)
   userIds: ['3d16d961f67e9792', ...,],                                                    // ids of the users in the session
   activeTabs: [
     {
     id:5,
     url:"http:a.com/",
     scrollLocation : {x:12,y:34},
     pointers: [
       {
         userId: <16_digit>,
         pointerLocation: {x:27, y:123}
       },

     ]
    }
  ],

 }
*/
let sessions = {};
/*
 in-memory store of all the users
 the keys are the user IDs (strings)
 the values have the form: {
   id: '3d16d961f67e9792',        // 8 random octets
   sessionId: 'cba82ca5f59a35e6', // id of the session, if one is joined
   socket: <websocket>,           // the websocket
 }
  */
let users = {};

// generate a random ID with 64 bits of entropy
// eslint-disable-next-line require-jsdoc
function makeId() {
  let result = '';
  const hexChars = '0123456789abcdef';
  for (let i = 0; i < 16; i += 1) {
    result += hexChars[Math.floor(Math.random() * 16)];
  }
  return result;
}

// ////////////////////////////////////////////////////////////////////////
// Web endpoints                                                        //
// ////////////////////////////////////////////////////////////////////////

// health check
app.get('/healthz', function(req, res) {
  res.setHeader('Content-Type', 'text/plain');
  res.send('OK');
});

// number of sessions
app.get('/number-of-sessions', function(req, res) {
  res.setHeader('Content-Type', 'text/plain');
  res.send(String(Object.keys(sessions).length));
});

// number of users
app.get('/number-of-users', function(req, res) {
  res.setHeader('Content-Type', 'text/plain');
  res.send(String(Object.keys(users).length));
});

app.get('/session-details', function(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(sessions));
});

app.post('/reset', function(req, res) {
  sessions={};
  users={};
  res.status(200).send();
});

// ////////////////////////////////////////////////////////////////////////
// Websockets API                                                       //
// ////////////////////////////////////////////////////////////////////////

io.on('connection', function(socket) {
  let userId = makeId();
  while (users.hasOwnProperty(userId)) {
    userId = makeId();
  }
  users[userId] = {
    id: userId,
    sessionId: null,
    socket: socket,
  };
  socket.emit('userId', userId);
  console.log('User ' + userId + ' connected.');

  // precondition: user userId is in a session
  const leaveSession = function(broadcast) {
    const sessionId = users[userId].sessionId;
    lodash.pull(sessions[sessionId].userIds, userId);
    users[userId].sessionId = null;

    if (sessions[sessionId].userIds.length === 0) {
      delete sessions[sessionId];
      console.log('Session ' + sessionId + ' was deleted because there were no more users in it.');
    } else {
      if (broadcast) {
        broadcastPresence(sessionId, null);
      }
    }
  };


  socket.on('createSession', function(data, fn) {
    if (!users.hasOwnProperty(userId)) {
      fn({errorMessage: 'Disconnected.'});
      console.log('The socket received a message after it was disconnected.');
      return;
    }

    let sessionId = makeId();
    while (sessions.hasOwnProperty(sessionId)) {
      sessionId = makeId();
    }
    const session = {
      id: sessionId,
      ownerId: userId,
      userIds: [userId],
      activeTabs: [],
    };

    sessions[sessionId] = session;
    fn({sessionId});
  });

  socket.on('joinSession', function(sessionId, fn) {
    if (!users.hasOwnProperty(userId)) {
      fn({errorMessage: 'Disconnected.'});
      console.log('The socket received a message after it was disconnected.');
      return;
    }

    if (!sessions.hasOwnProperty(sessionId)) {
      fn({errorMessage: 'Invalid session ID.'});
      console.log('User ' + userId + ' attempted to join nonexistent session ' + JSON.stringify(sessionId) + '.');
      return;
    }

    if (users[userId].sessionId !== null) {
      fn({errorMessage: 'Already in a session.'});
      console.log('User ' + userId + ' attempted to join session ' + sessionId + ', but the user is already in session ' + users[userId].sessionId + '.');
      return;
    }

    users[userId].sessionId = sessionId;
    sessions[sessionId].userIds.push(userId);
  });

  socket.on('leaveSession', function(_, fn) {
    if (!users.hasOwnProperty(userId)) {
      fn({errorMessage: 'Disconnected.'});
      console.log('The socket received a message after it was disconnected.');
      return;
    }

    if (users[userId].sessionId === null) {
      fn({errorMessage: 'Not in a session.'});
      console.log('User ' + userId + ' attempted to leave a session, but the user was not in one.');
      return;
    }

    const sessionId = users[userId].sessionId;
    leaveSession(true);

    fn(null);
    console.log('User ' + userId + ' left session ' + sessionId + '.');
  });

  socket.on('updateSession', function(data, fn) {
    if (!users.hasOwnProperty(userId)) {
      fn({errorMessage: 'Disconnected.'});
      console.log('The socket received a message after it was disconnected.');
      return;
    }

    if (users[userId].sessionId === null) {
      fn({errorMessage: 'Not in a session.'});
      console.log('User ' + userId + ' attempted to update a session, but the user was not in one.');
      return;
    }
  });

  socket.on('disconnect', function() {
    if (!users.hasOwnProperty(userId)) {
      console.log('The socket received a message after it was disconnected.');
      return;
    }

    if (users[userId].sessionId !== null) {
      leaveSession(true);
    }
    delete users[userId];
    console.log('User ' + userId + ' disconnected.');
  });
});


const server = http.listen(process.env.PORT || 3000, function() {
  console.log('Listening on port %d.', server.address().port);
});
