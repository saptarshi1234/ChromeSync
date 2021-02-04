# ChromeSync

A chrome extension to assist online collaborative research on the web.

## Motivation

Due to the online scenario, group study/research has become much difficult than ever. Earlier people could just get into a room and sit together with their laptops and discuss whatever they wanted to. Now even though we have video conferencing tools available that allow screen share, one must admit that continuously switching the presenter in such a session is a tedious task and quickly becomes unfeasible.

## What did we do
To solve this problem we developed **ChromeSync** - a chrome extension to assist online collaborative research. With this extension one can create a session to share their chrome tabs, then using a invite-code others can join that session. When users join a session, a new window is created ensuring that all tabs are in complete sync for all the participants. Whenever the URL in a tab is changed the change is reflected to everyone. Similarly when a new tab is created or an existing tab destroyed, the same is reflected on every participant's chrome window.

*But wait*, there is more to it, since just syncing the tabs with their URL's doesn't really help. So we also introduced **scroll sync**, which ensures that the scroll location on every page is synced for the entire session. Apart from this we also provide **pointers** displaying the mouse location of every other participant, which helps in collaboration. 

**Note:** For a given session only one chrome window is synced so the users can still work on something personal in other chrome windows.

## Proposed Features
- [x] Chrome tab sync - Have a chrome window that completely syncs all tabs.
- [x] Scroll Location sync - in every tab
- [x] Pointer location for connected users with random colors
- [ ] Selection Highlighting
- [ ] Username and avatar customization.
- [ ] AudioCall functionality

## Usage

Clone the repo and turn on developer mode in chrome extensions and click on `Load Unpacked` and select the folder for this repo. The extension will be loaded and enjoy your collaborative sessions :).

## Tech Stack
1. [NodeJs](https://nodejs.org/)
2. [SocketIO](https://socket.io/)
3. [Chrome Extension API](https://developer.chrome.com/docs/extensions/)

## Developers
1. [Harsh Agrawal](https://github.com/Harsh14901/)
2. [Saptarshi Dasgupta](https://github.com/saptarshi1234/)

For any bugs feel free to report it on [Issues](https://github.com/saptarshi1234/ChromeSync/issues), we will try to resolve it as soon as possible.

Thanks
