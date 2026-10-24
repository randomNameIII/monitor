# Setting up the wall computer

The goal: the mini computer turns on, opens the display full screen, and never sleeps or shows a screensaver. These steps assume a browser based on Chromium (Chromium, Chrome or Edge), which handles the container-query sizing the panels use. Firefox works too.

Replace `DISPLAY_URL` below with your link, e.g. `https://you.github.io/dusk-board/display.html?gist=abc123`. After the first visit the gist is remembered, so `.../display.html` alone also works.

## Linux (Raspberry Pi OS, Ubuntu, Debian, Mint)

### Start the display at login

Create `~/.config/autostart/dusk.desktop`:

```ini
[Desktop Entry]
Type=Application
Name=Dusk display
Exec=chromium --kiosk --noerrdialogs --disable-infobars --check-for-update-interval=31536000 --disable-session-crashed-bubble DISPLAY_URL
X-GNOME-Autostart-enabled=true
```

On Ubuntu the browser command may be `chromium-browser` or `google-chrome`. On Raspberry Pi OS Bookworm (Wayfire), add the command under `[autostart]` in `~/.config/wayfire.ini` instead:

```ini
[autostart]
dusk = chromium --kiosk --noerrdialogs --disable-infobars DISPLAY_URL
```

### Keep the screen on

- **Raspberry Pi OS**: `sudo raspi-config` → Display Options → Screen Blanking → No.
- **GNOME (Ubuntu)**: Settings → Power → Screen Blank → Never, and Settings → Privacy → Screen Lock → off.
- **X11 generally**: add `xset s off && xset -dpms && xset s noblank` to your autostart.

### Log in automatically

- Raspberry Pi OS: `sudo raspi-config` → System Options → Boot / Auto Login → Desktop Autologin.
- Ubuntu: Settings → Users → Automatic Login.

### Hide the mouse

The display hides the cursor after 3 seconds of no movement. If it still shows on boot, install `unclutter` (`sudo apt install unclutter`) and add `unclutter -idle 1 &` to your autostart.

## Windows

1. Press Win+R, type `shell:startup`, and press Enter.
2. In that folder create a shortcut with this target:
   `"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk DISPLAY_URL`
   (for Edge: `"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --kiosk DISPLAY_URL --edge-kiosk-type=fullscreen`)
3. Settings → System → Power → set Screen and Sleep to **Never**.
4. To sign in automatically, search for "netplwiz" or use Settings → Accounts → Sign-in options, depending on your Windows version.

Press Alt+F4 to leave kiosk mode.

## macOS

1. System Settings → Lock Screen: set "Turn display off" to Never; Energy: prevent automatic sleeping.
2. System Settings → General → Login Items → add an Automator app or shell script that runs:
   `open -a "Google Chrome" --args --kiosk DISPLAY_URL`

## Tips

- **Resolution**: set the same resolution in the editor's Board tab as the monitor uses (1080p is the default). The board scales to fit regardless, but matching avoids empty bars at the edges. Choose "portrait" if the monitor hangs vertically.
- **Brightness**: night dimming lowers what the page draws, not the backlight. For a bedroom, also turn the monitor's own brightness down.
- **Slow computer?** In the Board tab, lower "Frames per second" to 10–12 or pick the "None" background. Panels themselves cost almost nothing.
- **Changes not showing up?** Look at the dot in the bottom-right corner. Red means the display couldn't reach GitHub; hover the corner with a mouse to see why. Press `r` to reload.
- **Starting fresh**: open `display.html?reset` to forget the saved gist and cached board.
