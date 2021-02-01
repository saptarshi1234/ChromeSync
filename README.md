# ChromeSync

## Features
1. Chrome tab sync - Have a chrome window that completely syncs all tabs.
2. Scroll Location sync - in every tab
3. Pointer location for connected users
4. Selection Highlighting
5. Username and avatar in chrome cache
6. AudioCall

``` javascript

tabdetail:{
  url: 'http://asda',
  scrolllocation : {x:12, y:34},
  pointers: {
    userId : {x:12, y:34}
  }
}
events :{
  joinsession   : sessionId, 
                : returns {id: ...tabdetail}
  createsession : ...tabdetail
                : returns sessionId
  leavesession  : sessionId
                :
  newtab        : id
                : ;
  closetab      : id
                : ;
  updatetab     : id,tabdetail
                : ;
}

/*
 in-memory store of all the sessions
 the keys are the session IDs (strings)
 the values have the form:
 id:  {
   id: 'cba82ca5f59a35e6',                                                                // 8 random octets
   ownerId: '3d16d961f67e9792',                                                           // id of the session owner (if any)
   userIds: ['3d16d961f67e9792', ...,],                                                    // ids of the users in the session
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

 }
*/
/*
 in-memory store of all the users
 the keys are the user IDs (strings)
 the values have the form: {
   id: '3d16d961f67e9792',        // 8 random octets
   sessionId: 'cba82ca5f59a35e6', // id of the session, if one is joined
   socket: <websocket>,           // the websocket
 }
  */


```