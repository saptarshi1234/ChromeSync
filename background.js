'use strict';

// only load for URLs that match www.netflix.com/watch/*
chrome.runtime.onInstalled.addListener(function(details) {
  chrome.declarativeContent.onPageChanged.removeRules(undefined, function() {
    chrome.declarativeContent.onPageChanged.addRules([{
      conditions: [
        new chrome.declarativeContent.PageStateMatcher({
          pageUrl: {
            hostEquals: 'www.youtube.com',
            pathPrefix: '/watch',
            schemes: ['http', 'https']
          }
        }),
        new chrome.declarativeContent.PageStateMatcher({
          pageUrl: {
            hostEquals: 'fmovies.co',
            pathPrefix: '/film',
            schemes: ['http', 'https']
          }
        }),
        new chrome.declarativeContent.PageStateMatcher({
          pageUrl: {
            schemes: ['http', 'https']
          }
        })
      ],
      actions: [new chrome.declarativeContent.ShowPageAction()]
    }]);
  });
});
