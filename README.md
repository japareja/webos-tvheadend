# webos-tvheadend
* This is a WebOS Client for TVHeadend
* It can currently only be installed using the Developer App or Homebrew
* The design is similiar to the famous Media Center Kodi
* It is tested on WebOS 3,4 and 5
* It uses react but most components use the canvas 2d api to improve performance on older TVs

## Setup
![Setup](screenshots/setup_verification.png?raw=true "Setup Verification")
## Channel list
![Channel List](screenshots/channellist.png?raw=true "Channel List")
## Channel list with details
![Channel List Details](screenshots/channellist_details.png?raw=true "Channel List Details")
## EPG
![EPG](screenshots/epg.png?raw=true "EPG")
## Current Channel info
![Infobar](screenshots/infobar.png?raw=true "Infobar")
## Menu
![Menü](screenshots/menu.png?raw=true "Menü")

## Build
Every push is linted, tested, built and packaged by GitHub Actions, the `.ipk` can be downloaded from the workflow run.

```s
npm run lint
npm run typecheck
npm test
```

Normal build without webos running
* TVGuides.js:getNow() needs to return 1607462851000 as mock timestamp for now
* TVHDataService:constructor() needs to use MockServiceAdapter instead of LunaServiceAdapter
```s
npm run start
```
* Device Setup
```s
name      deviceinfo                    connection  profile
--------  ----------------------------  ----------  -------
emulator  developer@127.0.0.1:6622      ssh         tv
tv        prisoner@192.168.178.22:9922  ssh         tv
```

Deployment to emulator/webos
```s
npm run webos:emu
npm run webos:tv

# for debugging attach to device
ares-inspect -d emulator com.willinux.tvh.app --open
ares-inspect -d tv com.willinux.tvh.app --open
```
## Features
- EPG (next 36 hours, refreshed automatically every 6 hours) with program images
- Channel List with the channel numbers of tvheadend
- Channel groups (tvheadend channel tags) and favorites
- Search for programs in the EPG
- Back to the previous channel
- Automatic reconnect if a stream fails or stalls
- Channels that could not be played in the last hour are dimmed and marked in the channel list and the EPG, P+/P- skips them
- Server status (menu): tuners in use with signal, SNR, bitrate and errors, and the active streams
  (needs a tvheadend user with admin rights)
- Video quality (UHD/HD/SD and resolution) in the channel info
- Audio track and subtitle selection
- Record live tv or plan recordings using EPG
- Play and Manage recordings
- User Authentication: basic and digest (md5, sha256)
- English and Spanish user interface (taken from the TV language)
- The settings are also saved outside of the app, so they survive uninstalling and installing it again
  (where the TV allows it, the setup shows the location)

## Remote control
Live tv:
* **P+ / P-**: next/previous channel of the selected channel group (channels that failed recently are skipped)
* **0-9**: channel number (up to 4 digits)
* **Back**: hide the overlays, if nothing is shown go back to the previous channel
* **Up / Down**: channel list
* **OK**: channel info
* **Red**: record, **Green**: menu (TV, search, recordings, server status, setup), **Yellow**: audio/subtitles, **Blue**: EPG
* **Right**: EPG (the Magic Remote has no physical color buttons)
* **Left**: back to the previous channel, also while the channel info is shown

Channel list:
* **Yellow**: next channel group, hold it to choose from the list of all groups
* **Blue**: add/remove favorite, **Right/Left**: program details
* **Left** (without program details): list of all groups

EPG:
* **Yellow**: next channel group
* **0-9**: move the guide to that channel number (without tuning it), **OK** then tunes the selected channel

## WebOS
Useful links for video playback using webos

* http://webostv.developer.lge.com/develop/app-developer-guide/resuming-media-quickly-mediaoption/
* http://webostv.developer.lge.com/api/web-api/mediaoption-parameter/

## tvheadend

#### API documentation
https://github.com/dave-p/TVH-API-docs/wiki
