# ChromeSync

## Features
1. Chrome tab sync - Have a chrome window that completely syncs all tabs.
2. Scroll Location sync - in every tab
3. Pointer location for connected users
4. Selection Highlighting
5. Username and avatar in chrome cache
6. AudioCall

``` javascript

tabdetails:{
  url,
  scrolllocation,
  pointers:[
    {
        userId:{x:32,y:34}
    }
  ],
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

```